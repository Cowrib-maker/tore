import { classifyDatabaseUrl } from "./database-url-safety";

/**
 * Prints which database host a script is about to mutate — loud, upfront,
 * before any write. This script has no local-only restriction (it's a
 * deliberate ops backfill that may legitimately target any environment),
 * so this is the cheap defense-in-depth Section J asks for: an operator
 * who only meant to test locally sees immediately, before anything
 * happens, if `.env`'s ambient DATABASE_URL resolved somewhere else.
 * Never throws, never logs the raw connection string.
 */
export function announceDatabaseTarget(
  scriptLabel: string,
  databaseUrl: string | undefined | null,
): void {
  const classification = classifyDatabaseUrl(databaseUrl);
  const host =
    classification.kind === "local" || classification.kind === "remote"
      ? classification.hostname
      : classification.kind;
  const kind = classification.kind === "local" ? "LOCAL" : "NON-LOCAL";
  console.log(`[${scriptLabel}] target database: ${host} (${kind})`);
}
