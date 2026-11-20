/**
 * Generates an Ed25519 entitlement-signing key for TORE Spell (ADR-008).
 *
 *   npx tsx scripts/spell-generate-signing-key.ts --kid spell-2026-10 \
 *       --secret-out .secrets/spell-signing.env \
 *       --public-out desktop/config/pinned-keys.production.json
 *   npx tsx scripts/spell-generate-signing-key.ts --vault-out .secrets/spell-vault.env
 *       (license-code HMAC + encryption keys; also server-only)
 *
 * The PRIVATE half goes only to the secret file (mode 600, refuses to
 * overwrite, must never be committed — `.secrets/` is git-ignored). Copy its two
 * lines into the production server environment, then delete the file.
 * The PUBLIC half (a JWKS) is written to the desktop pinned-key file.
 * Nothing secret is ever printed.
 */
import { createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// --vault-out <file>: also generate the license-code vault keys (server-only secrets).
const vaultOut = arg("vault-out");
if (vaultOut) {
  if (fs.existsSync(vaultOut)) {
    console.error(`refusing to overwrite existing ${vaultOut}`);
    process.exit(1);
  }
  const k = () => randomBytes(32).toString("base64");
  fs.mkdirSync(path.dirname(vaultOut), { recursive: true });
  fs.writeFileSync(
    vaultOut,
    `SPELL_CODE_HMAC_KEYS=h1:${k()}\nSPELL_CODE_HMAC_ACTIVE_KEY_ID=h1\nSPELL_CODE_ENC_KEYS=e1:${k()}\nSPELL_CODE_ENC_ACTIVE_KEY_ID=e1\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(`vault keys written to ${vaultOut} (not shown)`);
  if (!arg("kid")) process.exit(0);
}

const kid = arg("kid");
const secretOut = arg("secret-out");
const publicOut = arg("public-out");
if (!kid || !/^[A-Za-z0-9_.-]{1,32}$/.test(kid) || !secretOut || !publicOut) {
  console.error("usage: --kid <id> --secret-out <file> --public-out <file>");
  process.exit(2);
}
for (const f of [secretOut, publicOut]) {
  if (fs.existsSync(f) && !(f === publicOut && JSON.parse(fs.readFileSync(f, "utf8")).keys?.length === 0)) {
    console.error(`refusing to overwrite existing ${f}`);
    process.exit(1);
  }
}

const { privateKey } = generateKeyPairSync("ed25519");
const der = (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString("base64");
const jwk = createPublicKey(privateKey).export({ format: "jwk" });

fs.mkdirSync(path.dirname(secretOut), { recursive: true });
fs.writeFileSync(secretOut, `SPELL_SIGNING_KEYS=${kid}:${der}\nSPELL_SIGNING_ACTIVE_KID=${kid}\n`, { mode: 0o600, flag: "wx" });
fs.mkdirSync(path.dirname(publicOut), { recursive: true });
fs.writeFileSync(publicOut, JSON.stringify({ keys: [{ ...jwk, kid, alg: "EdDSA", use: "sig" }] }, null, 2) + "\n");
console.log(`kid=${kid}\npublic key written to ${publicOut}\nsecret written to ${secretOut} (not shown)`);
