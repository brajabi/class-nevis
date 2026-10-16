/**
 * Upload queue: pushes every local segment that is not on the server yet.
 *
 * Guarantees:
 * - single-flight (one run at a time; requests during a run schedule one more run)
 * - never gives up, never deletes anything; per-segment exponential backoff
 * - the server is idempotent on (recordingId, index), so re-uploading is always safe
 */
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';
import { useSyncExternalStore } from 'react';

import { api, ApiError } from '@/lib/api';
import type { RecordingStatus } from '@/lib/types';

import { mimeForUri } from './constants';
import { fileStat } from './paths';
import {
  getActiveSession,
  getLocalRecording,
  getLocalRecordingsList,
  markServerCreated,
  markServerSynced,
  resetBackoff,
  subscribeStore,
  updateSegment,
  type LocalRecording,
  type LocalSegment,
} from './store';

export interface SyncStatus {
  /** segments stored on the phone that are not on the server yet */
  pending: number;
  uploading: boolean;
  current: { recordingId: string; index: number } | null;
  lastError: string | null;
  /** device network state (expo-network) */
  online: boolean;
  /** result of the last request to our server; null = unknown yet */
  serverReachable: boolean | null;
}

let status: SyncStatus = { pending: 0, uploading: false, current: null, lastError: null, online: true, serverReachable: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

function countPending(): number {
  let n = 0;
  for (const r of getLocalRecordingsList()) for (const s of r.segments) if (!s.uploaded) n++;
  return n;
}

const backoffMs = (attempts: number, network: boolean) =>
  Math.min(2000 * 2 ** Math.max(0, attempts - 1), network ? 60_000 : 5 * 60_000);

/** Deleted while a run was in flight → must not be recreated on the server. */
const deletedIds = new Set<string>();
export function forgetRecordingInSync(id: string) {
  deletedIds.add(id);
}
/** Undo forgetRecordingInSync (user cancelled the delete). */
export function allowRecordingInSync(id: string) {
  deletedIds.delete(id);
}

let running = false;
let again = false;

export function requestSync(opts: { resetBackoff?: boolean } = {}) {
  if (opts.resetBackoff) void resetBackoff();
  if (running) {
    again = true;
    return;
  }
  void run();
}

async function run() {
  running = true;
  try {
    do {
      again = false;
      await runOnce();
    } while (again);
  } finally {
    running = false;
    setStatus({ uploading: false, current: null, pending: countPending() });
  }
}

class NetworkDown extends Error {}

async function runOnce() {
  // oldest first so classes reach the server in the order they happened
  const recordings = getLocalRecordingsList().slice().reverse();
  for (const snapshot of recordings) {
    if (deletedIds.has(snapshot.id)) continue;
    try {
      await syncRecording(snapshot.id);
    } catch (e) {
      if (e instanceof NetworkDown) return; // server unreachable: stop this run, the timer/listeners retry
      console.warn('[sync] recording failed', snapshot.id, e);
    }
  }
}

function isNetworkError(e: unknown) {
  return e instanceof ApiError && e.status === 0;
}

function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function ensureServerRecording(r: LocalRecording) {
  if (r.serverCreated) return;
  await api.upsertRecording(r.id, { title: r.title, startedAt: r.startedAt, tags: r.tags ?? [] });
  setStatus({ serverReachable: true });
  await markServerCreated(r.id);
}

async function syncRecording(id: string) {
  let r = getLocalRecording(id);
  if (!r) return;
  const toUpload = r.segments.filter((s) => !s.uploaded && !s.pendingMove);
  const now = Date.now();
  const due = toUpload.filter((s) => !s.nextAttemptAt || s.nextAttemptAt <= now);

  try {
    if (due.length || !r.serverSynced) await ensureServerRecording(r);
  } catch (e) {
    handleError(e);
    if (isNetworkError(e)) throw new NetworkDown();
    return;
  }

  for (const seg of due) {
    if (deletedIds.has(id)) return;
    await uploadOne(id, seg);
  }

  // Push title/status once everything that exists locally is on the server (or immediately for
  // a title change while still recording).
  r = getLocalRecording(id);
  if (!r || r.serverSynced || deletedIds.has(id)) return;
  const finished = r.status !== 'recording' && getActiveSession()?.recordingId !== id;
  const allUploaded = r.segments.every((s) => s.uploaded);
  if (finished && !allUploaded) return;
  const rev = r.rev;
  const body: { title: string; tags: string[]; status?: RecordingStatus; endedAt?: string } = { title: r.title, tags: r.tags ?? [] };
  if (finished) {
    body.status = r.status === 'interrupted' ? 'INTERRUPTED' : 'COMPLETE';
    if (r.endedAt) body.endedAt = r.endedAt;
  }
  try {
    await api.patchRecording(id, body);
    setStatus({ serverReachable: true, lastError: null });
    await markServerSynced(id, rev);
  } catch (e) {
    handleError(e);
    if (isNetworkError(e)) throw new NetworkDown();
  }
}

async function uploadOne(id: string, seg: LocalSegment) {
  const st = fileStat(seg.uri);
  if (!st.exists || st.size === 0) {
    // Should never happen; keep the entry (never drop data silently) and back off.
    await updateSegment(id, seg.index, {
      lastError: 'فایل صدا روی گوشی پیدا نشد',
      attempts: (seg.attempts ?? 0) + 1,
      nextAttemptAt: Date.now() + backoffMs((seg.attempts ?? 0) + 1, false),
    });
    return;
  }
  setStatus({ uploading: true, current: { recordingId: id, index: seg.index } });
  const name = seg.uri.split('/').pop() ?? `${seg.index}.aac`;
  try {
    await api.uploadSegment(id, seg.index, Math.round(seg.durationMs), { uri: seg.uri, name, type: mimeForUri(seg.uri) });
    await updateSegment(id, seg.index, {
      uploaded: true,
      uploadedAt: new Date().toISOString(),
      lastError: undefined,
      attempts: 0,
      nextAttemptAt: undefined,
    });
    setStatus({ serverReachable: true, lastError: null, pending: countPending() });
  } catch (e) {
    console.warn('[sync] upload failed', id, seg.index, seg.uri, errMessage(e));
    const attempts = (seg.attempts ?? 0) + 1;
    const net = isNetworkError(e);
    await updateSegment(id, seg.index, {
      lastError: errMessage(e),
      attempts,
      nextAttemptAt: Date.now() + backoffMs(attempts, net),
    });
    handleError(e);
    if (net) throw new NetworkDown();
  } finally {
    setStatus({ current: null });
  }
}

function handleError(e: unknown) {
  setStatus({ lastError: errMessage(e), serverReachable: isNetworkError(e) ? false : status.serverReachable });
}

// ---------- triggers ----------
let started = false;

export function startSyncEngine() {
  if (started) {
    requestSync();
    return;
  }
  started = true;
  setStatus({ pending: countPending() });
  subscribeStore(() => {
    const p = countPending();
    if (p !== status.pending) setStatus({ pending: p });
  });

  // every 30s (no-op when nothing is pending)
  setInterval(() => {
    if (countPending() > 0 || hasUnsyncedMeta()) requestSync();
  }, 30_000);

  AppState.addEventListener('change', (s: AppStateStatus) => {
    if (s === 'active') requestSync({ resetBackoff: true });
  });

  try {
    Network.getNetworkStateAsync()
      .then((n) => setStatus({ online: n.isConnected !== false }))
      .catch(() => {});
    Network.addNetworkStateListener((n) => {
      const online = n.isConnected !== false;
      const wasOnline = status.online;
      setStatus({ online });
      if (online && !wasOnline) requestSync({ resetBackoff: true });
    });
  } catch (e) {
    console.warn('[sync] network listener unavailable', e);
  }

  requestSync();
}

function hasUnsyncedMeta() {
  return getLocalRecordingsList().some((r) => !r.serverSynced);
}

// ---------- hook ----------
export function getSyncStatus() {
  return status;
}
export function subscribeSync(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSync, getSyncStatus);
}
