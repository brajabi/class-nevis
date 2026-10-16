/**
 * Durable local store of recordings (the source of truth for audio on the phone).
 *
 * - JSON manifest at Paths.document/classnevis/manifest.json, written atomically
 *   (write temp file → move over the real one). Loading falls back to the temp file.
 * - Each recording dir also gets a tiny meta.json so recordings can be rebuilt even if the
 *   manifest is lost (boot re-scans the audio files themselves).
 * - In-memory cache + subscribe API + React hooks.
 * - Audio files are NEVER deleted here except by an explicit user delete.
 */
import { File } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { appDir, ensureDir, listFiles, recorderTempDirs, recordingDir, RECORDER_FILE_RE } from './paths';

export type LocalRecordingStatus = 'recording' | 'complete' | 'interrupted';

export interface LocalSegment {
  index: number;
  uri: string;
  durationMs: number;
  sizeBytes: number;
  uploaded: boolean;
  uploadedAt?: string;
  lastError?: string;
  /** upload attempts since last success / backoff reset */
  attempts?: number;
  /** epoch ms; the upload queue skips the segment until then */
  nextAttemptAt?: number;
  /** duration was estimated from file size (crash recovery) */
  estimated?: boolean;
  /** file is still in the recorder temp dir and about to be moved; don't upload yet */
  pendingMove?: boolean;
}

export interface LocalRecording {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  status: LocalRecordingStatus;
  segments: LocalSegment[];
  /** true when the server has the latest title/status (rev === syncedRev) */
  serverSynced: boolean;
  /** PUT /recordings/:id done at least once */
  serverCreated: boolean;
  /** bumped on every title/status change that must reach the server */
  rev: number;
  syncedRev: number;
}

/** What is being recorded right now; persisted BEFORE each segment starts. */
export interface ActiveSession {
  recordingId: string;
  segmentIndex: number;
  /** recorder fileName (without extension) for the in-progress segment */
  fileName: string;
  /** uri reported by the recorder after prepare (may be missing if we crashed before that) */
  expectedUri?: string;
  segmentStartedAt: string;
}

interface Manifest {
  version: 1;
  recordings: Record<string, LocalRecording>;
  active: ActiveSession | null;
}

let manifest: Manifest = { version: 1, recordings: {}, active: null };
let loaded = false;
const listeners = new Set<() => void>();
let listCache: LocalRecording[] | null = null;

const manifestFile = () => new File(appDir(), 'manifest.json');
const tempFile = () => new File(appDir(), 'manifest.tmp.json');

function parse(text: string): Manifest | null {
  try {
    const m = JSON.parse(text);
    if (m && typeof m === 'object' && m.recordings && typeof m.recordings === 'object') {
      return { version: 1, recordings: m.recordings, active: m.active ?? null };
    }
  } catch {}
  return null;
}

export async function loadManifest(): Promise<void> {
  if (loaded) return;
  ensureDir(appDir());
  let m: Manifest | null = null;
  for (const f of [manifestFile(), tempFile()]) {
    try {
      if (f.exists) m = parse(f.textSync());
    } catch (e) {
      console.warn('[store] read failed', f.uri, e);
    }
    if (m) break;
  }
  if (m) {
    // normalize older/partial records
    for (const r of Object.values(m.recordings)) {
      r.segments = (r.segments ?? []).slice().sort((a, b) => a.index - b.index);
      r.rev ??= 1;
      r.syncedRev ??= r.serverSynced ? r.rev : 0;
      r.serverCreated ??= false;
      r.serverSynced = r.rev === r.syncedRev;
    }
    manifest = m;
  }
  loaded = true;
  emit();
}

function emit() {
  listCache = null;
  listeners.forEach((l) => l());
}

// ---------- atomic, coalesced persistence ----------
let writeChain: Promise<void> = Promise.resolve();
let dirty = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function writeNow() {
  if (!dirty) return;
  dirty = false;
  const text = JSON.stringify(manifest);
  try {
    ensureDir(appDir());
    const tmp = tempFile();
    if (!tmp.exists) tmp.create({ intermediates: true, overwrite: true });
    await tmp.write(text);
    await tmp.move(manifestFile(), { overwrite: true });
  } catch (e) {
    console.warn('[store] manifest write failed, retrying', e);
    dirty = true;
    if (!retryTimer)
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void persist();
      }, 1000);
  }
}

/** Resolves once the current in-memory state (or a newer one) is on disk (or the attempt failed). */
export function persist(): Promise<void> {
  dirty = true;
  writeChain = writeChain.then(writeNow, writeNow);
  return writeChain;
}

function commit(next: Manifest): Promise<void> {
  manifest = next;
  emit();
  return persist();
}

function writeMeta(r: Pick<LocalRecording, 'id' | 'title' | 'startedAt'>) {
  try {
    const dir = recordingDir(r.id);
    ensureDir(dir);
    const f = new File(dir, 'meta.json');
    if (!f.exists) f.create({ overwrite: true });
    f.write(JSON.stringify({ id: r.id, title: r.title, startedAt: r.startedAt })).catch(() => {});
  } catch {}
}

export function readMeta(id: string): { title?: string; startedAt?: string } | null {
  try {
    const f = new File(recordingDir(id), 'meta.json');
    if (!f.exists) return null;
    return JSON.parse(f.textSync());
  } catch {
    return null;
  }
}

