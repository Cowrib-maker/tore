/**
 * Milestone 2 DB verification helper (counts + booking columns).
 * Invoked by scripts/verify-milestone-2-db.ps1 — not application runtime code.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const [practiceAreas, languages, settings] = await Promise.all([
      prisma.practiceArea.count(),
      prisma.language.count(),
      prisma.platformSetting.count(),
    ]);

    const bookingColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bookings'
        AND column_name IN ('meeting_url', 'meeting_instructions', 'version')
      ORDER BY column_name
    `;

    const columnNames = bookingColumns.map((row) => row.column_name);
    const requiredColumns = [
      "meeting_instructions",
      "meeting_url",
      "version",
    ] as const;
    const missingColumns = requiredColumns.filter(
      (name) => !columnNames.includes(name),
    );

    console.log(
      JSON.stringify(
        {
          practiceAreas,
          languages,
          settings,
          bookingColumns: columnNames,
          missingColumns,
        },
        null,
        2,
      ),
    );

    if (practiceAreas < 1) {
      throw new Error(`Expected PracticeArea count >= 1, got ${practiceAreas}`);
    }
    if (languages < 1) {
      throw new Error(`Expected Language count >= 1, got ${languages}`);
    }
    if (settings < 1) {
      throw new Error(`Expected PlatformSetting count >= 1, got ${settings}`);
    }
    if (missingColumns.length > 0) {
      throw new Error(
        `bookings missing columns: ${missingColumns.join(", ")}`,
      );
    }

    console.log("Verification checks passed.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
