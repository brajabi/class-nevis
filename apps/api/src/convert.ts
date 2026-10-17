/**
 * Converts any audio (mp3, m4a, ogg/opus, wav, amr, ...) to mono AAC-ADTS with ffmpeg, so
 * imported files can be split into chunks and transcribed like recorded segments.
 * The stored original is never touched; this works on an in-memory copy.
 */

let available: boolean | null = null;

export async function ffmpegAvailable(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const p = Bun.spawn(["ffmpeg", "-version"], { stdout: "ignore", stderr: "ignore" });
    available = (await p.exited) === 0;
  } catch {
    available = false;
  }
  if (!available) console.warn("⚠️  ffmpeg پیدا نشد — فایل‌های غیر AAC بدون تبدیل و یک‌جا رونویسی می‌شوند.");
  return available;
}

export async function toAdts(input: Uint8Array): Promise<Uint8Array | null> {
  if (!(await ffmpegAvailable())) return null;
  const p = Bun.spawn(
    ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k", "-f", "adts", "pipe:1"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  // feed stdin while reading stdout, so large files don't deadlock on full pipes
  const writer = (async () => {
    p.stdin.write(input);
    await p.stdin.end();
  })();
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).arrayBuffer(),
    new Response(p.stderr).text(),
    p.exited,
    writer,
  ]);
  if (code !== 0 || out.byteLength === 0) {
    console.warn(`[convert] ffmpeg failed (${code}): ${err.slice(0, 300)}`);
    return null;
  }
  return new Uint8Array(out);
}
