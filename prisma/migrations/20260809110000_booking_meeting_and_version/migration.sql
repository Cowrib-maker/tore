-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "meeting_url" TEXT,
ADD COLUMN "meeting_instructions" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
