import { File } from 'expo-file-system';

import { getSettings } from './settings';
import type {
  ModelDTO,
  NoteDTO,
  NoteListItemDTO,
  RecordingDTO,
  RecordingDetailDTO,
  RecordingStatus,
  SegmentDTO,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: any,
  ) {
    super(message);
  }
}

function base() {
  return getSettings().serverUrl.replace(/\/+$/, '');
}

function aiHeaders(): Record<string, string> {
  const s = getSettings();
  const h: Record<string, string> = {};
  if (s.transcribeModel) h['x-transcribe-model'] = s.transcribeModel;
  if (s.noteModel) h['x-note-model'] = s.noteModel;
  return h;
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const res = await fetch(base() + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init.body && !isForm ? { 'content-type': 'application/json' } : {}),
        ...aiHeaders(),
        ...(init.headers as Record<string, string>),
      },
    });
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status, body);
    return body as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (e?.name === 'AbortError') throw new ApiError('زمان اتصال به سرور تمام شد', 0, null);
    if (__DEV__) console.warn('[api] network error', path, e?.message ?? e);
    throw new ApiError('اتصال به سرور برقرار نشد', 0, null);
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { error: t };
  }
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  health: () => request<{ ok: true; openrouterConfigured: boolean }>('/health', {}, 6000),
  models: () => request<ModelDTO[]>('/models'),

  upsertRecording: (id: string, body: { title: string; startedAt: string; tags?: string[] }) =>
    request<RecordingDTO>(`/recordings/${id}`, { method: 'PUT', body: json(body) }),
  patchRecording: (id: string, body: { title?: string; tags?: string[]; status?: RecordingStatus; endedAt?: string }) =>
    request<RecordingDTO>(`/recordings/${id}`, { method: 'PATCH', body: json(body) }),
  uploadSegment: (id: string, index: number, durationMs: number, file: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('index', String(index));
    form.append('durationMs', String(durationMs));
    // SDK 58 fetch only accepts Blob parts; expo-file-system's File is a Blob backed by the file on disk.
    const blob = new File(file.uri);
    form.append('file', blob as unknown as Blob, file.name);
    return request<SegmentDTO>(`/recordings/${id}/segments`, { method: 'POST', body: form }, 120000);
  },
  listRecordings: () => request<RecordingDTO[]>('/recordings'),
  getRecording: (id: string) => request<RecordingDetailDTO>(`/recordings/${id}`),
  segmentAudioUrl: (id: string, index: number) => `${base()}/recordings/${id}/segments/${index}/audio`,
  retranscribe: (id: string) => request<RecordingDetailDTO>(`/recordings/${id}/transcribe`, { method: 'POST' }),
  deleteRecording: (id: string) => request<{ ok: true }>(`/recordings/${id}`, { method: 'DELETE' }),
  recordingToNote: (id: string, title?: string) =>
    request<NoteDTO>(`/recordings/${id}/note`, { method: 'POST', body: json({ title }) }, 300000),

  listNotes: () => request<NoteListItemDTO[]>('/notes'),
  createNote: (body: { title: string; contentHtml?: string }) =>
    request<NoteDTO>('/notes', { method: 'POST', body: json(body) }),
  getNote: (id: string) => request<NoteDTO>(`/notes/${id}`),
  updateNote: (id: string, body: { title?: string; contentHtml?: string }) =>
    request<NoteDTO>(`/notes/${id}`, { method: 'PATCH', body: json(body) }),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
  attachRecording: (noteId: string, recordingId: string, mode: 'ai' | 'raw') =>
    request<NoteDTO>(`/notes/${noteId}/recordings`, { method: 'POST', body: json({ recordingId, mode }) }, 300000),
};
