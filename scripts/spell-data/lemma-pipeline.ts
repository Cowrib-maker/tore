/**
 * Controlled missing-lemma pipeline. A lemma is never imported on trust:
 *   candidates          LOCAL ONLY: UNKNOWN types of the dev corpus that look like lemma gaps → review items (provenance AUTOMATIC)
 *   export-provisional  every lemma the engine currently ships from AI-drafted vocab (tier PROVISIONAL) → gold/model/P_LEMMAS_PROVISIONAL.json
 *                       as review items, so native reviewers can approve / reject them in bulk
 *   ingest              NATIVE_REVIEWED lemma items (gold/native) → data/sources/vocab-reviewed/lemmas.tsv → pack tier REVIEWED
 *   status              lemma counts by tier
 *   npx tsx scripts/spell-data/lemma-pipeline.ts <command>
 * Release-quality coverage claims may only use TRUSTED + REVIEWED lemmas (createSpellEngineV1({ minTier: "TRUSTED" })).
 */
import fs from "node:fs";
import path from "node:path";
import { BUNDLED_PACKS } from "../../src/spell-engine/bundled";
import { REVIEW_SCHEMA, itemState, type LemmaProposal, type SpellReviewItem } from "../../src/spell-engine/review/review";
import { tierOf } from "../../src/spell-engine/lexicon/pack-schema";
import { DIRS, GOLD_ROOT, loadAll } from "../../tests/evaluation/spell-v3/gold-sets";
import { FREQ_FILE } from "./frequency";
import { loadFrequencyTable } from "./lib/hunspell-provider";

const ROOT = path.resolve(__dirname, "../..");
const REVIEWED_DIR = path.join(ROOT, "src/spell-engine/data/sources/vocab-reviewed");
const SET = "P_LEMMAS_PROVISIONAL";

const KIND = (layer: string, flags: readonly string[]): LemmaProposal["kind"] => (layer === "PROPER_NOUN" ? "PROPER" : layer === "ABBREVIATION" ? "ABBREVIATION" : flags.includes("loan") ? "LOAN" : layer === "TECH" || layer === "MEDICAL" ? "TECHNICAL" : "COMMON");

function exportProvisional() {
  const freq = fs.existsSync(FREQ_FILE) ? loadFrequencyTable(FREQ_FILE) : undefined;
  const items: SpellReviewItem[] = [];
  for (const p of BUNDLED_PACKS) {
    if (tierOf(p) !== "PROVISIONAL" || p.id === "tore-derived-deverbal" || p.id === "tore-corpus-forms") continue;
    for (const e of p.entries) {
      const flags = e.flags ?? [];
      if (flags.includes("form") || flags.includes("no-plural") || (e.pos ?? "X") === "X" && !flags.includes("no-infl") && p.layer !== "PROPER_NOUN") continue;
      const pm = freq ? freq.pm(e.w.toLowerCase()) : 0;
      const proposal: LemmaProposal = {
        pos: (e.pos ?? "X") as LemmaProposal["pos"], flags: flags.length ? [...flags] : undefined, domain: p.layer, kind: KIND(p.layer, flags),
        freqBucket: freq ? Math.max(0, Math.min(5, Math.floor(Math.log10(pm + 1) * 1.6))) : undefined, confidence: e.conf === "HIGH" ? "HIGH" : e.conf === "LOW" ? "LOW" : "MEDIUM", origin: p.provenance.source,
      };
      items.push({
        schema: REVIEW_SCHEMA, id: `LEMMA:${p.layer}:${e.pos ?? "X"}:${e.w}`, datasetVersion: "spell-gold-v3.0", token: e.w, sentenceOrigin: "NONE", category: p.layer === "PROPER_NOUN" ? "PROPER_NAME" : p.layer === "ABBREVIATION" ? "ABBREVIATION" : flags.includes("loan") ? "LOANWORD" : "VALID",
        currentVerdict: "VALID", currentReason: `shipped lemma (${p.id}, tier PROVISIONAL)`, source: p.provenance.source, provenance: "MODEL_ASSISTANT", priority: (proposal.freqBucket ?? 0) * 10 + (proposal.confidence === "LOW" ? 5 : 0), lemma: proposal,
        decisions: [{ seq: 1, reviewerId: "claude-assistant", reviewerKind: "MODEL_ASSISTANT", verdict: "VALID", note: "AI-drafted lemma; shipped as PROVISIONAL", at: "2026-10-08T00:00:00Z" }],
      });
    }
  }
  const file = path.join(GOLD_ROOT, "model", `${SET}.json`);
  const old = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { items: SpellReviewItem[] }) : { items: [] as SpellReviewItem[] };
  const oldById = new Map(old.items.map((i) => [i.id, i]));
  const merged = items.map((i) => (oldById.has(i.id) ? { ...i, decisions: oldById.get(i.id)!.decisions } : i));
  for (const o of old.items) if (!merged.some((m) => m.id === o.id) && o.decisions.some((d) => d.reviewerKind !== "MODEL_ASSISTANT")) merged.push(o); // keep anything a human touched
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ schema: "tore-spell-gold/1", datasetVersion: "spell-gold-v3.0", set: SET, provenanceDir: "model", note: "Every AI-drafted lemma currently shipped as PROVISIONAL. A NATIVE_HUMAN VALID decision from two distinct reviewers promotes it to the REVIEWED tier via `lemma-pipeline.ts ingest`.", items: merged }, null, 1) + "\n");
  const by = new Map<string, number>();
  for (const i of merged) by.set(i.lemma!.domain, (by.get(i.lemma!.domain) ?? 0) + 1);
  console.log(`${merged.length} provisional lemmas queued for native review:`, JSON.stringify(Object.fromEntries(by)));
}

