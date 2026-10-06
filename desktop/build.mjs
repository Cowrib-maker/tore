// Bundles main + preload (and the local spell engine) with esbuild.
// Environment model: TORE_SPELL_ENV = development | staging | production
// (see config/environments.json). Production refuses to build without a
// pinned public signing key. Nothing secret is read or baked in.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
process.chdir(root);

const envName = process.env.TORE_SPELL_ENV ?? (process.argv.includes("--release") ? "production" : "development");
const envs = JSON.parse(readFileSync(join(root, "config/environments.json"), "utf8"));
const cfg = envs[envName];
if (!cfg) fail(`unknown TORE_SPELL_ENV "${envName}" (expected: ${Object.keys(envs).join(", ")})`);

const release = envName !== "development";
// An override is a dev/staging convenience only; production origin is fixed in config.
const apiBase = envName === "production" ? cfg.apiBase : (process.env.TORE_SPELL_API_BASE || cfg.apiBase);
if (release && !apiBase) fail(`${envName}: no API origin configured`);
if (envName === "production" && !/^https:\/\//.test(apiBase)) fail("production API origin must be https");

let pinned = { keys: [] };
if (cfg.pinnedKeys) {
  const file = join(root, "config", cfg.pinnedKeys);
  if (existsSync(file)) pinned = JSON.parse(readFileSync(file, "utf8"));
}
if (release && !(pinned.keys?.length > 0)) fail(`${envName}: pinned public signing key missing (config/${cfg.pinnedKeys})`);
for (const k of pinned.keys) {
  if (k.d || k.kty !== "OKP" || k.crv !== "Ed25519" || !k.kid || !k.x) fail("pinned key file must contain only public Ed25519 keys with a kid");
}

function fail(msg) {
  console.error(`build.mjs: ${msg}`);
  process.exit(1);
}

mkdirSync("dist", { recursive: true });
const common = {
  absWorkingDir: root,
  define: {
    __TORE_ENV__: JSON.stringify(envName),
    __TORE_LABEL__: JSON.stringify(cfg.label),
    __TORE_API_BASE__: JSON.stringify(apiBase ?? ""),
    __TORE_PINNED_JWKS__: JSON.stringify(pinned),
  },
  bundle: true, platform: "node", target: "node22", sourcemap: false, external: ["electron"], logLevel: "info", loader: { ".json": "json" },
};
await build({ ...common, entryPoints: ["app/main.ts"], outfile: "dist/main.js" });
await build({ ...common, entryPoints: ["app/preload.ts"], outfile: "dist/preload.js" });
cpSync("app/renderer", "dist/renderer", { recursive: true });
console.log(`built env=${envName} api=${apiBase || "(none)"} pinnedKeys=${pinned.keys.map((k) => k.kid).join(",") || "(none)"}`);
