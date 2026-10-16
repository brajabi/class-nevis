-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
