import type { ArchiveService } from "@/engine/data/archive";
import { getPrismaClient } from "@/infrastructure/database/prisma-client";
import { PrismaKnowledgeRepository } from "@/infrastructure/repositories/prisma-legal-knowledge-repository";

function readOnlyArchivePlaceholder(): ArchiveService {
  return {
    verifyArchiveIntegrity: async () => {
      throw new Error("Read-only knowledge access does not archive.");
    },
  } as unknown as ArchiveService;
}

/** Shared Prisma knowledge repo for chat retrieval and Case Review rules. */
export function createReadOnlyKnowledgeRepository(): PrismaKnowledgeRepository {
  return new PrismaKnowledgeRepository(
    readOnlyArchivePlaceholder(),
    getPrismaClient(),
  );
}
