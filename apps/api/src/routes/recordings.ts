import { Elysia, t } from "elysia";
import { prisma, Prisma } from "../db.ts";
import { env } from "../env.ts";
import { HttpError, notFound } from "../errors.ts";
import { deleteRemoteFiles, enqueueReplication, ensureLocalFile } from "../replicator.ts";
import { noteDTO, noteInclude, recordingDTO, recordingDetailDTO, recordingInclude, segmentDTO } from "../dto.ts";
import {
  absPath,
  deleteRecordingFiles,
  detectFormat,
  fileExists,
  isSafeId,
  mimeForFormat,
  segmentRelPath,
  writeFileAtomic,
} from "../storage.ts";
import { kick, requeueRecording } from "../transcriber.ts";
import { firstH1 } from "../html.ts";
import { parseAdts } from "../adts.ts";
import { generateNoteHtml } from "../notes-ai.ts";
import { aiErrorToHttp, requireTranscript } from "./shared.ts";

const RecordingStatus = t.Union([t.Literal("RECORDING"), t.Literal("COMPLETE"), t.Literal("INTERRUPTED")]);
const DEFAULT_TITLE = "ضبط بدون عنوان";

function checkId(id: string) {
  if (!isSafeId(id)) throw new HttpError(400, "شناسهٔ ضبط نامعتبر است");
}

function parseDate(s: string, field: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `تاریخ نامعتبر: ${field}`);
  return d;
}

async function loadRecording(id: string) {
  const r = await prisma.recording.findUnique({ where: { id }, include: recordingInclude });
  if (!r) throw notFound("ضبط");
  return r;
}

function headerModel(headers: Record<string, string | undefined>, name: string): string | undefined {
  const v = headers[name]?.trim();
  return v ? v : undefined;
}

/** Trim, drop empties/duplicates, cap length and count. */
function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 20);
}

