import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Database-backed tests (real Postgres) for TORE Spell: the concurrency,
 * constraint and trigger guarantees that in-memory repositories cannot prove.
 * Isolated from `npm test`. Requires SPELL_TEST_DATABASE_URL pointing at a
 * LOCAL, already-migrated database (see tests/db/setup-env.ts).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    setupFiles: ["tests/db/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    server: { deps: { inline: [/next-auth/, /@auth\/core/] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
});