function ingest() {
  const sets = loadAll().filter((s) => (s.set === SET || s.set === "P_LEMMA_CANDIDATES") && s.provenanceDir === "native");
  let skippedCandidates = 0;
  const lines: string[] = ["# REVIEWED lemmas: every line is backed by a NATIVE_REVIEWED item in tests/evaluation/spell-v3/gold/native/P_LEMMAS_PROVISIONAL.json (≥2 distinct native reviewers).", "# word\tpos\tflags\tdomain"];
  for (const s of sets) for (const i of s.items) {
    const st = itemState(i);
    if (st.status !== "NATIVE_REVIEWED" || st.verdict !== "VALID" || !i.lemma) continue;
    // Two natives who AGREED on a corrected record (spelling of the lemma, POS, flags, domain) define the reviewed lemma; otherwise the proposal stands.
    const c = st.lemmaCorrection;
    // A corpus CANDIDATE is only a surface form (maybe inflected): it enters the lexicon only when the agreeing natives named the LEMMA and its POS.
    if (i.id.startsWith("LEMMA_CANDIDATE:") && (!c?.lemma || !c.pos || c.pos === "X")) { skippedCandidates += 1; continue; }
    lines.push([c?.lemma ?? i.token, c?.pos ?? i.lemma.pos, (c?.flags ?? i.lemma.flags ?? []).join(","), c?.domain ?? i.lemma.domain].join("\t"));
  }
  fs.mkdirSync(REVIEWED_DIR, { recursive: true });
  fs.writeFileSync(path.join(REVIEWED_DIR, "lemmas.tsv"), lines.join("\n") + "\n");
  console.log(`ingested ${lines.length - 2} NATIVE_REVIEWED lemmas → vocab-reviewed/lemmas.tsv` + (skippedCandidates ? `; skipped ${skippedCandidates} reviewed candidates with no named lemma/POS` : ""));
}