export const recordingsRoutes = new Elysia({ prefix: "/recordings" })
  .get("/", async () => {
    const rs = await prisma.recording.findMany({ include: recordingInclude, orderBy: { startedAt: "desc" } });
    return rs.map(recordingDTO);
  })

  .put(
    "/:id",
    async ({ params: { id }, body }) => {
      checkId(id);
      const startedAt = parseDate(body.startedAt, "startedAt");
      const title = body.title.trim() || DEFAULT_TITLE;
      const tags = body.tags === undefined ? undefined : cleanTags(body.tags);
      await prisma.recording.upsert({
        where: { id },
        create: { id, title, startedAt, tags: tags ?? [] },
        update: { title, startedAt, ...(tags ? { tags } : {}) },
      });
      return recordingDTO(await loadRecording(id));
    },
    { body: t.Object({ title: t.String(), startedAt: t.String(), tags: t.Optional(t.Array(t.String())) }) },
  )

  .patch(
    "/:id",
    async ({ params: { id }, body }) => {
      checkId(id);
      const data: Prisma.RecordingUpdateInput = {};
      if (body.title !== undefined) data.title = body.title.trim() || DEFAULT_TITLE;
      if (body.status !== undefined) data.status = body.status;
      if (body.tags !== undefined) data.tags = cleanTags(body.tags);
      if (body.endedAt !== undefined) data.endedAt = body.endedAt === null ? null : parseDate(body.endedAt, "endedAt");
      try {
        await prisma.recording.update({ where: { id }, data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw notFound("ضبط");
        throw e;
      }
      return recordingDTO(await loadRecording(id));
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        status: t.Optional(RecordingStatus),
        endedAt: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  .get("/:id", async ({ params: { id } }) => recordingDetailDTO(await loadRecording(id)))

  .delete("/:id", async ({ params: { id } }) => {
    checkId(id);
    const segs = await prisma.segment.findMany({ where: { recordingId: id }, select: { filePath: true, remoteKey: true } });
    await prisma.recording.deleteMany({ where: { id } });
    await deleteRecordingFiles(id);
    await deleteRemoteFiles(segs.map((s) => s.remoteKey ?? s.filePath.replace(/\\/g, "/")));
    console.log(`[recordings] deleted ${id} (server copy)`);
    return { ok: true };
  })

  .post(
    "/:id/segments",
    async ({ params: { id }, body, headers }) => {
      checkId(id);
      const index = Math.trunc(body.index);
      let durationMs = Math.max(0, Math.round(body.durationMs));
      if (!Number.isFinite(index) || index < 0 || index > 99999) throw new HttpError(400, "index نامعتبر است");
      const file = body.file;
      const transcribeModel = headerModel(headers, "x-transcribe-model");

      const existing = await prisma.segment.findUnique({ where: { recordingId_index: { recordingId: id, index } } });
      if (existing && (await ensureLocalFile(existing))) {
        if (!existing.remoteAt) enqueueReplication(existing.id);
        return segmentDTO(existing); // idempotent
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length === 0) throw new HttpError(400, "فایل صوتی خالی است");
      const format = detectFormat(bytes.subarray(0, 16), file.name, file.type);
      const rel = segmentRelPath(id, index, format);
      if (format === "aac") {
        // مدت واقعی از شمارش فریم‌های ADTS (وقتی مقدار کلاینت صفر یا بیش از ۱۵٪ اشتباه است)
        const real = parseAdts(bytes).durationMs;
        if (real > 0 && (durationMs <= 0 || Math.abs(durationMs - real) / real > 0.15)) durationMs = real;
      }

      // ۱) اول فایل روی دیسک (اتمیک)، ۲) بعد ردیف دیتابیس
      await writeFileAtomic(rel, bytes);

      await prisma.recording.upsert({
        where: { id },
        create: { id, title: DEFAULT_TITLE, startedAt: new Date() },
        update: {},
      });

      let seg;
      if (existing) {
        // ردیف بود ولی فایل گم شده بود → فایل بازنویسی شد
        seg = await prisma.segment.update({
          where: { id: existing.id },
          data: {
            filePath: rel,
            format,
            mimeType: file.type || mimeForFormat(format),
            sizeBytes: bytes.length,
            durationMs: durationMs || existing.durationMs,
            ...(existing.transcriptStatus === "DONE" ? {} : { transcriptStatus: "PENDING", attempts: 0, error: null }),
            ...(transcribeModel ? { transcribeModel } : {}),
          },
        });
        console.warn(`[segments] ${id}#${index}: file was missing on disk, rewritten`);
      } else {
        try {
          seg = await prisma.segment.create({
            data: {
              recordingId: id,
              index,
              filePath: rel,
              format,
              mimeType: file.type || mimeForFormat(format),
              sizeBytes: bytes.length,
              durationMs,
              transcribeModel: transcribeModel ?? null,
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            // آپلود هم‌زمان همان بخش
            seg = await prisma.segment.findUniqueOrThrow({ where: { recordingId_index: { recordingId: id, index } } });
          } else throw e;
        }
      }
      console.log(`[segments] saved ${id}#${index} ${format} ${bytes.length}B ${durationMs}ms`);
      kick();
      enqueueReplication(seg.id);
      return segmentDTO(seg);
    },
    {
      body: t.Object({
        index: t.Numeric(),
        durationMs: t.Numeric(),
        file: t.File(),
      }),
    },
  )

  .get("/:id/segments/:index/audio", async ({ params, request }) => {
    const index = Number(params.index);
    if (!Number.isInteger(index)) throw new HttpError(400, "index نامعتبر است");
    const seg = await prisma.segment.findUnique({ where: { recordingId_index: { recordingId: params.id, index } } });
    if (!seg) throw notFound("بخش");
    if (!(await ensureLocalFile(seg))) throw new HttpError(404, "فایل صوتی پیدا نشد");
    const f = Bun.file(absPath(seg.filePath));
    const size = f.size;
    const type = mimeForFormat(seg.format);
    const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

    const range = request.headers.get("range");
    const m = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (m && (m[1] || m[2])) {
      let start: number;
      let end: number;
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      } else {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      }
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
      }
      return new Response(f.slice(start, end + 1), {
        status: 206,
        headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }
    return new Response(f, { headers: { ...base, "Content-Length": String(size) } });
  })

  .post("/:id/transcribe", async ({ params: { id }, headers }) => {
    await loadRecording(id);
    await requeueRecording(id, headerModel(headers, "x-transcribe-model"));
    return recordingDetailDTO(await loadRecording(id));
  })

  .post(
    "/:id/note",
    async ({ params: { id }, body, headers }) => {
      const rec = await loadRecording(id);
      const transcript = requireTranscript(rec);
      const model = headerModel(headers, "x-note-model") ?? env.NOTE_MODEL;
      let html: string;
      try {
        html = await generateNoteHtml({ transcript, recordingTitle: rec.title, model });
      } catch (e) {
        throw aiErrorToHttp(e);
      }
      const title = body?.title?.trim() || firstH1(html) || rec.title;
      const note = await prisma.note.create({
        data: { title, contentHtml: html, recordings: { create: { recordingId: id } } },
        include: noteInclude,
      });
      console.log(`[notes] generated note ${note.id} from ${id} (${model}, ${html.length} chars)`);
      return noteDTO(note);
    },
    { body: t.Optional(t.Nullable(t.Object({ title: t.Optional(t.String()) }))) },
  );
