import { createAudioPlayer } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { ensureDir, recordingDir, segmentFileName } from './paths';
import { createLocalRecording, normalizeTags, upsertSegment } from './store';
import { requestSync } from './sync';

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
  'audio/3gpp': '3gp',
};
const KNOWN_EXT = /\.(aac|m4a|mp3|wav|ogg|oga|opus|flac|webm|amr|3gp|mp4|aiff?)$/i;

function splitName(name: string, mime?: string | null) {
  const m = KNOWN_EXT.exec(name);
  if (m) return { title: name.slice(0, m.index).trim(), ext: m[1]!.toLowerCase() };
  return { title: name.trim(), ext: (mime && EXT_BY_MIME[mime.toLowerCase()]) || 'm4a' };
}

/** Best-effort duration read; 0 if the player can't load it in time (the server fixes it later). */
async function probeDurationMs(uri: string): Promise<number> {
  try {
    const p = createAudioPlayer({ uri });
    const t0 = Date.now();
    while ((!p.isLoaded || !p.duration) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 100));
    const ms = Math.round((p.duration || 0) * 1000);
    p.remove();
    return ms;
  } catch {
    return 0;
  }
}

export interface ImportResult {
  imported: string[];
  failed: string[];
}

/**
 * Lets the user pick audio files from the phone and adds each as a recording.
 * The file is copied into the app's permanent storage first (the original is untouched),
 * then registered and queued for upload like any recorded segment.
 * Returns null when the user cancels the picker.
 */
export async function importAudioFromPhone(tags: string[] = []): Promise<ImportResult | null> {
  // document-picker gives the real display name (the file-system picker only sees an id on Android).
  // We keep the original content:// uri and copy it ourselves straight into permanent storage.
  const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: false });
  if (picked.canceled) return null;

  const out: ImportResult = { imported: [], failed: [] };
  for (const asset of picked.assets) {
    const src = new File(asset.uri);
    const { title, ext } = splitName(asset.name || 'صوت', asset.mimeType);
    try {
      const id = Crypto.randomUUID();
      const dir = recordingDir(id);
      ensureDir(dir);
      const dest = new File(dir, segmentFileName(0, `.${ext}`));
      try {
        await src.copy(dest);
      } catch {
        // some providers (content://) can't be copied directly: read and write the bytes
        dest.write(await src.bytes());
      }
      const size = dest.size ?? 0;
      if (!dest.exists || size === 0) throw new Error('empty copy');

      const mtime = asset.lastModified || src.modificationTime;
      const startedAt = new Date(mtime && mtime > 0 ? mtime : Date.now()).toISOString();
      await createLocalRecording({
        id,
        title: title || 'صوت واردشده',
        startedAt,
        endedAt: startedAt,
        status: 'complete',
        tags: normalizeTags(tags),
      });
      const durationMs = await probeDurationMs(dest.uri);
      await upsertSegment(id, { index: 0, uri: dest.uri, durationMs, sizeBytes: size, uploaded: false });
      out.imported.push(id);
    } catch (e) {
      console.warn('[import] failed', asset.name, e);
      out.failed.push(asset.name || '؟');
    }
  }
  if (out.imported.length) requestSync({ resetBackoff: true });
  return out;
}
