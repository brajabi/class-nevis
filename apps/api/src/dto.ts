import type { Prisma, Segment } from "./db.ts";
import { preview } from "./html.ts";

export const recordingInclude = {
  segments: { orderBy: { index: "asc" } },
  notes: { select: { noteId: true }, orderBy: { addedAt: "asc" } },
} satisfies Prisma.RecordingInclude;

export type RecordingFull = Prisma.RecordingGetPayload<{ include: typeof recordingInclude }>;

export const noteInclude = {
  recordings: { select: { recordingId: true }, orderBy: { addedAt: "asc" } },
} satisfies Prisma.NoteInclude;

export type NoteFull = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function segmentDTO(s: Segment) {
  return {
    id: s.id,
    index: s.index,
    durationMs: s.durationMs,
    sizeBytes: s.sizeBytes,
    format: s.format,
    transcriptStatus: s.transcriptStatus,
    transcript: s.transcript,
    error: s.error,
  };
}

export function recordingDTO(r: RecordingFull) {
  const segSum = r.segments.reduce((a, s) => a + s.durationMs, 0);
  return {
    id: r.id,
    title: r.title,
    tags: r.tags,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    endedAt: iso(r.endedAt),
    durationMs: Math.max(r.durationMs, segSum),
    createdAt: r.createdAt.toISOString(),
    segmentCount: r.segments.length,
    transcribedCount: r.segments.filter((s) => s.transcriptStatus === "DONE").length,
    failedCount: r.segments.filter((s) => s.transcriptStatus === "FAILED").length,
    noteIds: r.notes.map((n) => n.noteId),
  };
}

export function fullTranscript(segments: Segment[]): string {
  return [...segments]
    .sort((a, b) => a.index - b.index)
    .filter((s) => s.transcriptStatus === "DONE" && s.transcript && s.transcript.trim())
    .map((s) => s.transcript!.trim())
    .join("\n\n");
}

export function recordingDetailDTO(r: RecordingFull) {
  return {
    ...recordingDTO(r),
    segments: r.segments.map(segmentDTO),
    transcript: fullTranscript(r.segments),
  };
}

export function noteDTO(n: NoteFull) {
  return {
    id: n.id,
    title: n.title,
    contentHtml: n.contentHtml,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    recordingIds: n.recordings.map((r) => r.recordingId),
  };
}

export function noteListItemDTO(n: NoteFull) {
  return {
    id: n.id,
    title: n.title,
    preview: preview(n.contentHtml, 160),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    recordingCount: n.recordings.length,
  };
}
