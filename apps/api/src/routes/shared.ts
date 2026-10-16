import type { RecordingFull } from "../dto.ts";
import { fullTranscript } from "../dto.ts";
import { HttpError } from "../errors.ts";
import { OpenRouterError, OpenRouterNotConfiguredError } from "../openrouter.ts";

/** بررسی کامل بودن رونویسی و برگرداندن متن کامل. */
export function requireTranscript(rec: RecordingFull): string {
  const pending = rec.segments.filter((s) => s.transcriptStatus !== "DONE").length;
  if (pending > 0) throw new HttpError(409, "رونویسی هنوز کامل نشده", { pending });
  const transcript = fullTranscript(rec.segments);
  if (!transcript) throw new HttpError(400, "متنی برای ساخت جزوه وجود ندارد (ضبط خالی است یا رونویسی متنی نداشت)");
  return transcript;
}

export function aiErrorToHttp(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (e instanceof OpenRouterNotConfiguredError) {
    return new HttpError(503, "کلید OpenRouter روی سرور تنظیم نشده است؛ OPENROUTER_API_KEY را در apps/api/.env قرار دهید");
  }
  if (e instanceof OpenRouterError) return new HttpError(502, `خطا در ارتباط با مدل زبانی: ${e.message}`);
  return new HttpError(502, `خطا در تولید جزوه: ${(e as Error)?.message ?? String(e)}`);
}
