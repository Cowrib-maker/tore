/**
 * Verify the Windows installer against the configured release metadata. Prints sizes and results; never prints a URL, key or secret.
 *   npx tsx scripts/spell-verify-installer.ts --file ./TORE-Spell-Setup.exe
 *   npx tsx scripts/spell-verify-installer.ts --storage     (reads the object at SPELL_INSTALLER_STORAGE_KEY through the app's S3 configuration,
 *                                                            using a short-lived signed URL exactly as /api/spell/download does)
 * Needs SPELL_WINDOWS_INSTALLER_SHA256 (and optionally SPELL_WINDOWS_INSTALLER_SIZE) in the environment. Exit 0 only when the hash matches.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { getSpellInstallerStorageKey } from "../src/domain/spell/installer";
import { verifyInstallerIdentity, type InstallerIdentity } from "../src/domain/spell/installer-verify";

async function hashStream(stream: NodeJS.ReadableStream): Promise<InstallerIdentity> {
  const h = crypto.createHash("sha256");
  let bytes = 0;
  stream.on("data", (c: Buffer) => { bytes += c.length; });
  await pipeline(stream, h);
  return { sha256: h.digest("hex"), bytes };
}

async function main() {
  const args = process.argv.slice(2);
  let actual: InstallerIdentity;
  if (args.includes("--file")) {
    const file = args[args.indexOf("--file") + 1];
    if (!file || !fs.existsSync(file)) throw new Error("--file needs an existing path");
    actual = await hashStream(fs.createReadStream(file));
    console.log(`source: local file (${actual.bytes} bytes)`);
  } else if (args.includes("--storage")) {
    const key = getSpellInstallerStorageKey(process.env);
    if (!key) throw new Error("SPELL_INSTALLER_STORAGE_KEY is missing or not a valid key under spell-installer/");
    const { getFileStorage } = await import("../src/infrastructure/storage");
    const url = await getFileStorage().getUrl(key, { expiresInSeconds: 60 });
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`could not read the installer object (HTTP ${res.status})`);
    actual = await hashStream(Readable.fromWeb(res.body as never));
    console.log(`source: private storage object (${actual.bytes} bytes)`);
  } else {
    throw new Error("usage: --file <path> | --storage");
  }
  console.log(`sha256: ${actual.sha256}`);
  const result = verifyInstallerIdentity(actual, process.env);
  for (const c of result.checks) console.log(`${c.status.padEnd(14)} ${c.id.padEnd(18)} ${c.message}`);
  console.log(result.ok ? "\nVERIFIED: the installer matches the configured release metadata." : "\nNOT VERIFIED: do not publish this installer.");
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`error: ${e instanceof Error ? e.message : "unknown"}`);
  process.exit(2);
});
