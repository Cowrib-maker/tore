import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Real-PostgreSQL acceptance test for TORE Student account progress. Isolated from `npm test`.
 * It only runs against a database that passes every guard in tests/db-student/setup-env.ts.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db-student/**/*.db.test.ts"],
    setupFiles: ["tests/db-student/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
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
