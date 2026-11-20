/**
 * Build / refresh the Phase-3 gold CANDIDATE sets (tests/evaluation/spell-v3/gold/<provenance>/<SET>.json).
 *   npx tsx scripts/spell-data/build-gold-v3.ts
 *
 * Everything this script generates is MODEL_ASSISTANT-authored and carries exactly one MODEL_ASSISTANT decision («the assistant intended this
 * to be correct / judged this expected verdict»): status MODEL_ADJUDICATED. It is NOT gold. Native gold only ever appears in gold/native/ and only
 * through `review-v3.ts import` with ≥2 distinct NATIVE_HUMAN reviewers.
 * Re-running refreshes the ENGINE-OUTPUT fields (currentVerdict …) and adds new items; existing decisions are NEVER touched or dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { createSpellEngineV1 } from "../../src/spell-engine/bundled";
import { REVIEW_SCHEMA, validateItem, type ReviewCategory, type SpellReviewItem } from "../../src/spell-engine/review/review";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import { PASSAGES } from "../../tests/evaluation/spell-v3/authoring/passages";
import { TARGETED } from "../../tests/evaluation/spell-v3/authoring/targeted";
import { loadLoanSet, loadNameSet } from "../../tests/evaluation/spell-v1/eval-sets";
import { locate } from "../../tests/evaluation/spell-v3/gold-sets";

export const DATASET_VERSION = "spell-gold-v3.0";
const ROOT = path.resolve(__dirname, "../../tests/evaluation/spell-v3/gold");
const MODEL_ID = "claude-assistant";
const AT = "2026-10-08T00:00:00Z";
const engine = createSpellEngineV1();

const verdictOf = (token: string, sentence?: string) => {
  const text = sentence ?? `Энэ ${token} нь`;
  const res = engine.analyze(text);
  const start = locate(text, token);
  const tok = res.tokens.find((x) => x.token.range.start === start);
  const issue = res.issues.find((i) => i.range.start === start);
  return { verdict: (tok?.verdict ?? "UNKNOWN") as "VALID" | "MISSPELLED" | "UNKNOWN", suggestion: issue?.suggestions[0]?.text, reason: tok?.reasonCode as string | undefined, status: issue?.suggestionStatus };
};

type SetFile = { schema: "tore-spell-gold/1"; datasetVersion: string; set: string; provenanceDir: string; note: string; items: SpellReviewItem[] };
const files = new Map<string, SetFile>();

function put(set: string, item: Omit<SpellReviewItem, "schema" | "datasetVersion" | "decisions" | "provenance">, expected: { verdict: "VALID" | "MISSPELLED" | "UNKNOWN"; suggestion?: string; note: string }) {
  const f = files.get(set) ?? { schema: "tore-spell-gold/1" as const, datasetVersion: DATASET_VERSION, set, provenanceDir: "model", note: "MODEL_ADJUDICATED candidates: authored and judged by the AI assistant. NOT native-reviewed; NOT gold.", items: [] };
  files.set(set, f);
  f.items.push({
    ...item, schema: REVIEW_SCHEMA, datasetVersion: DATASET_VERSION, provenance: "MODEL_ASSISTANT",
    decisions: [{ seq: 1, reviewerId: MODEL_ID, reviewerKind: "MODEL_ASSISTANT", verdict: expected.verdict, suggestion: expected.suggestion, note: expected.note, at: AT }],
  });
}

// A–I: passages → one item per distinct word of each sentence
for (const p of PASSAGES) {
  p.sentences.forEach((sentence, si) => {
    const seen = new Set<string>();
    for (const t of lex(sentence)) {
      if (t.kind !== "WORD" || seen.has(t.text)) continue;
      seen.add(t.text);
      const v = verdictOf(t.text, sentence);
      const proper = t.caseShape === "TITLE" && !t.sentenceInitial;
      const category: ReviewCategory = proper ? "PROPER_NAME" : t.caseShape === "UPPER" ? "ABBREVIATION" : v.verdict === "UNKNOWN" ? "UNKNOWN" : "VALID";
      put(p.set, {
        id: `${p.set}:${String(si + 1).padStart(2, "0")}:${normalizeToken(t.text)}`, token: t.text, sentence, sentenceOrigin: "MODEL_AUTHORED", category,
        currentVerdict: v.verdict, currentSuggestion: v.suggestion, currentReason: v.reason,
        // review value: where the engine abstains or accuses, a native's time is worth most
        priority: v.verdict === "MISSPELLED" ? 100 : v.verdict === "UNKNOWN" ? 50 : 1, source: `authoring/passages.ts ${p.set} s${si + 1}`,
      }, { verdict: "VALID", note: "assistant-authored passage; intended to be correctly spelled" });
    }
  });
}

// J–O: targeted items
for (const t of TARGETED) {
  t.items.forEach(([token, expected, correction, note], i) => {
    const v = verdictOf(token);
    put(t.set, {
      id: `${t.set}:${String(i + 1).padStart(3, "0")}:${normalizeToken(token)}`, token, sentenceOrigin: "NONE", category: t.category as ReviewCategory,
      currentVerdict: v.verdict, currentSuggestion: v.suggestion, currentReason: v.reason, proposedVerdict: expected, proposedSuggestion: correction ?? undefined,
      priority: expected !== v.verdict ? 90 : expected === "UNKNOWN" ? 40 : 5, source: `authoring/targeted.ts ${t.set}`,
    }, { verdict: expected, suggestion: correction ?? undefined, note });
  });
}

// J / K: the Phase-2 in-sample name and loanword sets, re-labelled honestly
let n = 0;
for (const nm of loadNameSet().names) for (const f of [nm.base, ...nm.forms]) {
  n += 1;
  const v = verdictOf(f, `Манай найз ${f} ирлээ.`);
  put("J_PROPER_NAMES", { id: `J_PROPER_NAMES:${String(n).padStart(3, "0")}:${normalizeToken(f)}`, token: f, sentence: `Манай найз ${f} ирлээ.`, sentenceOrigin: "MODEL_AUTHORED", category: "PROPER_NAME", currentVerdict: v.verdict, currentSuggestion: v.suggestion, currentReason: v.reason, priority: v.verdict === "VALID" ? 2 : 60, source: "gold/propername-eval-v1.json (Phase 2, in-sample)" }, { verdict: "VALID", note: "name/place form hand-written by the assistant; may be non-standard" });
}
n = 0;
for (const l of loadLoanSet().loans) for (const f of [l.base, ...l.forms]) {
  n += 1;
  const v = verdictOf(f);
  put("K_LOANWORDS", { id: `K_LOANWORDS:${String(n).padStart(3, "0")}:${normalizeToken(f)}`, token: f, sentenceOrigin: "NONE", category: "LOANWORD", currentVerdict: v.verdict, currentSuggestion: v.suggestion, currentReason: v.reason, priority: v.verdict === "VALID" ? 2 : 60, source: "gold/loanword-eval-v1.json (Phase 2, in-sample)" }, { verdict: "VALID", note: "loan form hand-written by the assistant; both harmonies tolerated" });
}

// merge with existing files: keep every historical decision, refresh engine-output fields
let total = 0;
const problems: string[] = [];
for (const [set, f] of files) {
  const file = path.join(ROOT, f.provenanceDir, `${set}.json`);
  const old = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as SetFile) : undefined;
  const oldById = new Map((old?.items ?? []).map((i) => [i.id, i]));
  f.items = f.items.map((it) => {
    const prev = oldById.get(it.id);
    return prev ? { ...it, decisions: prev.decisions } : it;
  });
  for (const o of old?.items ?? []) if (!f.items.some((i) => i.id === o.id)) f.items.push(o); // never drop an item that has history
  for (const it of f.items) problems.push(...validateItem(it).map((p) => `${it.id}: ${p}`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(f, null, 1) + "\n");
  total += f.items.length;
  console.log(`${set.padEnd(24)} ${String(f.items.length).padStart(5)} items  (engine: ${f.items.filter((i) => i.currentVerdict === "VALID").length} VALID / ${f.items.filter((i) => i.currentVerdict === "UNKNOWN").length} UNKNOWN / ${f.items.filter((i) => i.currentVerdict === "MISSPELLED").length} MISSPELLED)`);
}
console.log(`total ${total} MODEL_ADJUDICATED candidate items in ${files.size} sets`);
if (problems.length) {
  console.error(problems.slice(0, 10).join("\n"));
  process.exit(1);
}
