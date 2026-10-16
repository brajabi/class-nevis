/**
 * پارس فریم‌های AAC-ADTS در حافظه (بدون تغییر فایل) برای محاسبهٔ مدت و تقسیم به تکه‌ها در مرز فریم.
 */

const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export interface AdtsInfo {
  /** تعداد فریم‌های سالم */
  frames: number;
  durationMs: number;
  /** offset شروع هر فریم */
  offsets: number[];
  /** طول هر فریم (بایت) */
  lengths: number[];
  /** مدت هر فریم (میلی‌ثانیه) */
  frameMs: number[];
}

/** اگر در offset داده‌شده یک هدر ADTS معتبر و کامل باشد، طول فریم و مدت آن را برمی‌گرداند. */
function readHeader(b: Uint8Array, i: number): { len: number; ms: number } | null {
  if (i + 7 > b.length) return null;
  if (b[i] !== 0xff || (b[i + 1]! & 0xf6) !== 0xf0) return null; // sync 0xFFF + layer 00
  const protectionAbsent = b[i + 1]! & 0x01;
  const sfIndex = (b[i + 2]! >> 2) & 0x0f;
  if (sfIndex >= SAMPLE_RATES.length) return null;
  const len = ((b[i + 3]! & 0x03) << 11) | (b[i + 4]! << 3) | (b[i + 5]! >> 5);
  if (len < (protectionAbsent ? 7 : 9)) return null;
  if (i + len > b.length) return null; // فریم ناقص انتهایی
  const blocks = (b[i + 6]! & 0x03) + 1;
  return { len, ms: (1024 * blocks * 1000) / SAMPLE_RATES[sfIndex]! };
}

export function parseAdts(b: Uint8Array): AdtsInfo {
  const offsets: number[] = [];
  const lengths: number[] = [];
  const frameMs: number[] = [];
  let total = 0;
  let i = 0;
  while (i + 7 <= b.length) {
    const h = readHeader(b, i);
    if (!h) {
      i++; // بایت زباله؛ دنبال sync بعدی بگرد
      continue;
    }
    // در حالت resync (بعد از زباله) برای جلوگیری از sync کاذب، فریم بعدی را هم بررسی کن
    const resyncing = offsets.length === 0 || offsets[offsets.length - 1]! + lengths[lengths.length - 1]! !== i;
    if (resyncing && i + h.len + 7 <= b.length && !readHeader(b, i + h.len)) {
      i++;
      continue;
    }
    offsets.push(i);
    lengths.push(h.len);
    frameMs.push(h.ms);
    total += h.ms;
    i += h.len;
  }
  return { frames: offsets.length, durationMs: Math.round(total), offsets, lengths, frameMs };
}

/**
 * تقسیم به تکه‌های حدوداً targetMs در مرز فریم‌ها. تکهٔ آخرِ خیلی کوتاه به تکهٔ قبلی می‌چسبد.
 * خروجی subarray است (کپی نمی‌شود و فایل اصلی دست نمی‌خورد).
 */
export function splitAdts(b: Uint8Array, info: AdtsInfo, targetMs: number, minLastMs = 60_000): Uint8Array[] {
  if (info.frames === 0) return [b];
  const ranges: { start: number; end: number; ms: number }[] = [];
  let startFrame = 0;
  let acc = 0;
  for (let f = 0; f < info.frames; f++) {
    acc += info.frameMs[f]!;
    if (acc >= targetMs || f === info.frames - 1) {
      ranges.push({ start: info.offsets[startFrame]!, end: info.offsets[f]! + info.lengths[f]!, ms: acc });
      startFrame = f + 1;
      acc = 0;
    }
  }
  if (ranges.length > 1 && ranges[ranges.length - 1]!.ms < minLastMs) {
    const last = ranges.pop()!;
    const prev = ranges[ranges.length - 1]!;
    prev.end = last.end;
    prev.ms += last.ms;
  }
  return ranges.map((r) => b.subarray(r.start, r.end));
}
