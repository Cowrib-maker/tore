import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "desktop/dist/**",
    "desktop/release/**",
    "desktop/node_modules/**",
  ]),
  // TORE Spell language engine must stay dependency-free so it can ship inside
  // the desktop client (or compile to WASM). See src/spell-engine/contracts.ts.
  {
    files: ["src/spell-engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/*",
                "node:*",
                "next",
                "next/*",
                "@prisma/*",
                "pg",
                "react",
                "react-dom",
              ],
              message:
                "src/spell-engine must not depend on app, framework, database or Node code.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
