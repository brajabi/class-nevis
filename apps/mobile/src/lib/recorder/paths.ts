import { Directory, File, Paths } from 'expo-file-system';

import { SEGMENT_EXT } from './constants';

/** App data (manifest). */
export const appDir = () => new Directory(Paths.document, 'classnevis');
/** Final home of all audio: recordings/<recordingId>/<index padded 5>.<ext> */
export const recordingsRoot = () => new Directory(Paths.document, 'recordings');
export const recordingDir = (id: string) => new Directory(Paths.document, 'recordings', id);

export const segmentFileName = (index: number, ext = SEGMENT_EXT) => `${String(index).padStart(5, '0')}${ext}`;
export const finalSegmentFile = (id: string, index: number, ext = SEGMENT_EXT) =>
  new File(recordingDir(id), segmentFileName(index, ext));

/** Name the native recorder writes to (without extension): deterministic so a crash can be recovered. */
export const recorderFileName = (id: string, index: number) => `${id}_${index}`;
export const RECORDER_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(\d+)\.(aac|m4a)$/i;
export const FINAL_FILE_RE = /^(\d+)\.(aac|m4a)$/i;

/**
 * Where expo-audio writes while recording: `<document|cache>/Audio` on Android and
 * `<document|cache>/ExpoAudio` on iOS. We record into 'document' but scan cache as well.
 */
export const recorderTempDirs = () => [
  new Directory(Paths.document, 'Audio'),
  new Directory(Paths.document, 'ExpoAudio'),
  new Directory(Paths.cache, 'Audio'),
  new Directory(Paths.cache, 'ExpoAudio'),
];

export function ensureDir(dir: Directory) {
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch (e) {
    console.warn('[recorder] ensureDir failed', dir.uri, e);
  }
}

export function fileStat(uri: string | null | undefined): { exists: boolean; size: number; mtime: number | null } {
  if (!uri) return { exists: false, size: 0, mtime: null };
  try {
    const f = new File(uri);
    if (!f.exists) return { exists: false, size: 0, mtime: null };
    return { exists: true, size: f.size ?? 0, mtime: f.modificationTime ?? null };
  } catch {
    return { exists: false, size: 0, mtime: null };
  }
}

/** Lists files (not directories) of a directory; never throws. */
export function listFiles(dir: Directory): File[] {
  try {
    if (!dir.exists) return [];
    return dir.list().filter((x): x is File => x instanceof File);
  } catch {
    return [];
  }
}

export function listDirs(dir: Directory): Directory[] {
  try {
    if (!dir.exists) return [];
    return dir.list().filter((x): x is Directory => x instanceof Directory);
  } catch {
    return [];
  }
}

/**
 * Spelling-independent identity of a file (file:// vs plain path, /data/user/0 vs /data/data,
 * url-encoding): parent dir name + file name. Our names are unique (uuid-based), so this is safe.
 */
export function fileKey(uri: string): string {
  let p = uri;
  try {
    p = decodeURIComponent(uri);
  } catch {}
  const parts = p.replace(/^file:\/\//, '').split('/').filter(Boolean);
  return parts.slice(-2).join('/').toLowerCase();
}

export const baseName = (uri: string) => {
  const parts = uri.split('/').filter(Boolean);
  try {
    return decodeURIComponent(parts[parts.length - 1] ?? '');
  } catch {
    return parts[parts.length - 1] ?? '';
  }
};

export const extOf = (uri: string) => (uri.toLowerCase().endsWith('.m4a') ? '.m4a' : '.aac');

/**
 * Moves a finished segment into recordings/<id>/. Returns the uri the audio now lives at
 * (the original one if the move failed — the file in 'document' is durable either way).
 * Never overwrites an existing file.
 */
export async function moveToFinal(id: string, index: number, srcUri: string): Promise<string> {
  const src = new File(srcUri);
  const dir = recordingDir(id);
  ensureDir(dir);
  let dest = finalSegmentFile(id, index, extOf(srcUri));
  if (dest.uri === src.uri) return srcUri;
  if (dest.exists) dest = new File(dir, `${String(index).padStart(5, '0')}_${Date.now()}${extOf(srcUri)}`);
  const destUri = dest.uri;
  try {
    await src.move(dest);
  } catch (e) {
    console.warn('[recorder] move failed', e);
  }
  // Trust the filesystem, not the promise: whichever path holds (all) the bytes wins.
  const s = fileStat(srcUri);
  const d = fileStat(destUri);
  if (s.exists && s.size >= d.size) return srcUri;
  if (d.exists && d.size > 0) return destUri;
  return srcUri;
}
