/**
 * Stage — verify-license. Checks (1) the registry is internally consistent,
 * (2) every downloaded file still matches the recorded sha256, (3) re-reads any
 * licence/README text that was downloaded and flags contradictions, and
 * (4) prints the status table. Exit 1 on any inconsistency.
 *   npx tsx scripts/spell-data/verify-license.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateRegistry } from "./provenance";
import { RESEARCH_DIR, SOURCES } from "./sources";

const ROOT = path.resolve(__dirname, "../..");
let bad = 0;
const problems = validateRegistry();
for (const p of problems) {
  console.error(`REGISTRY: ${p}`);
  bad += 1;
}
const manifestPath = path.join(ROOT, RESEARCH_DIR, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, { files: Record<string, { sha256: string }> }>) : {};
for (const [id, m] of Object.entries(manifest)) {
  const dirName = id === "tugstugi-datasets" ? "tugstugi" : id;
  for (const [file, rec] of Object.entries(m.files)) {
    const f = path.join(ROOT, RESEARCH_DIR, dirName, file);
    if (!fs.existsSync(f)) continue;
    const h = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    if (h !== rec.sha256) {
      console.error(`CHANGED: ${id}/${file} no longer matches its recorded sha256 — re-verify the licence`);
      bad += 1;
    }
  }
}
// The dict-mn README is the evidence for its AMBIGUOUS status: confirm both statements are still present.
const readme = path.join(ROOT, RESEARCH_DIR, "dict-mn/README_mn_MN.txt");
if (fs.existsSync(readme)) {
  const t = fs.readFileSync(readme, "utf8");
  const noRedistribute = /Өөрчлөн тараахыг хориглоно/.test(t);
  const lppl = /LaTeX Project Public License/.test(t);
  console.log(`dict-mn evidence: prohibition=${noRedistribute} lppl=${lppl} → ${noRedistribute && lppl ? "CONTRADICTORY (stays UNVERIFIED)" : "re-read the licence"}`);
}
console.log("\nsourceId".padEnd(30) + "status".padEnd(24) + "class".padEnd(22) + "localUse");
for (const s of SOURCES) console.log(s.sourceId.padEnd(29) + s.status.padEnd(24) + s.dataClass.padEnd(22) + s.localUse);
const shippable = SOURCES.filter((s) => s.status === "VERIFIED_SHIPPABLE").length;
console.log(`\n${SOURCES.length} sources · ${shippable} VERIFIED_SHIPPABLE (all TORE-created) · ${bad === 0 ? "registry consistent" : bad + " problem(s)"}`);
process.exit(bad === 0 ? 0 : 1);
