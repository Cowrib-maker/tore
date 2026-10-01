-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatterType" AS ENUM ('GENERAL', 'LITIGATION', 'CONTRACT', 'EMPLOYMENT', 'FAMILY', 'CRIMINAL', 'ADMINISTRATIVE');

-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "matter_id" TEXT;

-- CreateTable
CREATE TABLE "matters" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MatterType" NOT NULL DEFAULT 'GENERAL',
    "description" TEXT,
    "status" "MatterStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matters_owner_id_updated_at_idx" ON "matters"("owner_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "ai_conversations_matter_id_updated_at_idx" ON "ai_conversations"("matter_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
