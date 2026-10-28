/**
 * Stage — fetch: download LOCAL-ONLY research/benchmark files.
 *   npx tsx scripts/spell-data/fetch-research.ts [--only <sourceId>]
 * Writes to .spell-research/<sourceId>/ (git-ignored) and records url, bytes,
 * sha256, downloadDate and the registry's status in .spell-research/manifest.json.
 * Nothing here is bundled, committed or uploaded; running it is an explicit developer decision.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RESEARCH_DIR, SOURCES } from "./sources";

const ROOT = path.resolve(__dirname, "../..");

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
  const dir = path.join(ROOT, RESEARCH_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const manifest: Record<string, unknown> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  for (const src of SOURCES) {
    if (!src.files?.length || (only && src.sourceId !== only)) continue;
    if (src.status === "PROHIBITED") {
      console.log(`skip ${src.sourceId}: PROHIBITED`);
      continue;
    }
    const sdir = path.join(dir, src.sourceId === "tugstugi-datasets" ? "tugstugi" : src.sourceId === "unimorph-khk" ? "unimorph-khk" : src.sourceId);
    fs.mkdirSync(sdir, { recursive: true });
    const files: Record<string, { url: string; bytes: number; sha256: string; downloadDate: string }> = {};
    for (const f of src.files) {
      const target = path.join(sdir, f.file);
      let fresh = false;
      if (!fs.existsSync(target)) {
        process.stdout.write(`fetch ${src.sourceId}/${f.file} … `);
        const res = await fetch(f.url);
        if (!res.ok) {
          console.log(`HTTP ${res.status}`);
          continue;
        }
        fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
        fresh = true;
        console.log("ok");
      }
      const buf = fs.readFileSync(target);
      const prev = (manifest[src.sourceId] as { files?: Record<string, { downloadDate: string }> } | undefined)?.files?.[f.file];
      files[f.file] = {
        url: f.url,
        bytes: buf.length,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        downloadDate: fresh ? new Date().toISOString() : (prev?.downloadDate ?? new Date(fs.statSync(target).mtimeMs).toISOString()),
      };
    }
    manifest[src.sourceId] = { name: src.name, status: src.status, dataClass: src.dataClass, license: src.license, version: src.version, localUse: src.localUse, files };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${path.relative(ROOT, manifestPath)}  (class C/D data: local only, never bundled)`);
}

void main();
