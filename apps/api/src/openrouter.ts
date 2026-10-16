import { env, openrouterConfigured } from "./env.ts";

const BASE = "https://openrouter.ai/api/v1";

export class OpenRouterError extends Error {
  constructor(
    message: string,
    /** HTTP status از OpenRouter (۰ = خطای شبکه/timeout) */
    public status: number,
  ) {
    super(message);
  }
}

export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super("کلید OpenRouter تنظیم نشده است (OPENROUTER_API_KEY)");
  }
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function chatCompletion(opts: ChatOptions): Promise<string> {
  if (!openrouterConfigured()) throw new OpenRouterNotConfiguredError();
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://classnevis.app",
        "X-Title": "ClassNevis",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 16000,
        temperature: opts.temperature ?? 0.2,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60_000),
    });
  } catch (e) {
    const err = e as Error;
    const msg = err.name === "TimeoutError" ? "زمان پاسخ‌گویی مدل به پایان رسید" : err.message;
    throw new OpenRouterError(msg, 0);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok || json?.error) {
    const msg = json?.error?.message ?? (text.slice(0, 300) || res.statusText);
    const status = res.ok ? Number(json?.error?.code) || 502 : res.status;
    throw new OpenRouterError(`${msg} (HTTP ${status})`, status);
  }

  const choice = json?.choices?.[0];
  if (choice?.error) throw new OpenRouterError(choice.error.message ?? "خطای نامشخص مدل", 502);
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("");
  if (content == null) return "";
  throw new OpenRouterError("پاسخ نامعتبر از مدل", 502);
}

function headers() {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://classnevis.app",
    "X-Title": "ClassNevis",
  };
}

async function readError(res: Response): Promise<OpenRouterError> {
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  const msg = json?.error?.message ?? (text.slice(0, 300) || res.statusText);
  return new OpenRouterError(`${msg} (HTTP ${res.status})`, res.status);
}

/**
 * Dedicated speech-to-text models (ElevenLabs Scribe, Whisper, ...) use OpenRouter's
 * /audio/transcriptions endpoint instead of chat completions.
 */
export async function speechToText(opts: {
  model: string;
  audio: Uint8Array;
  format: string;
  language?: string;
  timeoutMs?: number;
}): Promise<string> {
  if (!openrouterConfigured()) throw new OpenRouterNotConfiguredError();
  const body: Record<string, unknown> = {
    model: opts.model,
    input_audio: {
      data: Buffer.from(opts.audio.buffer, opts.audio.byteOffset, opts.audio.byteLength).toString("base64"),
      format: opts.format,
    },
  };
  if (opts.language) body.language = opts.language;
  let res: Response;
  try {
    res = await fetch(`${BASE}/audio/transcriptions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5 * 60_000),
    });
  } catch (e) {
    const err = e as Error;
    throw new OpenRouterError(err.name === "TimeoutError" ? "زمان پاسخ‌گویی مدل به پایان رسید" : err.message, 0);
  }
  if (!res.ok) throw await readError(res);
  const json: any = await res.json().catch(() => null);
  if (json?.error) throw new OpenRouterError(json.error.message ?? "خطای نامشخص مدل", Number(json.error.code) || 502);
  if (typeof json?.text !== "string") throw new OpenRouterError("پاسخ نامعتبر از مدل گفتار‌به‌متن", 502);
  return json.text.trim();
}

/** حذف ``` احتمالی از خروجی مدل */
export function stripFences(s: string): string {
  let out = s.trim();
  const m = out.match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```\s*$/);
  if (m) out = m[1]!.trim();
  return out.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
}

// ---------- لیست مدل‌ها ----------

export interface ModelDTO {
  id: string;
  name: string;
  audio: boolean;
  /** dedicated speech-to-text model (called via /audio/transcriptions) */
  stt: boolean;
  contextLength: number;
  promptPrice: string;
}

let sttCache: { at: number; ids: Set<string>; data: ModelDTO[] } | null = null;

async function listSttModels(): Promise<ModelDTO[]> {
  if (sttCache && Date.now() - sttCache.at < MODELS_TTL) return sttCache.data;
  try {
    const res = await fetch(`${BASE}/models?output_modalities=transcription`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const data: ModelDTO[] = (Array.isArray(json?.data) ? json.data : []).map((m: any) => ({
      id: String(m.id),
      name: String(m.name ?? m.id),
      audio: true,
      stt: true,
      contextLength: 0,
      promptPrice: String(m?.pricing?.prompt ?? "0"),
    }));
    sttCache = { at: Date.now(), ids: new Set(data.map((m) => m.id)), data };
    return data;
  } catch (e) {
    if (sttCache) return sttCache.data;
    throw e;
  }
}

const STT_PATTERN = /(^elevenlabs\/|whisper|scribe|transcribe|^deepgram\/|^assemblyai\/)/i;

/** Whether a model must be called through /audio/transcriptions. */
export async function isSttModel(id: string): Promise<boolean> {
  try {
    await listSttModels();
  } catch {}
  return sttCache?.ids.has(id) ?? STT_PATTERN.test(id);
}

let modelsCache: { at: number; data: ModelDTO[] } | null = null;
const MODELS_TTL = 60 * 60_000;

export async function listModels(): Promise<ModelDTO[]> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL) return modelsCache.data;
  try {
    const res = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const data: ModelDTO[] = (Array.isArray(json?.data) ? json.data : [])
      .filter((m: any) => {
        const out: unknown = m?.architecture?.output_modalities;
        return Array.isArray(out) ? out.includes("text") : true;
      })
      .map((m: any) => ({
        id: String(m.id),
        name: String(m.name ?? m.id),
        audio: Array.isArray(m?.architecture?.input_modalities) && m.architecture.input_modalities.includes("audio"),
        stt: false,
        contextLength: Number(m.context_length ?? m.top_provider?.context_length ?? 0) || 0,
        promptPrice: String(m?.pricing?.prompt ?? "0"),
      }))
      .sort((a: ModelDTO, b: ModelDTO) => (a.audio === b.audio ? a.name.localeCompare(b.name) : a.audio ? -1 : 1));
    const stt = await listSttModels().catch(() => [] as ModelDTO[]);
    const all = [...stt, ...data];
    modelsCache = { at: Date.now(), data: all };
    return all;
  } catch (e) {
    if (modelsCache) return modelsCache.data; // کش قدیمی بهتر از هیچ
    throw new OpenRouterError(`دریافت لیست مدل‌ها ناموفق بود: ${(e as Error).message}`, 0);
  }
}
