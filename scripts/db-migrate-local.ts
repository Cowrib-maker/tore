/**
 * Safe, explicit entry point for local Prisma migration commands.
 *
 * Unlike `npm run db:migrate` (`prisma migrate dev`) or any other raw
 * `npx prisma ...` invocation, this script does NOT depend on Next.js's
 * `.env.local`-overrides-`.env` precedence, and does not rely on
 * `dotenv/config`'s default `.env`-only loading either — both of those are
 * exactly what caused the Sprint 14 incident (`.env` held the production
 * DATABASE_URL; `prisma.config.ts`'s `import "dotenv/config"` only reads
 * `.env`, never `.env.local`).
 *
 * Instead this reads `.env.local` directly, verifies the DATABASE_URL it
 * contains resolves to a local host, and only then spawns `prisma` with
 * that exact value injected into the child process's environment —
 * regardless of what `.env` contains. `prisma.config.ts`'s own guard
 * (scripts/lib/database-url-safety.ts) still runs too, as a second,
 * independent check.
 *
 * Usage:
 *   npm run db:migrate:local              -> prisma migrate dev
 *   npm run db:migrate:local -- deploy    -> prisma migrate deploy
 *   npm run db:migrate:local -- reset     -> prisma migrate reset
 *   npm run db:migrate:local -- status    -> prisma migrate status
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { classifyDatabaseUrl } from "./lib/database-url-safety";

function loadEnvLocalDatabaseUrl(): string {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envLocalPath)) {
    console.error(
      "[db:migrate:local] Refusing to run: .env.local was not found at the repository root. " +
        "This script only ever targets the DATABASE_URL declared in .env.local, never .env.",
    );
    process.exit(1);
  }

  const content = readFileSync(envLocalPath, "utf8");
  const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    console.error(
      "[db:migrate:local] Refusing to run: .env.local has no DATABASE_URL line.",
    );
    process.exit(1);
  }
  return match[1].trim();
}

function main(): void {
  const databaseUrl = loadEnvLocalDatabaseUrl();
  const classification = classifyDatabaseUrl(databaseUrl);

  if (classification.kind !== "local") {
    const reason =
      classification.kind === "remote"
        ? `it resolves to a non-local host ("${classification.hostname}")`
        : classification.kind === "malformed"
          ? "it could not be parsed as a URL"
          : "it is not set";
    console.error(
      `[db:migrate:local] Refusing to run: .env.local's DATABASE_URL is not local — ${reason}. ` +
        "Fix .env.local before running this script. Never point .env.local at a remote database.",
    );
    process.exit(1);
  }

  const forwardedArgs = process.argv.slice(2);
  const prismaArgs =
    forwardedArgs.length > 0 ? ["migrate", ...forwardedArgs] : ["migrate", "dev"];
  // Forwarded args like `-- push` (for `prisma db push`) aren't a `migrate`
  // subcommand — detect that one explicit case rather than guessing broadly.
  const finalArgs =
    forwardedArgs[0] === "push" ? ["db", "push", ...forwardedArgs.slice(1)] : prismaArgs;

  console.log(
    `[db:migrate:local] target: ${classification.hostname} (from .env.local) — running: prisma ${finalArgs.join(" ")}`,
  );

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", ...finalArgs],
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      shell: process.platform === "win32",
    },
  );
  process.exit(result.status ?? 1);
}

main();
