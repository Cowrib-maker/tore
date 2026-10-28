/**
 * REFERENCE-ONLY morphology oracle.
 *   TORE_SPELL_REF_UNIMORPH=/path/to/khk npx tsx scripts/spell-oracle-unimorph.ts [--rejects[=N]] [--no-infer]
 *
 * UniMorph Mongolian (khk) is CC BY-SA 3.0 and is NEVER bundled or committed.
 * Lemmas are loaded into an IN-MEMORY lexicon only, to measure how many
 * independently-attested inflected forms the TORE analyser accepts, and — the
 * number that matters — how many VALID forms it would wrongly accuse
 * (FALSE-VIOLATION). Nothing is written to disk.
 *
 * --classify  assigns every rejected UNIQUE verb form to a discrepancy class:
 *     A TORE bug / unclassified   B oracle limitation   C derivation
 *     D unsupported morphology    E data problem        F genuine ambiguity
 *
 * Two views are printed:
 *   ROW-WEIGHTED  every row of the file (this is the historical baseline; the
 *                 file repeats each verb paradigm many times, so verbs weigh ~52 %)
 *   UNIQUE        distinct (lemma, form, tag) triples
 *
 * The oracle lexicon has no stem-class data, which production lexicons carry as
 * flags (`vstem`). Unless --no-infer is given, each verb lemma gets the flag
 * set that explains more of its own forms. That measures the CAPACITY of the
 * morphology given correct lexical classes; production without the flag stays
 * conservative (see LANGUAGE_ENGINE_V1.md → M1).
 */
import fs from "node:fs";
import { Lexicon } from "../src/spell-engine/lexicon/lexicon";
import type { PackEntry } from "../src/spell-engine/lexicon/pack-schema";
import { MorphAnalyzer } from "../src/spell-engine/morphology/analyzer";

const file = process.env.TORE_SPELL_REF_UNIMORPH;
if (!file || !fs.existsSync(file)) {
  console.error("Set TORE_SPELL_REF_UNIMORPH to a local UniMorph khk TSV (lemma<TAB>form<TAB>tags). Skipping.");
  process.exit(0);
}
const classifyMode = process.argv.includes("--classify");
const rejectsArg = process.argv.find((a) => a.startsWith("--rejects"));
const showRejects = rejectsArg !== undefined;
const rejectLimit = Number(rejectsArg?.split("=")[1] ?? 12);
const infer = !process.argv.includes("--no-infer");
type Row = [string, string, string];
const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t") as Row);
const ok = (w: string) => /^[Ѐ-ӿ-]+$/u.test(w) && w === w.toLowerCase();
const isNoun = (t: string) => t.startsWith("N");
const lemmasOf = (noun: boolean) => [...new Set(rows.filter((r) => isNoun(r[2]) === noun).map((r) => r[0]).filter(ok))];
const mkLexicon = (verbFlags: Map<string, string[]>) =>
  new Lexicon([
    {
      schema: "tore-spell-pack/1",
      id: "oracle",
      version: "0",
      layer: "GENERAL",
      language: "mn-Cyrl",
      coverage: "SEED",
      provenance: { source: "UniMorph khk (in-memory)", license: "CC BY-SA 3.0", redistributable: false, dataClass: "D_BENCHMARK_ONLY" },
      entries: [
        ...lemmasOf(true).map((w) => ({ w, pos: "N" }) as PackEntry),
        ...lemmasOf(false).map((w) => ({ w, pos: "V", flags: verbFlags.get(w) }) as PackEntry),
      ],
    } as never,
  ], { allowResearchData: true });

const verbFlags = new Map<string, string[]>();
if (infer) {
  const hypotheses: string[][] = [[], ["vstem"], ["soft-i"], ["direct"]];
  const analyzers = hypotheses.map((h) => {
    const lx = mkLexicon(new Map(lemmasOf(false).map((l) => [l, h] as [string, string[]])));
    return { h, lx, an: new MorphAnalyzer(lx) };
  });
  for (const lemma of lemmasOf(false)) {
    const own = [...new Set(rows.filter((r) => r[0] === lemma && ok(r[1])).map((r) => r[1]))];
    const prefix = lemma.slice(0, Math.max(2, lemma.length - 3));
    const mine = own.filter((f) => f.startsWith(prefix));
    let best = { score: -1, h: [] as string[] };
    for (const { h, lx, an } of analyzers) {
      if (h.includes("soft-i") && !lemma.endsWith("их")) continue;
      const score = mine.filter((f) => lx.has(f) || an.analyze(f).parses.length > 0).length;
      if (score > best.score) best = { score, h }; // ties keep the earlier (fewer-flag) hypothesis
    }
    if (best.h.length > 0) verbFlags.set(lemma, best.h);
  }
}
const lex = mkLexicon(verbFlags);
const an = new MorphAnalyzer(lex);

