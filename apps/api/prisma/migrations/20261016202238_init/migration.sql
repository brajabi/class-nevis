-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'COMPLETE', 'INTERRUPTED');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "transcript" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteRecording" (
    "noteId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteRecording_pkey" PRIMARY KEY ("noteId","recordingId")
);

-- CreateIndex
CREATE INDEX "Segment_transcriptStatus_idx" ON "Segment"("transcriptStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_recordingId_index_key" ON "Segment"("recordingId", "index");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteRecording" ADD CONSTRAINT "NoteRecording_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteRecording" ADD CONSTRAINT "NoteRecording_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
