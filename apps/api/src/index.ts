import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { env, objectStorageConfigured, openrouterConfigured } from "./env.ts";
import { prisma } from "./db.ts";
import { HttpError } from "./errors.ts";
import { ensureStorage } from "./storage.ts";
import { startWorker } from "./transcriber.ts";
import { startReplicator } from "./replicator.ts";
import { recordingsRoutes } from "./routes/recordings.ts";
import { notesRoutes } from "./routes/notes.ts";
import { modelsRoutes } from "./routes/models.ts";

const startTimes = new WeakMap<Request, number>();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const app = new Elysia({
  serve: {
    maxRequestBodySize: 512 * 1024 * 1024, // ۵۱۲ مگابایت
    idleTimeout: 0, // تولید جزوه و آپلود روی شبکهٔ کند ممکن است طول بکشد
  },
})
  .use(cors())
  .onRequest(({ request }) => {
    startTimes.set(request, performance.now());
  })
  .onAfterResponse({ as: "global" }, ({ request, set }) => {
    const t0 = startTimes.get(request);
    const ms = t0 ? (performance.now() - t0).toFixed(0) : "?";
    const url = new URL(request.url);
    console.log(`${request.method} ${url.pathname} ${set.status ?? 200} ${ms}ms`);
  })
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return json(error.status, { error: error.message, ...error.extra });
    }
    switch (code) {
      case "NOT_FOUND":
        set.status = 404;
        return json(404, { error: "مسیر پیدا نشد" });
      case "VALIDATION": {
        set.status = 400;
        const e = error as any;
        let detail = "";
        try {
          const first = e.all?.[0] ?? e.valueError;
          detail = first ? `${first.path || ""} ${first.message || ""}`.trim() : "";
        } catch {}
        return json(400, { error: `ورودی نامعتبر است${detail ? `: ${detail}` : ""}` });
      }
      case "PARSE":
        set.status = 400;
        return json(400, { error: "بدنهٔ درخواست قابل خواندن نیست" });
      default: {
        const status = typeof (error as any)?.status === "number" && (error as any).status >= 400 ? (error as any).status : 500;
        set.status = status;
        console.error("[error]", error);
        return json(status, { error: status === 500 ? `خطای داخلی سرور: ${(error as Error)?.message ?? ""}` : String((error as Error)?.message ?? error) });
      }
    }
  })
  .get("/health", () => ({ ok: true, openrouterConfigured: openrouterConfigured(), objectStorage: objectStorageConfigured() }))
  .use(modelsRoutes)
  .use(recordingsRoutes)
  .use(notesRoutes);

async function main() {
  await ensureStorage();
  await prisma.$connect();
  app.listen({ port: env.PORT, hostname: "0.0.0.0" });
  console.log(`🎙️  ClassNevis API on http://0.0.0.0:${env.PORT}  (storage: ${env.STORAGE_DIR})`);
  if (!openrouterConfigured()) console.warn("⚠️  OPENROUTER_API_KEY خالی است — رونویسی و تولید جزوه غیرفعال است.");
  await startWorker();
  await startReplicator();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal startup error:", e);
    process.exit(1);
  });
}
