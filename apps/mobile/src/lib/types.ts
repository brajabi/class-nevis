// Mirrors docs/API.md
export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
export type RecordingStatus = 'RECORDING' | 'COMPLETE' | 'INTERRUPTED';

export interface SegmentDTO {
  id: string;
  index: number;
  durationMs: number;
  sizeBytes: number;
  format: string;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  error: string | null;
}

export interface RecordingDTO {
  id: string;
  title: string;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  createdAt: string;
  segmentCount: number;
  transcribedCount: number;
  failedCount: number;
  noteIds: string[];
}

export interface RecordingDetailDTO extends RecordingDTO {
  segments: SegmentDTO[];
  transcript: string;
}

export interface NoteDTO {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  recordingIds: string[];
}

export interface NoteListItemDTO {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  recordingCount: number;
}

export interface ModelDTO {
  id: string;
  name: string;
  audio: boolean;
  /** dedicated speech-to-text model (e.g. elevenlabs/scribe-v2) */
  stt?: boolean;
  contextLength: number;
  promptPrice: string;
}
