import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env.ts";

/**
 * ذخیره‌سازی فایل‌های صوتی روی دیسک.
 * قانون اصلی: صدا هرگز نباید گم شود. نوشتن اتمیک (temp + fsync + rename) و حذف فقط از طریق DELETE /recordings/:id.
 */

export const SUPPORTED_FORMATS = ["aac", "m4a", "mp3", "wav", "ogg", "webm", "flac", "aiff"] as const;
export type AudioFormat = (typeof SUPPORTED_FORMATS)[number];

const MIME_BY_FORMAT: Record<string, string> = {
  aac: "audio/aac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  aiff: "audio/aiff",
};

export const mimeForFormat = (format: string) => MIME_BY_FORMAT[format] ?? "application/octet-stream";

const EXT_MAP: Record<string, AudioFormat> = {
  aac: "aac",
  adts: "aac",
  "3gp": "aac",
  "3gpp": "aac",
  m4a: "m4a",
  mp4: "m4a",
  m4b: "m4a",
  mp3: "mp3",
  mpeg: "mp3",
  mpga: "mp3",
  wav: "wav",
  wave: "wav",
  "x-wav": "wav",
  ogg: "ogg",
  oga: "ogg",
  opus: "ogg",
  webm: "webm",
  flac: "flac",
  "x-flac": "flac",
  aif: "aiff",
  aiff: "aiff",
  "x-aiff": "aiff",
  "x-m4a": "m4a",
  "x-aac": "aac",
};

/** تشخیص فرمت از روی بایت‌های ابتدایی فایل (مطمئن‌ترین روش). */
function sniff(b: Uint8Array): AudioFormat | null {
  if (b.length < 12) return null;
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (ascii(4, 4) === "ftyp") return "m4a";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "wav";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "FORM" && (ascii(8, 4) === "AIFF" || ascii(8, 4) === "AIFC")) return "aiff";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (ascii(0, 3) === "ID3") return "mp3";
  if (b[0] === 0xff && (b[1]! & 0xf6) === 0xf0) return "aac"; // ADTS syncword, layer 00
  if (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return "mp3"; // MPEG audio frame sync
  return null;
}

export function detectFormat(head: Uint8Array, fileName?: string, mime?: string): AudioFormat {
  const sniffed = sniff(head);
  if (sniffed) return sniffed;
  const ext = fileName?.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  const sub = (mime ?? "").toLowerCase().split(";")[0]!.split("/")[1]?.trim() ?? "";
  if (sub && EXT_MAP[sub]) return EXT_MAP[sub];
  return "aac"; // پیش‌فرض ضبط اندروید
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isSafeId = (id: string) => SAFE_ID.test(id);

export const recordingDir = (recordingId: string) => path.join(env.STORAGE_DIR, "recordings", recordingId);

/** مسیر نسبی (نسبت به STORAGE_DIR) که در دیتابیس ذخیره می‌شود. */
export const segmentRelPath = (recordingId: string, index: number, format: string) =>
  path.join("recordings", recordingId, `${String(index).padStart(5, "0")}.${format}`);

export const absPath = (rel: string) => (path.isAbsolute(rel) ? rel : path.join(env.STORAGE_DIR, rel));

export async function fileExists(rel: string): Promise<boolean> {
  try {
    const st = await fs.stat(absPath(rel));
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

/** نوشتن اتمیک: فایل موقت → fsync → rename → fsync پوشه. */
export async function writeFileAtomic(rel: string, data: Uint8Array): Promise<void> {
  const target = absPath(rel);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  try {
    const dh = await fs.open(dir, "r");
    try {
      await dh.sync();
    } finally {
      await dh.close();
    }
  } catch {
    // fsync روی پوشه در برخی سیستم‌ها پشتیبانی نمی‌شود؛ مشکلی نیست.
  }
}

export async function deleteRecordingFiles(recordingId: string): Promise<void> {
  if (!isSafeId(recordingId)) return;
  await fs.rm(recordingDir(recordingId), { recursive: true, force: true });
}

export async function ensureStorage(): Promise<void> {
  await fs.mkdir(path.join(env.STORAGE_DIR, "recordings"), { recursive: true });
}
