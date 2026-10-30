/**
 * Converts any audio (mp3, m4a, ogg/opus, wav, amr, ...) to mono AAC-ADTS with ffmpeg, so
 * imported files can be split into chunks and transcribed like recorded segments.
 * The stored original is never touched; this works on an in-memory copy.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let available: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const p = Bun.spawn(["ffmpeg", "-version"], { stdout: "ignore", stderr: "ignore" });
    available = (await p.exited) === 0;
  } catch {
    available = false;
  }
  if (!available) console.warn("⚠️  ffmpeg پیدا نشد — تبدیل فایل‌های واردشده برای رونویسی ممکن نیست.");
  return available;
}

export async function toAdts(input: Uint8Array): Promise<Uint8Array | null> {
  if (!(await ffmpegAvailable())) return null;
  // M4A/MP4 can store their moov index AFTER the audio. ffmpeg must seek back
  // after reading that index; stdin is not seekable and fails on these files.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "classnevis-audio-"));
  try {
    const inputPath = path.join(dir, "input");
    await fs.writeFile(inputPath, input);
    const p = Bun.spawn(
      ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-xerror", "-i", inputPath, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-f", "adts", "pipe:1"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; p.kill("SIGKILL"); }, 10 * 60_000);
    try {
      const [out, err, code] = await Promise.all([
        new Response(p.stdout).arrayBuffer(),
        new Response(p.stderr).text(),
        p.exited,
      ]);
      if (timedOut) throw new Error("زمان تبدیل فایل صوتی به پایان رسید");
      if (code !== 0 || out.byteLength === 0) {
        throw new Error(`تبدیل فایل صوتی ناموفق بود (ffmpeg ${code}): ${err.slice(0, 300)}`);
      }
      return new Uint8Array(out);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
