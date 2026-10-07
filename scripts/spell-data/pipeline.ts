/**
 * TORE Spell data pipeline — one repeatable entry point.
 *   npx tsx scripts/spell-data/pipeline.ts <stage> [args]
 *
 *   discover     list every known source, its data class and whether it may ship
 *   fetch        download LOCAL-ONLY research data into .spell-research/ (class C/D)
 *   extract      TORE-owned text → tokenise → normalise → frequency → filter → gate → corpus-forms.tsv
 *   frequency    local corpus word frequencies (class D derived, never bundled)
 *   audit        real-text audit: engine verdicts vs second opinion  (corpus-eval.ts)
 *   synthetic    seeded error injection on real text            (synthetic-eval.ts)
 *   build        sources (*.tsv) → packs → dist/spell-pack/ + manifest (class A/B only)
 *   benchmark    full benchmark (scripts/benchmark-spell-engine.ts)
 *
 * Language knowledge lives in src/spell-engine/data/sources/*.tsv; this script
 * only moves it through the gates. Nothing is ever edited by hand in a
 * generated JSON file.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SHIPPABLE_DATA_CLASSES, validatePack } from "../../src/spell-engine/lexicon/pack-schema";
import { allSpellVersions } from "../../src/spell-engine/core/versions";
import { ERROR_MODEL_VERSION } from "../../src/spell-engine/ranking/rank";
import { assertShippable } from "./provenance";
import { SOURCES } from "./sources";

const ROOT = path.resolve(__dirname, "../..");
const PACKS = path.join(ROOT, "src/spell-engine/data/packs");
const DIST = path.join(ROOT, "dist/spell-pack");
const run = (script: string, ...args: string[]) => {
  const r = spawnSync("npx", ["tsx", script, ...args], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

function discover() {
  console.log("A  TORE-owned: src/spell-engine/data/sources/*.tsv → packs (bundled)");
  for (const s of SOURCES) {
    const present = (s.files ?? []).length > 0 && (s.files ?? []).every((f) => fs.existsSync(path.join(ROOT, ".spell-research", s.sourceId === "tugstugi-datasets" ? "tugstugi" : s.sourceId, f.file)));
    console.log(`${s.dataClass.slice(0, 1)}  ${s.sourceId.padEnd(30)} ${s.status.padEnd(22)} local=${present ? "present" : "-"}  — ${s.name}`);
  }
}

function build() {
  run("scripts/build-spell-packs.ts");
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  const files: Record<string, unknown>[] = [];
  let entries = 0;
  for (const f of fs.readdirSync(PACKS).filter((x) => x.endsWith(".json")).sort()) {
    const raw = fs.readFileSync(path.join(PACKS, f));
    const json = JSON.parse(raw.toString("utf8")) as { provenance?: { dataClass?: string; redistributable?: boolean }; entries?: unknown[]; pairs?: unknown[]; id?: string; version?: string };
    const dc = json.provenance?.dataClass as (typeof SHIPPABLE_DATA_CLASSES)[number] | undefined;
    if (!dc || !SHIPPABLE_DATA_CLASSES.includes(dc) || json.provenance?.redistributable !== true) {
      throw new Error(`REFUSED: ${f} is not class A/B shippable data (dataClass=${dc}, redistributable=${json.provenance?.redistributable})`);
    }
    assertShippable((json as { provenance?: { sourceIds?: string[] } }).provenance?.sourceIds, f);
    if (json.entries) {
      const problems = validatePack(json);
      if (problems.length) throw new Error(`REFUSED: ${f} invalid: ${problems.slice(0, 3).join("; ")}`);
      entries += json.entries.length;
    }
    fs.writeFileSync(path.join(DIST, f), raw);
    files.push({ file: f, tier: (json as { provenance?: { tier?: string } }).provenance?.tier ?? "PROVISIONAL", sourceIds: (json as { provenance?: { sourceIds?: string[] } }).provenance?.sourceIds, reviewStatus: (json as { provenance?: { reviewStatus?: string } }).provenance?.reviewStatus, id: json.id ?? "typo-pairs", dataClass: dc, entries: json.entries?.length ?? json.pairs?.length ?? 0, bytes: raw.length, sha256: crypto.createHash("sha256").update(raw).digest("hex") });
  }
  const version = /version":\s*"([^"]+)"/.exec(fs.readFileSync(path.join(PACKS, "general.json"), "utf8"))?.[1] ?? "unknown";
  const manifest = {
    schema: "tore-spell-langpack/1",
    versions: allSpellVersions({ languagePack: version, lexicon: version, errorModel: ERROR_MODEL_VERSION }),
    sources: [...new Set(files.flatMap((f) => (f as { sourceIds?: string[] }).sourceIds ?? []))].map((id) => ({ sourceId: id, status: SOURCES.find((s) => s.sourceId === id)?.status })),
    shippable: true,
    lexiconEntries: entries,
    // entries per trust tier: a release-quality claim may only cite TRUSTED + REVIEWED (docs/spell/PHASE-3-DATA-TIERS.md)
    entriesByTier: files.reduce<Record<string, number>>((acc, f) => ((acc[(f as { tier: string }).tier] = (acc[(f as { tier: string }).tier] ?? 0) + Number((f as { entries?: number }).entries ?? 0)), acc), {}),
    files,
    note: "Class A/B data only. Research (C) and benchmark (D) data never enter this directory.",
  };
  fs.writeFileSync(path.join(DIST, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`dist/spell-pack: ${files.length} files, ${entries} lexicon entries, versions ${JSON.stringify(manifest.versions)}`);
}

const stage = process.argv[2];
const rest = process.argv.slice(3);
const STAGES: Record<string, () => void> = {
  discover,
  fetch: () => run("scripts/spell-data/fetch-research.ts", ...rest),
  "verify-license": () => run("scripts/spell-data/verify-license.ts"),
  extract: () => run("scripts/spell-extract-corpus-forms.ts", ...rest),
  // normalize → tokenize → deduplicate → frequency are one pass over the corpus (the engine's offset-preserving lexer + normalizer)
  normalize: () => run("scripts/spell-data/frequency.ts", ...rest),
  tokenize: () => run("scripts/spell-data/frequency.ts", ...rest),
  deduplicate: () => run("scripts/spell-data/frequency.ts", ...rest),
  frequency: () => run("scripts/spell-data/frequency.ts", ...rest),
  "candidate-lexicon": () => run("scripts/spell-data/candidates.ts", ...rest),
  morphology: () => {
    run("scripts/spell-data/verb-flags-suggest.ts", ...rest);
    run("scripts/spell-data/unknown-analysis.ts", ...rest);
  },
  "vocab-qa": () => run("scripts/spell-data/vocab-qa.ts", ...rest),
  audit: () => run("scripts/spell-data/corpus-eval.ts", ...rest),
  "review-export": () => run("scripts/spell-data/review.ts", "export", ...rest),
  "review-import": () => run("scripts/spell-data/review.ts", "import", ...rest),
  synthetic: () => run("scripts/spell-data/synthetic-eval.ts", ...rest),
  context: () => run("scripts/spell-data/context-eval.ts", ...rest),
  benchmark: () => {
    run("scripts/benchmark-spell-engine.ts", ...rest);
    run("scripts/spell-data/benchmark-genres.ts", ...rest);
  },
  gate: () => run("scripts/spell-data/gate.ts", ...rest),
  build,
};
if (stage && STAGES[stage]) STAGES[stage]!();
else {
  console.log(`stages: ${Object.keys(STAGES).join(" | ")}`);
  process.exit(stage ? 1 : 0);
}
