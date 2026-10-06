// Verifies the PACKAGED Windows/Electron app content (app.asar) before release.
//   node scripts/verify-package.mjs release/win-unpacked/resources/app.asar
// Fails (exit 1) if server secrets / private keys / dev URLs are inside, or if
// the production origin and pinned PUBLIC key are missing. Prints no secret.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const asar = process.argv[2];
if (!asar) {
  console.error("usage: verify-package.mjs <path/to/app.asar>");
  process.exit(2);
}
const require = createRequire(import.meta.url);
const asarCli = require.resolve("@electron/asar/bin/asar.js");
const out = mkdtempSync(join(tmpdir(), "spell-asar-"));
execFileSync(process.execPath, [asarCli, "extract", asar, out], { stdio: "inherit" });

function walk(d, acc = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const files = walk(out);
const text = files.map((f) => readFileSync(f, "utf8")).join("\n");

const FORBIDDEN = [
  ["private key (PEM)", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Ed25519 PKCS#8 blob", /MC4CAQAwBQYDK2VwBCIEI[A-Za-z0-9+/=]{20,}/],
  ["signing key ring variable", /SPELL_SIGNING_KEYS\s*[=:]/],
  ["code vault key variable", /SPELL_CODE_(HMAC|ENC)_KEYS\s*[=:]/],
  ["QPay credential variable", /QPAY_CLIENT_(ID|SECRET)\s*[=:]/],
  ["database URL", /postgres(?:ql)?:\/\/[^\s"']+/],
  ["development API origin", /http:\/\/localhost:3000/],
  ["JWT", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
];
const REQUIRED = [
  ["production origin", /https:\/\/www\.tore\.mn/],
  ["pinned public key id", /spell-2026-10/],
  ["Ed25519 public JWK", /crv["']?\s*:\s*["']Ed25519/],
];

let bad = 0;
for (const [name, rx] of FORBIDDEN) if (rx.test(text)) { console.error(`FORBIDDEN content in package: ${name}`); bad += 1; }
for (const [name, rx] of REQUIRED) if (!rx.test(text)) { console.error(`MISSING in package: ${name}`); bad += 1; }
// a pinned key file must be public-only
const pinned = text.match(/keys["']?\s*:\s*\[[^\]]*\]/g) ?? [];
if (pinned.some((k) => /[,{]\s*["']?d["']?\s*:\s*["']/.test(k))) { console.error("pinned key set contains private material"); bad += 1; }

rmSync(out, { recursive: true, force: true });
console.log(`package verified: ${files.length} files, ${bad === 0 ? "no forbidden content, production origin + pinned public key present" : bad + " problem(s)"}`);
process.exit(bad === 0 ? 0 : 1);
