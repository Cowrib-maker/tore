/**
 * EPIC 02 · Sprint 2.2 Wave 1 — backfill personal tenants (additive).
 * Does not change bookings, marketplace, or profiles.
 *
 * Usage:
 *   npm run db:backfill-personal-tenants -- --force
 *
 * Requires --force when TORE_FOUNDATION_TENANT_V1 is not "1"
 * (product flag stays OFF by default; ops may still backfill safely).
 */
import "dotenv/config";

import { backfillPersonalTenantsUseCase } from "../src/application/use-cases/tenancy/ensure-personal-tenant";
import { tenantRepository } from "../src/infrastructure/repositories";
import { isFoundationTenantV1Enabled } from "../src/lib/feature-flags";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const force = process.argv.includes("--force");
  if (!force && !isFoundationTenantV1Enabled()) {
    console.error(
      JSON.stringify({
        error:
          "TORE_FOUNDATION_TENANT_V1 is off. Pass --force to run an additive backfill anyway.",
      }),
    );
    process.exitCode = 1;
    return;
  }

  const result = await backfillPersonalTenantsUseCase(
    { tenantRepository },
    { force: true },
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
