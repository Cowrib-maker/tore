import { NextResponse } from "next/server";

import { buildAppHealth } from "@/application/common/app-health";
import { prisma } from "@/infrastructure/database/prisma";
import { env } from "@/lib/env";

async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const result = await buildAppHealth({
    env,
    pingDatabase,
  });
  return NextResponse.json(result.body, { status: result.status });
}
