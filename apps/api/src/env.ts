import path from "node:path";

// Bun به‌طور خودکار ‌.env را از پوشهٔ جاری بارگذاری می‌کند؛ برای اطمینان از اجرای خارج از apps/api هم آن را می‌خوانیم.
const API_ROOT = path.resolve(import.meta.dir, "..");
try {
  process.loadEnvFile(path.join(API_ROOT, ".env"));
} catch {}

const storageRaw = process.env.STORAGE_DIR || "./storage";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5432/classnevis?schema=public",
  PORT: Number(process.env.PORT || 4000),
  OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY ?? "").trim(),
  TRANSCRIBE_MODEL: process.env.TRANSCRIBE_MODEL || "elevenlabs/scribe-v2",
  /** زبان برای مدل‌های گفتار‌به‌متن (خالی = تشخیص خودکار) */
  TRANSCRIBE_LANGUAGE: process.env.TRANSCRIBE_LANGUAGE ?? "fa",
  NOTE_MODEL: process.env.NOTE_MODEL || "google/gemini-3.8-flash",
  STORAGE_DIR: path.isAbsolute(storageRaw) ? storageRaw : path.resolve(API_ROOT, storageRaw),
};

export const objectStorage = {
  accessKeyId: (process.env.CF_ACCESS_KEY_ID ?? "").trim(),
  secretAccessKey: (process.env.CF_SECRET_ACCESS_KEY ?? "").trim(),
  endpoint: (process.env.CF_R2_ENDPOINT || "https://c50c3b16d43904964c082e72dfbfde7b.r2.cloudflarestorage.com").trim(),
  bucket: (process.env.CF_R2_BUCKET || "classnevis").trim(),
};

export const objectStorageConfigured = () => !!(objectStorage.accessKeyId && objectStorage.secretAccessKey);

export const openrouterConfigured = () => env.OPENROUTER_API_KEY.length > 0;
