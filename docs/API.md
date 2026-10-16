# کلاس‌نویس (ClassNevis) — API contract

Base URL: `http://<host>:4000` (mobile reads it from settings, default `http://10.0.2.2:4000` on Android emulator).
All JSON. Errors: `{ "error": string }` with 4xx/5xx.
Optional headers on AI endpoints: `x-transcribe-model`, `x-note-model` (OpenRouter model ids, override server defaults).

## Types
```ts
type TranscriptStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";
type RecordingStatus = "RECORDING" | "COMPLETE" | "INTERRUPTED";
interface SegmentDTO { id: string; index: number; durationMs: number; sizeBytes: number; format: string;
  transcriptStatus: TranscriptStatus; transcript: string | null; error: string | null; }
interface RecordingDTO { id: string; title: string; tags: string[]; status: RecordingStatus; startedAt: string; endedAt: string | null;
  durationMs: number; createdAt: string; segmentCount: number; transcribedCount: number; failedCount: number;
  noteIds: string[]; }
interface RecordingDetailDTO extends RecordingDTO { segments: SegmentDTO[]; transcript: string; } // transcript = DONE segments joined in order with "\n\n"
interface NoteDTO { id: string; title: string; contentHtml: string; createdAt: string; updatedAt: string; recordingIds: string[]; }
interface NoteListItemDTO { id: string; title: string; preview: string /* first ~160 chars plain text */; createdAt: string; updatedAt: string; recordingCount: number; }
interface ModelDTO { id: string; name: string; audio: boolean; stt: boolean /* speech-to-text model, called via /audio/transcriptions */; contextLength: number; promptPrice: string; }
```

## Endpoints
- `GET /health` → `{ ok: true, openrouterConfigured: boolean }`
- `GET /models` → `ModelDTO[]` (cached from OpenRouter; speech-to-text models first, then audio-capable chat models; default transcription model `elevenlabs/scribe-v2`, notes `google/gemini-3.8-flash`)
- `PUT /recordings/:id` body `{ title: string; startedAt: string; tags?: string[] }` → `RecordingDTO` (idempotent upsert; id is client UUID)
- `PATCH /recordings/:id` body `{ title?: string; tags?: string[]; status?: RecordingStatus; endedAt?: string }` → `RecordingDTO`
- `POST /recordings/:id/segments` multipart: `index` (int), `durationMs` (int), `file` (audio blob). Idempotent on (id,index): re-upload of existing index returns existing segment with 200. If recording row does not exist, it is auto-created (title "ضبط بدون عنوان"). Saves file to disk, queues transcription. → `SegmentDTO`
- `GET /recordings` → `RecordingDTO[]` newest first
- `GET /recordings/:id` → `RecordingDetailDTO`
- `GET /recordings/:id/segments/:index/audio` → audio file bytes
- `POST /recordings/:id/transcribe` → re-queue FAILED (and stale PENDING) segments → `RecordingDetailDTO`
- `DELETE /recordings/:id` → `{ ok: true }` (deletes server copy only)
- `POST /recordings/:id/note` body `{ title?: string }` → `NoteDTO` (LLM writes a note from the full transcript; 409 if transcription not finished: `{ error, pending: number }`)
- `GET /notes` → `NoteListItemDTO[]` by updatedAt desc
- `POST /notes` body `{ title: string; contentHtml?: string }` → `NoteDTO`
- `GET /notes/:id` → `NoteDTO`
- `PATCH /notes/:id` body `{ title?: string; contentHtml?: string }` → `NoteDTO`
- `DELETE /notes/:id` → `{ ok: true }`
- `POST /notes/:id/recordings` body `{ recordingId: string; mode: "ai" | "raw" }` → `NoteDTO`. Links recording; `ai` = LLM writes a section from the transcript (aware of existing note content, avoids repetition) and appends it; `raw` = appends transcript as paragraphs under an `<h2>` with recording title. 409 if transcription not finished.

Note HTML uses only: h1 h2 h3 p strong b em i u s ul ol li blockquote br hr span[style="font-size:..."] mark. Persian, RTL.
