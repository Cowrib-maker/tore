/**
 * Proper-name and loanword EVALUATION sets (assistant-authored, PENDING_NATIVE_REVIEW — not gold).
 * Pure functions of (engine, dataset) → report; used by scripts/spell-data/eval-names-loans.ts and the unit tests.
 */
import fs from "node:fs";
import path from "node:path";
import type { SpellEngineV1 } from "../../../src/spell-engine";

const DIR = path.join(__dirname, "gold");
type Verdict = "VALID" | "UNKNOWN" | "MISSPELLED";

export type NameSet = { reviewStatus: string; names: { base: string; kind: "PERSON" | "PLACE" | "ORG"; forms: string[] }[] };
export type LoanSet = { reviewStatus: string; loans: { base: string; forms: string[] }[]; nonStandard: { word: string; right: string }[] };

export const loadNameSet = (): NameSet => JSON.parse(fs.readFileSync(path.join(DIR, "propername-eval-v1.json"), "utf8")) as NameSet;
export const loadLoanSet = (): LoanSet => JSON.parse(fs.readFileSync(path.join(DIR, "loanword-eval-v1.json"), "utf8")) as LoanSet;

/** Verdict of a word in a mid-sentence position (a capitalised mid-sentence word is a name candidate). */
function verdictIn(engine: SpellEngineV1, word: string, text: (w: string) => string): { verdict: Verdict; suggestions: string[] } {
  const t = text(word);
  const res = engine.analyze(t);
  const start = t.indexOf(word);
  const tok = res.tokens.find((x) => x.token.range.start === start);
  const issue = res.issues.find((i) => i.range.start === start);
  return { verdict: (tok?.verdict ?? "UNKNOWN") as Verdict, suggestions: (issue?.suggestions ?? []).map((s) => s.text) };
}

export function evaluateNames(engine: SpellEngineV1) {
  const set = loadNameSet();
  const out = { forms: 0, valid: 0, unknown: 0, misspelled: 0, bases: 0, accused: [] as string[], byKind: {} as Record<string, { forms: number; accused: number; valid: number }> };
  for (const n of set.names) {
    for (const f of [n.base, ...n.forms]) {
      const v = verdictIn(engine, f, (w) => `Манай найз ${w} өнөөдөр ирлээ.`).verdict;
      out.forms += 1;
      const k = (out.byKind[n.kind] ??= { forms: 0, accused: 0, valid: 0 });
      k.forms += 1;
      if (v === "VALID") (out.valid += 1, (k.valid += 1));
      else if (v === "UNKNOWN") out.unknown += 1;
      else (out.misspelled += 1, (k.accused += 1), out.accused.push(f));
    }
    out.bases += 1;
  }
  return { ...out, falseAccusationRate: out.misspelled / out.forms, recognitionRate: out.valid / out.forms };
}

export function evaluateLoans(engine: SpellEngineV1) {
  const set = loadLoanSet();
  const out = { forms: 0, valid: 0, unknown: 0, misspelled: 0, accused: [] as string[], nonStandard: 0, nsDetected: 0, nsTop1: 0, nsAcceptedAsValid: 0 };
  for (const l of set.loans) {
    for (const f of [l.base, ...l.forms]) {
      const v = verdictIn(engine, f, (w) => `Энэ ${w} нь маш чухал.`).verdict;
      out.forms += 1;
      if (v === "VALID") out.valid += 1;
      else if (v === "UNKNOWN") out.unknown += 1;
      else (out.misspelled += 1, out.accused.push(f));
    }
  }
  for (const w of set.nonStandard) {
    const r = verdictIn(engine, w.word, (x) => `Энэ ${x} нь маш чухал.`);
    out.nonStandard += 1;
    if (r.verdict === "MISSPELLED") (out.nsDetected += 1, r.suggestions[0] === w.right && (out.nsTop1 += 1));
    if (r.verdict === "VALID") out.nsAcceptedAsValid += 1;
  }
  return { ...out, falseAccusationRate: out.misspelled / out.forms, recognitionRate: out.valid / out.forms };
}
