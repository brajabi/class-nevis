import fs from "node:fs/promises";
import { prisma } from "./db.ts";
import { env, openrouterConfigured } from "./env.ts";
import { chatCompletion, isSttModel, speechToText, stripFences } from "./openrouter.ts";
import { absPath } from "./storage.ts";
import { parseAdts, splitAdts } from "./adts.ts";

/**
 * صف رونویسی درون‌پردازه‌ای.
 * منبع حقیقت دیتابیس است (وضعیت PENDING)؛ صف حافظه‌ای فقط زمان‌بندی retry را نگه می‌دارد.
 */

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 15_000;
const POLL_MS = 30_000;

let active = 0;
let pumping = false;
let repump = false;
let warnedNoKey = false;
/** segmentId → زمانی که پیش از آن نباید دوباره تلاش شود */
const notBefore = new Map<string, number>();

const PROMPT = `You are a professional transcriber. The attached audio is a segment of a university or school class lecture, most likely in Persian (Farsi), possibly with English technical terms.

Instructions:
- Produce a faithful, verbatim transcription of everything that is said.
- Write Persian in standard Persian script with correct spelling and natural punctuation (use the Persian comma "،" and proper zero-width non-joiners where appropriate).
- Keep English/technical terms, names, code, and formulas in Latin script exactly as spoken (e.g. "gradient descent", "O(n log n)").
- Mark inaudible or unintelligible parts as [نامفهوم].
- Do not summarize, translate, explain, or add any commentary, headings, labels, timestamps, or speaker names.
- If the audio contains only silence or no intelligible speech, return an empty response.
- Output ONLY the transcript text.`;

export function kick(): void {
  if (pumping) {
    repump = true;
    return;
  }
  void pump();
}

async function pump(): Promise<void> {
  pumping = true;
  try {
    do {
      repump = false;
      if (!openrouterConfigured()) {
        if (!warnedNoKey) {
          warnedNoKey = true;
          console.warn(
            "⚠️  OPENROUTER_API_KEY تنظیم نشده است — رونویسی انجام نمی‌شود و بخش‌ها در وضعیت PENDING می‌مانند. کلید را در apps/api/.env قرار دهید و سرور را دوباره اجرا کنید.",
          );
        }
        return;
      }
      while (active < CONCURRENCY) {
        const seg = await claimNext();
        if (!seg) break;
        active++;
        void processSegment(seg.id).finally(() => {
          active--;
          kick();
        });
      }
    } while (repump);
  } catch (e) {
    console.error("[transcriber] pump error:", e);
  } finally {
    pumping = false;
  }
}

async function claimNext(): Promise<{ id: string } | null> {
  const now = Date.now();
  const candidates = await prisma.segment.findMany({
    where: { transcriptStatus: "PENDING" },
    orderBy: [{ recording: { startedAt: "asc" } }, { recordingId: "asc" }, { index: "asc" }],
    select: { id: true },
    take: 50,
  });
  for (const c of candidates) {
    const nb = notBefore.get(c.id);
    if (nb && nb > now) continue;
    // ادعای اتمیک
    const r = await prisma.segment.updateMany({
      where: { id: c.id, transcriptStatus: "PENDING" },
      data: { transcriptStatus: "PROCESSING" },
    });
    if (r.count === 1) {
      notBefore.delete(c.id);
      return c;
    }
  }
  return null;
}

/** رونویسی‌های تکه‌ای نیمه‌تمام: segmentId → متن تکه‌های انجام‌شده */
const partials = new Map<string, string[]>();
const SPLIT_ABOVE_MS = 5.5 * 60_000;
const CHUNK_MS = 4.5 * 60_000;

async function transcribeChunk(audio: Uint8Array, format: string, model: string, context: string): Promise<string> {
  if (await isSttModel(model)) {
    // Speech-to-text models take no prompt/context; they return the transcript directly.
    return speechToText({ model, audio, format, language: env.TRANSCRIBE_LANGUAGE || undefined });
  }
  let instruction = PROMPT;
  if (context) {
    instruction += `\n\nFor continuity only, here is the end of the previous part's transcript (do NOT repeat it; transcribe only the new audio):\n"""${context}"""`;
  }
  const raw = await chatCompletion({
    model,
    maxTokens: 16000,
    temperature: 0,
    timeoutMs: 5 * 60_000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "input_audio", input_audio: { data: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength).toString("base64"), format } },
        ],
      },
    ],
  });
  return stripFences(raw);
}

