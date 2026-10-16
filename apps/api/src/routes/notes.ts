import { Elysia, t } from "elysia";
import { prisma, Prisma } from "../db.ts";
import { env } from "../env.ts";
import { HttpError, notFound } from "../errors.ts";
import { noteDTO, noteInclude, noteListItemDTO, recordingInclude } from "../dto.ts";
import { escapeHtml, htmlToText, sanitizeUserHtml, textToParagraphs } from "../html.ts";
import { generateSectionHtml } from "../notes-ai.ts";
import { aiErrorToHttp, requireTranscript } from "./shared.ts";

async function loadNote(id: string) {
  const n = await prisma.note.findUnique({ where: { id }, include: noteInclude });
  if (!n) throw notFound("جزوه");
  return n;
}

export const notesRoutes = new Elysia({ prefix: "/notes" })
  .get("/", async () => {
    const ns = await prisma.note.findMany({ include: noteInclude, orderBy: { updatedAt: "desc" } });
    return ns.map(noteListItemDTO);
  })

  .post(
    "/",
    async ({ body }) => {
      const note = await prisma.note.create({
        data: { title: body.title.trim() || "جزوهٔ بدون عنوان", contentHtml: sanitizeUserHtml(body.contentHtml ?? "") },
        include: noteInclude,
      });
      return noteDTO(note);
    },
    { body: t.Object({ title: t.String(), contentHtml: t.Optional(t.String()) }) },
  )

  .get("/:id", async ({ params: { id } }) => noteDTO(await loadNote(id)))

  .patch(
    "/:id",
    async ({ params: { id }, body }) => {
      const data: Prisma.NoteUpdateInput = {};
      if (body.title !== undefined) data.title = body.title.trim() || "جزوهٔ بدون عنوان";
      if (body.contentHtml !== undefined) data.contentHtml = sanitizeUserHtml(body.contentHtml);
      try {
        return noteDTO(await prisma.note.update({ where: { id }, data, include: noteInclude }));
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw notFound("جزوه");
        throw e;
      }
    },
    { body: t.Object({ title: t.Optional(t.String()), contentHtml: t.Optional(t.String()) }) },
  )

  .delete("/:id", async ({ params: { id } }) => {
    const r = await prisma.note.deleteMany({ where: { id } });
    if (r.count === 0) throw notFound("جزوه");
    return { ok: true };
  })

  .post(
    "/:id/recordings",
    async ({ params: { id }, body, headers }) => {
      const note = await loadNote(id);
      const rec = await prisma.recording.findUnique({ where: { id: body.recordingId }, include: recordingInclude });
      if (!rec) throw notFound("ضبط");
      const transcript = requireTranscript(rec);

      let section: string;
      if (body.mode === "raw") {
        section = `<h2>${escapeHtml(rec.title)}</h2>${textToParagraphs(transcript)}`;
      } else {
        const model = headers["x-note-model"]?.trim() || env.NOTE_MODEL;
        try {
          section = await generateSectionHtml({
            existingText: htmlToText(note.contentHtml),
            transcript,
            recordingTitle: rec.title,
            model,
          });
        } catch (e) {
          throw aiErrorToHttp(e);
        }
      }

      // نسخهٔ تازهٔ جزوه را بخوان تا ویرایش‌های هم‌زمان در طول تولید از بین نروند
      const fresh = await prisma.note.findUnique({ where: { id }, select: { contentHtml: true } });
      if (!fresh) throw notFound("جزوه");
      const contentHtml = fresh.contentHtml.trim() ? `${fresh.contentHtml}<hr>${section}` : section;

      const updated = await prisma.note.update({
        where: { id },
        data: {
          contentHtml,
          recordings: {
            upsert: {
              where: { noteId_recordingId: { noteId: id, recordingId: rec.id } },
              create: { recordingId: rec.id },
              update: {},
            },
          },
        },
        include: noteInclude,
      });
      return noteDTO(updated);
    },
    {
      body: t.Object({
        recordingId: t.String(),
        mode: t.Union([t.Literal("ai"), t.Literal("raw")]),
      }),
    },
  );
