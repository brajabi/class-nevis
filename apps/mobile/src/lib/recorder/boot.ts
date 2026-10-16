/**
 * Startup: load the manifest, recover anything a crash/kill left behind, start the upload queue.
 *
 * Recovery rules (nothing is ever deleted here):
 * - every audio file named `<recordingId>_<index>.<ext>` in the recorder temp dirs is moved to
 *   recordings/<id>/ and registered (this includes the segment that was being recorded when the
 *   app died — ADTS AAC on Android stays decodable up to the last written frame)
 * - every `<index>.<ext>` inside recordings/<id>/ that the manifest doesn't know is registered
 * - recording dirs unknown to the manifest are rebuilt from meta.json (or file dates)
 * - recordings still marked 'recording' become 'interrupted'
 */
import { estimateDurationMs } from './constants';
import {
  FINAL_FILE_RE,
  RECORDER_FILE_RE,
  fileKey,
  fileStat,
  listDirs,
  listFiles,
  moveToFinal,
  recorderTempDirs,
  recordingDir,
  recordingsRoot,
} from './paths';
import {
  getActiveSession,
  getManifestRecordings,
  loadManifest,
  readMeta,
  replaceRecordings,
  writeRecordingMeta,
  type LocalRecording,
  type LocalSegment,
} from './store';
import { startSyncEngine } from './sync';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let booted: Promise<void> | null = null;

export function bootRecordingSystem(): Promise<void> {
  booted ??= (async () => {
    await loadManifest();
    try {
      await recover();
    } catch (e) {
      console.warn('[boot] recovery failed (data left untouched)', e);
    }
    startSyncEngine();
  })();
  return booted;
}

function isoFromMtime(mtime: number | null | undefined): string {
  if (!mtime) return new Date().toISOString();
  // expo-file-system reports ms; guard against seconds just in case
  return new Date(mtime < 1e12 ? mtime * 1000 : mtime).toISOString();
}

function newRecoveredRecording(id: string, startedAtHint: string): LocalRecording {
  const meta = readMeta(id);
  const startedAt = meta?.startedAt ?? startedAtHint;
  return {
    id,
    title: meta?.title ?? 'ضبط بازیابی‌شده',
    startedAt,
    status: 'interrupted',
    segments: [],
    serverSynced: false,
    serverCreated: false,
    rev: 1,
    syncedRev: 0,
  };
}

function recoveredSegment(index: number, uri: string, size: number): LocalSegment {
  return { index, uri, sizeBytes: size, durationMs: estimateDurationMs(size), estimated: true, uploaded: false };
}

async function recover() {
  // work on a deep-ish copy, commit once
  const recs: Record<string, LocalRecording> = {};
  for (const [id, r] of Object.entries(getManifestRecordings())) recs[id] = { ...r, segments: r.segments.map((s) => ({ ...s })) };
  const active = getActiveSession();
  let changed = false;
  const touch = (r: LocalRecording) => {
    r.rev += 1; // something the server should learn about (status / new audio)
    changed = true;
  };

  const knownUris = () => {
    const set = new Set<string>();
    for (const r of Object.values(recs)) for (const s of r.segments) set.add(fileKey(s.uri));
    return set;
  };

  // 1) files left in the recorder temp dirs (in-progress segment at crash time + failed moves)
  let known = knownUris();
  for (const dir of recorderTempDirs()) {
    for (const f of listFiles(dir)) {
      const m = RECORDER_FILE_RE.exec(f.name);
      if (!m) continue;
      const id = m[1].toLowerCase();
      const index = Number(m[2]);
      const st = fileStat(f.uri);
      if (st.size === 0) continue;
      let r = recs[id];
      if (!r) {
        r = recs[id] = newRecoveredRecording(id, isoFromMtime(st.mtime));
        changed = true;
      }
      const existing = r.segments.find((s) => s.index === index);
      if (existing && fileKey(existing.uri) === fileKey(f.uri)) {
        // registered but never moved (crash during rotation) → move now
        const uri = await moveToFinal(id, index, f.uri);
        existing.uri = uri;
        existing.pendingMove = false;
        existing.sizeBytes = fileStat(uri).size || existing.sizeBytes;
        changed = true;
        continue;
      }
      if (known.has(fileKey(f.uri))) continue;
      // unknown file: move it home and register it (under a free index if needed)
      let idx = index;
      if (existing) {
        idx = Math.max(...r.segments.map((s) => s.index)) + 1;
      }
      const uri = await moveToFinal(id, idx, f.uri);
      r.segments.push(recoveredSegment(idx, uri, fileStat(uri).size || st.size));
      touch(r);
    }
  }

  // 2) files inside recordings/<id>/ the manifest doesn't know (and unknown recording dirs)
  known = knownUris();
  for (const dir of listDirs(recordingsRoot())) {
    const id = dir.name.replace(/\/$/, '').toLowerCase();
    if (!UUID_RE.test(id)) continue;
    const files = listFiles(recordingDir(id));
    for (const f of files) {
      const m = FINAL_FILE_RE.exec(f.name) ?? /^(\d+)_\d+\.(aac|m4a)$/i.exec(f.name);
      if (!m || known.has(fileKey(f.uri))) continue;
      const st = fileStat(f.uri);
      if (st.size === 0) continue;
      let r = recs[id];
      if (!r) {
        r = recs[id] = newRecoveredRecording(id, isoFromMtime(st.mtime));
        changed = true;
      }
      let idx = Number(m[1]);
      const same = r.segments.find((s) => s.index === idx);
      if (same && !fileStat(same.uri).exists) {
        // moved but the manifest still pointed at the old place (crash right after the move)
        same.uri = f.uri;
        same.sizeBytes = st.size;
        same.pendingMove = false;
        changed = true;
        continue;
      }
      if (same) idx = Math.max(...r.segments.map((s) => s.index)) + 1;
      r.segments.push(recoveredSegment(idx, f.uri, st.size));
      touch(r);
    }
  }

  // 3) consistency pass
  for (const r of Object.values(recs)) {
    r.segments.sort((a, b) => a.index - b.index);
    for (const s of r.segments) {
      if (s.pendingMove) {
        s.pendingMove = false;
        changed = true;
      }
      if (!s.uploaded) {
        const st = fileStat(s.uri);
        if (st.exists && st.size !== s.sizeBytes) {
          s.sizeBytes = st.size;
          changed = true;
        }
      }
    }
    if (r.status === 'recording') {
      // nothing can be recording at boot: the app was killed / crashed mid-class
      r.status = 'interrupted';
      const lastFile = r.segments.length ? fileStat(r.segments[r.segments.length - 1].uri) : null;
      r.endedAt = lastFile?.mtime ? isoFromMtime(lastFile.mtime) : new Date().toISOString();
      touch(r);
    }
    if (!readMeta(r.id)) writeRecordingMeta(r);
  }

  if (active) changed = true;
  if (changed) await replaceRecordings(recs, null);
}
