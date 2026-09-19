import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["tests/setup-env.ts"],
    server: {
      // Force these through Vite's resolver (where the "next/server" alias
      // below applies) instead of Node's native ESM resolver, which fails
      // on next-auth's extensionless "next/server" import.
      deps: { inline: [/next-auth/, /@auth\/core/] },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // next's package.json has no "exports" map; Vite's resolver (unlike
      // Node's own require/import) doesn't fall back to the extensionless
      // "next/server" specifier that next-auth imports internally.
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
});