/** اصلاح مدت بخش با شمارش فریم‌های ADTS اگر مقدار کلاینت صفر یا بیش از ۱۵٪ اختلاف داشت. */
async function fixDuration(id: string, clientMs: number, realMs: number): Promise<void> {
  if (realMs <= 0) return;
  if (clientMs > 0 && Math.abs(clientMs - realMs) / realMs <= 0.15) return;
  await prisma.segment.update({ where: { id }, data: { durationMs: realMs } });
  console.log(`[transcriber] segment ${id}: durationMs ${clientMs} → ${realMs} (from ADTS frames)`);
}

async function processSegment(id: string): Promise<void> {
  const seg = await prisma.segment.findUnique({ where: { id } });
  if (!seg) return;
  const model = seg.transcribeModel || env.TRANSCRIBE_MODEL;
  try {
    const bytes = await fs.readFile(absPath(seg.filePath));
    const prev = await prisma.segment.findUnique({
      where: { recordingId_index: { recordingId: seg.recordingId, index: seg.index - 1 } },
      select: { transcript: true, transcriptStatus: true },
    });
    const prevText = prev?.transcriptStatus === "DONE" && prev.transcript ? prev.transcript.slice(-300) : "";

    const t0 = Date.now();
    let chunks: Uint8Array[] = [bytes];
    if (seg.format === "aac") {
      const info = parseAdts(bytes);
      if (info.frames > 0) {
        await fixDuration(seg.id, seg.durationMs, info.durationMs);
        if (info.durationMs > SPLIT_ABOVE_MS) chunks = splitAdts(bytes, info, CHUNK_MS);
      }
    }
    if (chunks.length > 1) {
      console.log(`[transcriber] ${seg.recordingId}#${seg.index}: long ADTS segment split into ${chunks.length} chunks`);
    }

    // تکه‌های رونویسی‌شده در تلاش قبلی (در همین پردازه) دوباره ارسال نمی‌شوند
    const done = partials.get(id) ?? [];
    let context = prevText;
    if (done.length) context = done[done.length - 1]!.slice(-300) || context;
    for (let c = done.length; c < chunks.length; c++) {
      const text = await transcribeChunk(chunks[c]!, seg.format, model, context);
      done.push(text);
      partials.set(id, done);
      if (text) context = text.slice(-300);
      if (chunks.length > 1) console.log(`[transcriber] ${seg.recordingId}#${seg.index}: chunk ${c + 1}/${chunks.length} done`);
    }
    const transcript = done.filter(Boolean).join("\n\n");
    partials.delete(id);
    await prisma.segment.update({
      where: { id },
      data: { transcriptStatus: "DONE", transcript, error: null, attempts: { increment: 1 } },
    });
    console.log(
      `[transcriber] ✓ ${seg.recordingId}#${seg.index} (${model}) ${transcript.length} chars in ${Date.now() - t0}ms`,
    );
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const attempts = seg.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    try {
      await prisma.segment.update({
        where: { id },
        data: {
          attempts,
          error: msg.slice(0, 1000),
          transcriptStatus: failed ? "FAILED" : "PENDING",
        },
      });
    } catch {
      return; // احتمالاً ضبط حذف شده
    }
    if (failed) {
      partials.delete(id);
      console.error(`[transcriber] ✗ ${seg.recordingId}#${seg.index} FAILED after ${attempts} attempts: ${msg}`);
    } else {
      const delay = BASE_BACKOFF_MS * 2 ** (attempts - 1);
      notBefore.set(id, Date.now() + delay);
      setTimeout(kick, delay + 50);
      console.warn(`[transcriber] ! ${seg.recordingId}#${seg.index} attempt ${attempts} failed (${msg}); retry in ${delay / 1000}s`);
    }
  }
}

/** بازگرداندن بخش‌های FAILED و PENDING یک ضبط به صف. */
export async function requeueRecording(recordingId: string, model?: string): Promise<void> {
  await prisma.segment.updateMany({
    where: { recordingId, transcriptStatus: { in: ["FAILED", "PENDING"] } },
    data: { transcriptStatus: "PENDING", attempts: 0, ...(model ? { transcribeModel: model } : {}) },
  });
  const ids = await prisma.segment.findMany({ where: { recordingId, transcriptStatus: "PENDING" }, select: { id: true } });
  for (const { id } of ids) {
    notBefore.delete(id);
    partials.delete(id);
  }
  kick();
}

export async function startWorker(): Promise<void> {
  const reset = await prisma.segment.updateMany({
    where: { transcriptStatus: "PROCESSING" },
    data: { transcriptStatus: "PENDING" },
  });
  const pending = await prisma.segment.count({ where: { transcriptStatus: "PENDING" } });
  console.log(`[transcriber] started (concurrency ${CONCURRENCY}); reset ${reset.count} PROCESSING, ${pending} PENDING`);
  kick();
  setInterval(kick, POLL_MS).unref?.();
}
