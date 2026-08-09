import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";

export type PrismaDbClient = PrismaClient | Prisma.TransactionClient;

export function getPrismaClient(client?: PrismaDbClient): PrismaDbClient {
  return client ?? prisma;
}