async function candidates() {
  const { createSpellEngineV1 } = await import("../../src/spell-engine/bundled");
  const { hasEduge } = await import("./lib/corpus");
  const { loadHunspellResearchProvider } = await import("./lib/hunspell-provider");
  const { buildClassifier } = await import("./lib/taxonomy-lib");
  const { lex } = await import("../../src/spell-engine/tokenizer/lexer");
  const { normalizeToken } = await import("../../src/spell-engine/tokenizer/normalize");
  const { eduge } = await import("./lib/corpus");
  if (!hasEduge()) throw new Error("local corpus missing");
  const eng = createSpellEngineV1();
  const freq = loadFrequencyTable(FREQ_FILE);
  const hs = await loadHunspellResearchProvider(freq);
  const classify = buildClassifier(eng, hs, freq);
  const types = new Map<string, { key: string; n: number; titleOnly: boolean; upperOnly: boolean; sample: string }>();
  for await (const d of eduge(40_000)) {
    if (d.id % 4 !== 1) continue;
    for (const t of lex(d.text)) {
      if (t.kind !== "WORD") continue;
      const key = normalizeToken(t.text);
      const title = t.caseShape === "TITLE" || t.caseShape === "UPPER";
      const r = types.get(key);
      if (r) (r.n += 1, (r.titleOnly = r.titleOnly && title));
      else types.set(key, { key, n: 1, titleOnly: title, upperOnly: false, sample: t.text });
    }
  }
  const out: SpellReviewItem[] = [];
  for (const rec of [...types.values()].sort((a, b) => b.n - a.n)) {
    if (rec.n < 8 || out.length >= 3000) continue;
    if (eng.analyze(`и ${rec.titleOnly ? rec.sample : rec.key}`).tokens[1]!.verdict !== "UNKNOWN") continue;
    const c = classify(rec);
    // only the categories where a LEMMA is the likely missing piece; each stays a PROPOSAL until natives approve it
    if (c.cat !== "MISSING_LEMMA" && c.cat !== "LOANWORD" && c.cat !== "TECHNICAL_TERM") continue;
    out.push({
      schema: REVIEW_SCHEMA, id: `LEMMA_CANDIDATE:${rec.key}`, datasetVersion: "spell-queue-local", token: rec.key, sentenceOrigin: "NONE", category: c.cat === "LOANWORD" ? "LOANWORD" : c.cat === "TECHNICAL_TERM" ? "TECHNICAL_TERM" : "VALID",
      currentVerdict: "UNKNOWN", currentReason: `${c.cat}: ${c.evidence}`, source: "local news corpus (class D) — LOCAL ONLY", provenance: "AUTOMATIC", priority: rec.n,
      lemma: { pos: "X", domain: "GENERAL", kind: c.cat === "LOANWORD" ? "LOAN" : c.cat === "TECHNICAL_TERM" ? "TECHNICAL" : "COMMON", freqBucket: Math.min(5, Math.floor(Math.log10(rec.n + 1) * 1.6)), confidence: "LOW", origin: "corpus candidate (surface form, may be inflected: lemma unknown)" },
      decisions: [{ seq: 1, reviewerId: "engine", reviewerKind: "AUTOMATIC", verdict: "UNKNOWN", at: new Date().toISOString() }],
    });
  }
  const dir = path.join(ROOT, ".spell-research/review-queue");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lemma-candidates.json"), JSON.stringify({ schema: "tore-spell-review-queue/1", items: out }, null, 1));
  console.log(`${out.length} LOCAL lemma candidates (UNKNOWN, ≥8 occurrences, lemma-gap categories) → .spell-research/review-queue/lemma-candidates.json`);
  hs.dispose();
}

function status() {
  const by: Record<string, Record<string, number>> = {};
  for (const p of BUNDLED_PACKS) {
    if (p.id === "tore-derived-deverbal") continue;
    const t = tierOf(p);
    by[t] ??= {};
    by[t]![p.layer] = (by[t]![p.layer] ?? 0) + p.entries.length;
  }
  console.log("shipped entries by tier / layer:", JSON.stringify(by));
  console.log(`rule-generated (derived-deverbal): ${BUNDLED_PACKS.find((p) => p.id === "tore-derived-deverbal")?.entries.length ?? 0} entries, tier PROVISIONAL`);
  void DIRS;
}

const cmd = process.argv[2];
if (cmd === "export-provisional") exportProvisional();
else if (cmd === "ingest") ingest();
else if (cmd === "candidates") void candidates();
else if (cmd === "status") status();
else console.log("usage: export-provisional | ingest | candidates | status");
