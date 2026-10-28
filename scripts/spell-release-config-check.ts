/**
 * Production-readiness check for TORE Spell. Reads the CURRENT process environment (export the production variables into a shell first) and prints
 * one line per requirement; it never prints a value. Exit code 1 while any blocker remains.
 *   npx tsx scripts/spell-release-config-check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { checkSpellProductionConfig, hasBlockers } from "../src/infrastructure/spell/release-config";

const pinned = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../desktop/config/pinned-keys.production.json"), "utf8"));
const checks = checkSpellProductionConfig(process.env, { pinnedProductionKeys: pinned });
for (const c of checks) console.log(`${c.status.padEnd(8)} ${c.id.padEnd(16)} ${c.message}${c.blocker ? "   ← BLOCKER" : ""}`);
const n = checks.filter((c) => c.blocker).length;
console.log(`\n${n} blocker(s). ${hasBlockers(checks) ? "NOT READY for production." : "No configuration blockers (this does not verify QPay, hosting content or the installer)."}`);
process.exit(hasBlockers(checks) ? 1 : 0);
