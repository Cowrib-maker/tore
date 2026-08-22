import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Isolated from unit tests. `npm run test` does not include this file.
 * Real QPay Sandbox HTTP is allowed here only.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    setupFiles: ["tests/e2e/setup-env.ts"],
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
