import { classifyDatabaseUrl } from "../../scripts/lib/database-url-safety";

/**
 * These tests INSERT data and run raw SQL, so they refuse anything but an
 * explicitly local database — the same fail-closed rule as the Prisma CLI
 * guard (see scripts/lib/database-url-safety.ts).
 */
const url = process.env.SPELL_TEST_DATABASE_URL;
const kind = classifyDatabaseUrl(url).kind;
if (kind !== "local") {
  throw new Error(
    `SPELL_TEST_DATABASE_URL must be set to a local, migrated Postgres database (got: ${kind}). ` +
      "Example: createdb tore_spell_test && DATABASE_URL=$URL npx prisma migrate deploy",
  );
}
process.env.DATABASE_URL = url;
process.env.AUTH_SECRET ??= "test-auth-secret-minimum-32-characters";
