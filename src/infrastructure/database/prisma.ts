import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { spellColumnsOmit } from "@/infrastructure/database/spell-schema-gate";
import { env } from "@/lib/env";
import { isSpellV1Enabled } from "@/lib/feature-flags";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  const pool =
    globalForPrisma.pool ??
    new Pool({
      connectionString: env.DATABASE_URL,
    });

  // Cache pool/client across hot reloads and serverless isolates.
  globalForPrisma.pool = pool;

  const adapter = new PrismaPg(pool);
  // Widened on purpose: the cached client below is typed with the default (optional) omit option.
  const omit = spellColumnsOmit(isSpellV1Enabled()) as Prisma.PrismaClientOptions["omit"];

  return new PrismaClient({
    adapter,
    // Spell columns stay out of every query until Spell is enabled (see spell-schema-gate.ts).
    omit,
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  if (cached?.guestSession) {
    return cached;
  }
  const created = createPrismaClient();
  globalForPrisma.prisma = created;
  return created;
}

export const prisma = getPrismaClient();