// ---------- reads ----------
export function getManifestRecordings(): Record<string, LocalRecording> {
  return manifest.recordings;
}
export function getLocalRecording(id: string): LocalRecording | undefined {
  return manifest.recordings[id];
}
export function getActiveSession(): ActiveSession | null {
  return manifest.active;
}
export function getLocalRecordingsList(): LocalRecording[] {
  if (!listCache) {
    listCache = Object.values(manifest.recordings).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }
  return listCache;
}
export function subscribeStore(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ---------- writes ----------
function withRecording(id: string, fn: (r: LocalRecording) => LocalRecording): Promise<void> {
  const r = manifest.recordings[id];
  if (!r) return Promise.resolve();
  const next = fn(r);
  next.serverSynced = next.rev === next.syncedRev;
  return commit({ ...manifest, recordings: { ...manifest.recordings, [id]: next } });
}

export function createLocalRecording(input: { id: string; title: string; startedAt: string; status?: LocalRecordingStatus; endedAt?: string }) {
  const r: LocalRecording = {
    id: input.id,
    title: input.title,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: input.status ?? 'recording',
    segments: [],
    serverSynced: false,
    serverCreated: false,
    rev: 1,
    syncedRev: 0,
  };
  writeMeta(r);
  return commit({ ...manifest, recordings: { ...manifest.recordings, [r.id]: r } });
}

export function setActiveSession(active: ActiveSession | null) {
  return commit({ ...manifest, active });
}

export function patchActiveSession(patch: Partial<ActiveSession>) {
  if (!manifest.active) return Promise.resolve();
  return commit({ ...manifest, active: { ...manifest.active, ...patch } });
}

/** Adds (or replaces a not-yet-uploaded) segment. An uploaded segment with the same index is kept. */
export function upsertSegment(id: string, seg: LocalSegment) {
  return withRecording(id, (r) => {
    const existing = r.segments.find((s) => s.index === seg.index);
    if (existing?.uploaded && existing.uri === seg.uri) return r;
    const segments = r.segments.filter((s) => s.index !== seg.index).concat(seg).sort((a, b) => a.index - b.index);
    return { ...r, segments };
  });
}

export function updateSegment(id: string, index: number, patch: Partial<LocalSegment>) {
  return withRecording(id, (r) => ({
    ...r,
    segments: r.segments.map((s) => (s.index === index ? { ...s, ...patch } : s)),
  }));
}

/** Changes that must reach the server bump `rev`. */
export function updateRecordingMeta(id: string, patch: Partial<Pick<LocalRecording, 'title' | 'status' | 'endedAt'>>) {
  const p = withRecording(id, (r) => ({ ...r, ...patch, rev: r.rev + 1 }));
  const r = manifest.recordings[id];
  if (r && patch.title !== undefined) writeMeta(r);
  return p;
}

export function renameLocalRecording(id: string, title: string) {
  return updateRecordingMeta(id, { title });
}

export function markServerCreated(id: string) {
  return withRecording(id, (r) => ({ ...r, serverCreated: true }));
}

export function markServerSynced(id: string, rev: number) {
  return withRecording(id, (r) => ({ ...r, serverCreated: true, syncedRev: Math.max(r.syncedRev, rev) }));
}

/** Reset upload backoff (network came back / user asked to retry). */
export function resetBackoff() {
  let changed = false;
  const recordings: Record<string, LocalRecording> = {};
  for (const [id, r] of Object.entries(manifest.recordings)) {
    if (r.segments.some((s) => !s.uploaded && s.nextAttemptAt)) {
      changed = true;
      recordings[id] = { ...r, segments: r.segments.map((s) => (s.uploaded ? s : { ...s, nextAttemptAt: undefined, attempts: 0 })) };
    } else recordings[id] = r;
  }
  if (changed) return commit({ ...manifest, recordings });
  return Promise.resolve();
}

/**
 * Explicit user delete: removes the recording and ALL its audio from the phone. Permanent.
 * Callers must confirm with the user first.
 */
export async function deleteLocalRecording(id: string): Promise<void> {
  if (manifest.active?.recordingId === id) throw new Error('این ضبط در حال انجام است');
  const r = manifest.recordings[id];
  const rest = { ...manifest.recordings };
  delete rest[id];
  await commit({ ...manifest, recordings: rest });
  try {
    const dir = recordingDir(id);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('[store] delete dir failed', e);
  }
  // segment files that may still live in the recorder temp dirs
  for (const s of r?.segments ?? []) {
    try {
      const f = new File(s.uri);
      if (f.exists) f.delete();
    } catch {}
  }
  for (const d of recorderTempDirs()) {
    for (const f of listFiles(d)) {
      const m = RECORDER_FILE_RE.exec(f.name);
      if (m && m[1] === id) {
        try {
          f.delete();
        } catch {}
      }
    }
  }
}

/** Bulk replace used by boot recovery. */
export function replaceRecordings(recordings: Record<string, LocalRecording>, active: ActiveSession | null) {
  for (const r of Object.values(recordings)) r.serverSynced = r.rev === r.syncedRev;
  return commit({ ...manifest, recordings, active });
}

export { writeMeta as writeRecordingMeta };

// ---------- hooks ----------
export function useLocalRecordings(): LocalRecording[] {
  return useSyncExternalStore(subscribeStore, getLocalRecordingsList);
}

export function useLocalRecording(id: string | undefined): LocalRecording | undefined {
  return useSyncExternalStore(subscribeStore, () => (id ? manifest.recordings[id] : undefined));
}

// ---------- derived helpers ----------
export const recordingDurationMs = (r: LocalRecording) => r.segments.reduce((a, s) => a + (s.durationMs || 0), 0);
export const pendingSegments = (r: LocalRecording) => r.segments.filter((s) => !s.uploaded);
export const recordingSizeBytes = (r: LocalRecording) => r.segments.reduce((a, s) => a + (s.sizeBytes || 0), 0);