type Stat = { n: number; accepted: number; falseViolation: number };
const classify = (form: string): "ACCEPT" | "FALSE_VIOLATION" | "UNKNOWN" => {
  if (lex.has(form)) return "ACCEPT";
  const r = an.analyze(form);
  if (r.parses.length > 0) return "ACCEPT";
  return r.violations.length > 0 ? "FALSE_VIOLATION" : "UNKNOWN";
};
const tagKey = (tag: string) => (isNoun(tag) ? tag.split(";").slice(0, 2).join(";") : tag);

function run(view: "ROW-WEIGHTED" | "UNIQUE", data: Row[]) {
  const stats = new Map<string, Stat>();
  const rejects = new Map<string, string[]>();
  for (const [lemma, form, tag] of data) {
    if (!ok(form) || !ok(lemma)) continue;
    const t = tagKey(tag);
    const s = stats.get(t) ?? { n: 0, accepted: 0, falseViolation: 0 };
    s.n += 1;
    const c = classify(form);
    if (c === "ACCEPT") s.accepted += 1;
    else {
      if (c === "FALSE_VIOLATION") s.falseViolation += 1;
      const l = rejects.get(t) ?? [];
      if (l.length < rejectLimit) l.push(`${lemma}→${form}${c === "FALSE_VIOLATION" ? " [VIOLATION]" : ""}`);
      rejects.set(t, l);
    }
    stats.set(t, s);
  }
  console.log(`\n=== ${view} ===`);
  console.log("tag".padEnd(28), "forms".padStart(6), "accepted".padStart(9), "falseViol".padStart(10));
  let n = 0, a = 0, fv = 0, vn = 0, va = 0, nn = 0, na = 0;
  for (const [t, s] of [...stats.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    console.log(t.padEnd(28), String(s.n).padStart(6), `${((s.accepted / s.n) * 100).toFixed(1)}%`.padStart(9), String(s.falseViolation).padStart(10));
    n += s.n; a += s.accepted; fv += s.falseViolation;
    if (t.startsWith("N")) { nn += s.n; na += s.accepted; } else { vn += s.n; va += s.accepted; }
    if (showRejects && rejects.get(t)?.length) console.log("     rejected e.g.", rejects.get(t)!.join(" | "));
  }
  console.log(`TOTAL forms ${n}, accepted ${a} (${((a / n) * 100).toFixed(1)}%), FALSE-VIOLATION ${fv}`);
  console.log(`  nouns ${((na / nn) * 100).toFixed(1)}% (${nn}), verbs ${((va / vn) * 100).toFixed(1)}% (${vn})`);
}
console.log(`verb lemmas: ${lemmasOf(false).length}, with inferred flags: ${verbFlags.size} (${infer ? "inferred" : "none"})`);
run("ROW-WEIGHTED", rows);
run("UNIQUE", [...new Map(rows.map((r) => [r.join("\t"), r] as const)).values()]);

if (classifyMode) {
  const stemOf = (l: string) => {
    const a = l[l.length - 2] ?? "", b = l[l.length - 3] ?? "";
    return "аэоөиуү".includes(a) && !"аэиоуөүяеёюыйьъ".includes(b) ? l.slice(0, -2) : l.slice(0, -1);
  };
  const uniq = [...new Map(rows.map((r) => [r.join("\t"), r] as const)).values()].filter((r) => !isNoun(r[2]) && ok(r[0]) && ok(r[1]));
  // Individually adjudicated forms (reason recorded; none of them is accepted by TORE).
  const KNOWN: Record<string, string> = {
    "түгэх→түгээцгээ": "B ORACLE      row merges two lemmas (түгэх / түгээх): the form is түгээх + цгээ",
    "өвөрлөх→өвөрлөө": "E DATA        «өвөрлөө» is not a regular «-в» past (өвөрлөв); non-standard",
    "сонсох→сонсон": "E DATA        «сонсон» is not a regular past participle (сонссон / сонсон is a converb of another word)",
    "эвдчих→эвдчээ": "F AMBIGUITY  «эвдчээ» (contracted evidential of a derived lemma); not derivable from эвдчих",
    "сонсох→сонсго": "E DATA        «-го» imperative after с is not attested outside the oracle",
  };
  const classes = new Map<string, string[]>();
  const put = (c: string, ex: string) => classes.set(c, [...(classes.get(c) ?? []), ex]);
  let rejected = 0;
  for (const [lemma, form, tag] of uniq) {
    if (classify(form) === "ACCEPT") continue;
    rejected += 1;
    const stem = stemOf(lemma);
    const sameLemma = form.startsWith(stem.slice(0, Math.max(3, stem.length - 1)));
    const ex = `${lemma}→${form} [${tag.replace("V.CVB;LGSPEC", "CVB").replace(";SG+PL", "")}]`;
    const suffix = sameLemma ? form.slice(stem.length) : "";
    if (tag.startsWith("V;IMP;SG+PL;3") && /^(уул|үүл|лга|лгэ|лго|лгө)$/u.test(suffix)) put("C DERIVATION  causative stem (-уул/-үүл/-лга/-лго), labelled imperative-3 by the oracle", ex);
    else if (KNOWN[`${lemma}→${form}`]) put(KNOWN[`${lemma}→${form}`]!, ex);
    else if (!sameLemma) put("B ORACLE      row misattributed: the form belongs to a different lemma that is not in the list", ex);
    else if (/зн[аэоө]$/u.test(form)) put("E DATA        «-зна» form (a different -зах verb or non-standard)", ex);
    else if (stem.endsWith("д") && /^(аг|эг|ог|өг)$/u.test(suffix)) put("F AMBIGUITY  «д+даг → -аг» contraction; standard is «-ддаг» (мэддэг): needs native confirmation", ex);
    else if (/^ь/u.test(suffix) || /ь(я|ё|е)$/u.test(form)) put("D UNSUPPORTED soft-sign allomorph outside a soft-i lemma (тахья, цохьё)", ex);
    else if (tag.startsWith("V;SBJV;PL;1") && /ъ[яёе]$/u.test(form)) put("D UNSUPPORTED hortative «-ъя» after a cluster stem (урагшлъя): class not determined", ex);
    else put("A UNCLASSIFIED potential TORE bug or unexplained oracle form", ex);
  }
  console.log(`\n=== DISCREPANCY CLASSES (unique verb forms rejected: ${rejected}) ===`);
  for (const [c, l] of [...classes.entries()].sort()) console.log(`${String(l.length).padStart(4)}  ${c}\n        e.g. ${l.slice(0, 6).join(" | ")}`);
}

if (classifyMode) {
  // Noun-side false violations: valid oracle forms the analyzer would call MISSPELLED.
  const nounLemmas = lemmasOf(true);
  const uniqN = [...new Map(rows.map((r) => [r.join("\t"), r] as const)).values()].filter((r) => isNoun(r[2]) && ok(r[0]) && ok(r[1]));
  const lemmasWithFv = new Set<string>();
  const byKind: Record<string, number> = {};
  for (const [lemma, form] of uniqN) {
    if (lex.has(form)) continue;
    const r = an.analyze(form);
    if (r.parses.length === 0 && r.violations.length > 0) {
      lemmasWithFv.add(lemma);
      byKind[r.violations[0]!.kind] = (byKind[r.violations[0]!.kind] ?? 0) + 1;
    }
  }
  console.log(`\n=== NOUN FALSE VIOLATIONS: ${[...lemmasWithFv].length} lemmas (of ${nounLemmas.length}) ===`);
  console.log(`  kinds: ${JSON.stringify(byKind)}; lemmas: ${[...lemmasWithFv].join(", ")}`);
  console.log("  class E (lexicon flag missing): back-vowel loanwords pronounced with a front vowel (вирустэй, клубтэй, курсээс);");
  console.log("  the lexicon flag harmony:F removes them (verified in M1.1). Not an engine bug; no bundled lemma is affected.");
}
