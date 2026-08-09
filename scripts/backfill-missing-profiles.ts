/**
 * Sprint 2 Milestone 2 — backfill Client/Lawyer profiles for orphan users.
 * Composition root (CLI). Does not run inside the Next.js app router.
 *
 * Usage: npm run db:backfill-profiles
 */
import "dotenv/config";

import { backfillMissingProfilesUseCase } from "../src/application/use-cases/profiles/backfill-missing-profiles";
import {
  auditLogRepository,
  clientProfileRepository,
  lawyerProfileRepository,
  userRepository,
} from "../src/infrastructure/repositories";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const result = await backfillMissingProfilesUseCase({
    userRepository,
    clientProfileRepository,
    lawyerProfileRepository,
    auditLogRepository,
  });

  console.log(
    JSON.stringify(
      {
        clientsCreated: result.clientsCreated,
        lawyersCreated: result.lawyersCreated,
        clientsSkipped: result.clientsSkipped,
        lawyersSkipped: result.lawyersSkipped,
      },
      null,
      2,
    ),
  );
  console.log("Backfill completed successfully.");
}

main().catch((error: unknown) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
