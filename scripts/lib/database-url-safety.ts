/**
 * Shared, dependency-free classifier for "is this DATABASE_URL local" plus
 * the fail-closed guard that stops a mutating Prisma CLI invocation
 * (migrate/db push/db execute/db seed/migrate reset) from ever running
 * against anything that isn't explicitly local.
 *
 * Exists because of the Sprint 14 incident: `prisma.config.ts` used
 * `import "dotenv/config"`, which only loads `.env` — not `.env.local` —
 * so `npx prisma migrate deploy` silently resolved the production
 * DATABASE_URL in `.env` and applied migrations to Neon production. This
 * module is imported directly by `prisma.config.ts` (the one chokepoint
 * every `prisma` CLI invocation goes through) so the same mistake fails
 * closed regardless of which env file supplied the URL, and regardless of
 * which npm script (or raw `npx prisma ...`) was used to invoke it.
 *
 * Pure functions only — no process.exit, no console output, no I/O — so
 * this stays trivially unit-testable without ever touching a real
 * database, local or remote.
 */

export type DatabaseUrlClassification =
  | { kind: "local"; hostname: string }
  | { kind: "remote"; hostname: string }
  | { kind: "missing" }
  | { kind: "malformed" };

/**
 * Exact-match allowlist, deliberately small. Do not add hostname
 * substring/regex matching here — an allowlist of exact local addresses is
 * the fail-closed direction; a denylist of "known remote patterns" like
 * `*.neon.tech` is not, since it silently treats every other hostname as
 * safe.
 */
const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

export function classifyDatabaseUrl(
  raw: string | undefined | null,
): DatabaseUrlClassification {
  if (!raw || !raw.trim()) {
    return { kind: "missing" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Never echo the raw value anywhere — it may contain credentials.
    return { kind: "malformed" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { kind: "malformed" };
  }

  if (LOCAL_HOSTNAMES.has(hostname)) {
    return { kind: "local", hostname };
  }
  return { kind: "remote", hostname };
}

export function isLocalDatabaseUrl(raw: string | undefined | null): boolean {
  return classifyDatabaseUrl(raw).kind === "local";
}

/**
 * Prisma CLI subcommands that mutate a database's schema, data, or migration
 * bookkeeping. `generate`, `validate`, `format`, `version`, `studio`
 * (read-only browsing risk aside, out of scope here), and `migrate status`
 * are deliberately NOT included: they either perform no database mutation
 * or (for `generate`) may legitimately need to resolve a non-local
 * DATABASE_URL in CI/deploy contexts without actually connecting to it.
 */
const MUTATING_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "migrate deploy",
  "migrate dev",
  "migrate reset",
  "migrate resolve",
  "db push",
  "db execute",
  "db seed",
]);

const TOP_LEVEL_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "migrate",
  "db",
  "generate",
  "validate",
  "format",
  "studio",
  "version",
]);

/**
 * Reads the Prisma CLI subcommand out of argv (normally
 * `process.argv.slice(2)`). Finds the first token that names a known
 * top-level subcommand rather than assuming it's always argv[0], so a
 * leading value-taking flag (e.g. `--schema prisma/schema.prisma migrate
 * deploy`) doesn't get mistaken for the subcommand.
 */
function subcommandKey(argv: readonly string[]): string | null {
  const index = argv.findIndex((token) => TOP_LEVEL_SUBCOMMANDS.has(token));
  if (index === -1) {
    return null;
  }
  return argv.slice(index, index + 2).join(" ");
}

export function isMutatingPrismaInvocation(argv: readonly string[]): boolean {
  const key = subcommandKey(argv);
  return key !== null && MUTATING_SUBCOMMANDS.has(key);
}

/**
 * Deliberately long, specific, and un-guessable — this must never be set by
 * ordinary `.env`/`.env.local` loading or by copy-pasting a typical
 * boolean flag. A future legitimate production migration must set this
 * explicitly and knowingly, as its own separate, deliberate action.
 */
export const PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR =
  "PRISMA_ALLOW_REMOTE_MIGRATION_I_UNDERSTAND_THE_RISK";
const PRODUCTION_MIGRATION_OVERRIDE_VALUE =
  "YES_TARGET_PRODUCTION_DELIBERATELY";

export function isProductionMigrationExplicitlyAuthorized(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env[PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR] ===
    PRODUCTION_MIGRATION_OVERRIDE_VALUE
  );
}

export class UnsafePrismaInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePrismaInvocationError";
  }
}

/**
 * The actual guard. Throws (fail closed) when argv identifies a mutating
 * Prisma subcommand and the resolved DATABASE_URL is not local, unless the
 * explicit production-authorization env var is set to its exact expected
 * value. Never throws for non-mutating subcommands, so `generate`/
 * `validate`/etc. keep working against any environment as before.
 */
export function assertPrismaInvocationIsSafe(input: {
  argv: readonly string[];
  databaseUrl: string | undefined | null;
  env?: Record<string, string | undefined>;
}): void {
  if (!isMutatingPrismaInvocation(input.argv)) {
    return;
  }
  if (isProductionMigrationExplicitlyAuthorized(input.env ?? process.env)) {
    return;
  }

  const classification = classifyDatabaseUrl(input.databaseUrl);
  if (classification.kind === "local") {
    return;
  }

  const command = subcommandKey(input.argv) ?? "?";
  const reason =
    classification.kind === "remote"
      ? `DATABASE_URL resolves to a non-local host ("${classification.hostname}")`
      : classification.kind === "missing"
        ? "DATABASE_URL is not set"
        : "DATABASE_URL could not be parsed as a URL";

  throw new UnsafePrismaInvocationError(
    [
      `Refusing to run "prisma ${command}": ${reason}.`,
      "This command mutates a database and is only allowed against a local target",
      `(hostname in ${[...LOCAL_HOSTNAMES].join(", ")}).`,
      "Run `npm run db:migrate:local` (or the equivalent explicit-local wrapper) instead,",
      "which loads .env.local directly regardless of what .env contains.",
      `If this must genuinely target a remote database, set ${PRODUCTION_MIGRATION_OVERRIDE_ENV_VAR}`,
      "to its documented value as a separate, deliberate step — never as part of ordinary .env loading.",
    ].join(" "),
  );
}
