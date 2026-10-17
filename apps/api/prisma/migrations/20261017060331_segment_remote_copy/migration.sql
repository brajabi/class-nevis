-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "remoteAt" TIMESTAMP(3),
ADD COLUMN     "remoteKey" TEXT;

-- CreateIndex
CREATE INDEX "Segment_remoteAt_idx" ON "Segment"("remoteAt");
