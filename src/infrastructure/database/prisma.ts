import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";

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

  return new PrismaClient({
    adapter,
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
