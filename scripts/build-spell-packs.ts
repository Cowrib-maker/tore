/**
 * Build TORE Spell data packs (JSON) from TORE-authored sources.
 *   npx tsx scripts/build-spell-packs.ts
 * Output: src/spell-engine/data/packs/*.json (+ typo-pairs.json).
 * Vocabulary lives in DATA, never in engine TypeScript. Every pack carries
 * provenance + a `redistributable` flag; no third-party data is used here.
 */
import fs from "node:fs";
import path from "node:path";
import { LEGAL_LEXICON_WORDS } from "../src/domain/mongolian-orthography/legal-lexicon";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src/spell-engine/data/sources");
const OUT = path.join(ROOT, "src/spell-engine/data/packs");
const VERSION = "2026.10.1";

type Entry = { w: string; pos?: string; flags?: string[] };

const CLOSED_PRON = new Set(["би", "чи", "та", "тэр", "энэ", "тэд", "бид", "хэн", "юу", "минь", "чинь", "нь", "намайг", "чамайг", "түүнийг", "биднийг", "танайг", "тэднийг", "надад", "чамд", "түүнд", "бидэнд", "танд", "тэдэнд", "манай", "миний", "хаана"]);
const CLOSED_PART = new Set(["юм", "вэ", "уу", "үү", "бэ", "бүү", "ч", "харин", "гэхдээ", "мөн", "эсвэл", "болон", "тэгээд", "дараа", "өмнө", "одоо", "өнөөдөр", "маргааш", "яагаад", "хэрхэн", "эсхүл", "тухай", "дээрх", "доорх", "хүртэл", "гэж", "гэх", "гэсэн", "хэмээн", "учир", "улмаас", "учраас", "руу", "дээд", "доод", "тусгай", "эсэх", "өмнөх", "ч", "л"]);
const NUMS = new Set(["нэг", "хоёр", "гурав", "дөрөв", "тав", "зургаа", "долоо", "найм", "ес", "арав", "арван", "хорин", "найман", "долоон", "хоёрны", "гуравны", "хоёроос", "нэгээс"]);
// Lemmas that merely LOOK inflected (or end in х but are nouns).
const NOUN_LEMMAS = new Set(["дугаар", "тусгаар", "эрх", "шүүх", "анх", "ах", "хэрэглэх"]);
// Inflected-looking forms are accepted as words but generate no paradigm.
const FORM_END = /(?:ийн|ийг|ыг|аас|ээс|оос|өөс|аар|ээр|оор|өөр|сан|сэн|сон|сөн|аж|эж|ож|өж|ээд|аад|оод|өөд|ний|ны)$/u;

function classify(w: string): Entry {
  if (CLOSED_PRON.has(w)) return { w, pos: "PRON", flags: ["no-infl"] };
  if (CLOSED_PART.has(w)) return { w, pos: "PART", flags: ["no-infl"] };
  if (NUMS.has(w)) return { w, pos: "NUM", flags: ["no-infl"] };
  if (NOUN_LEMMAS.has(w)) return { w, pos: "N" };
  // «-х» infinitives are verbs (нouns that end in х are listed in NOUN_LEMMAS).
  if (w.length >= 4 && w.endsWith("х")) return { w, pos: "V" };
  if (FORM_END.test(w) && w.length > 4) return { w, pos: "X", flags: ["form"] };
  // Anything else is a base noun; closed-class and inflected words were handled above.
  return { w, pos: "N" };
}

function readTsv(file: string): string[][] {
  return fs
    .readFileSync(path.join(SRC, file), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("\t").map((c) => c.trim()));
}

function corePatterns(): string[] {
  const text = fs.readFileSync(path.join(ROOT, "src/domain/mongolian-orthography/dictionary.ts"), "utf8");
  const m = /const CORE_DICTIONARY_WORDS = \[([\s\S]*?)\] as const;/u.exec(text);
  if (!m) throw new Error("CORE_DICTIONARY_WORDS not found");
  const words: string[] = [];
  for (const q of m[1]!.matchAll(/"([^"]+)"/gu)) for (const part of q[1]!.split(/\s+/u)) words.push(part);
  return words;
}

function dedupe(entries: Entry[]): Entry[] {
  const seen = new Map<string, Entry>();
  for (const e of entries) {
    const k = `${e.w}|${e.pos}`;
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()].sort((a, b) => a.w.localeCompare(b.w, "mn"));
}

function pack(id: string, layer: string, coverage: string, source: string, entries: Entry[], notes: string) {
  return {
    schema: "tore-spell-pack/1",
    id,
    version: VERSION,
    layer,
    language: "mn-Cyrl",
    coverage,
    provenance: { source, license: "TORE proprietary (original work)", redistributable: true, notes },
    entries: entries.map((e) => ({ ...e, flags: e.flags?.length ? e.flags : undefined })),
  };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const general: Entry[] = corePatterns().map((w) => classify(w.toLowerCase()));
  for (const [w, pos, flags] of readTsv("general-extra.tsv")) {
    const base = pos ? { w: w!, pos } : classify(w!);
    general.push({ ...base, flags: flags ? flags.split(",") : base.flags });
  }
  // шүүх is both the noun «court» and the verb «to judge».
  general.push({ w: "шүүх", pos: "V" });
  // Verb stem-class flags (vstem, hv:<vowel>) are lexicon data, applied by lemma.
  const verbFlags = new Map(readTsv("verb-flags.tsv").map(([w, f]) => [w!, f!.split(",")] as const));
  const applyFlags = (list: Entry[]) => {
    for (const e of list) {
      const f = e.pos === "V" ? verbFlags.get(e.w) : undefined;
      if (f) e.flags = [...new Set([...(e.flags ?? []), ...f])];
    }
  };
  const generalSet = new Set(general.map((e) => e.w));
  const legal = dedupe(
    [...new Set(LEGAL_LEXICON_WORDS as readonly string[])]
      .filter((w) => !generalSet.has(w) && w.length >= 2)
      .map((w) => classify(w)),
  );
  applyFlags(general);
  applyFlags(legal);
  // Evidence-gated surface forms from TORE-authored text (see scripts/spell-extract-corpus-forms.ts).
  const corpusForms: Entry[] = readTsv("corpus-forms.tsv").map(([w]) => ({ w: w!, pos: "X", flags: ["form"] }));
  const names = readTsv("proper-nouns.tsv").map(([w]) => ({ w: w!, pos: "N" }));
  const abbr = readTsv("abbreviations.tsv").map(([w]) => ({ w: w!, pos: "X", flags: ["no-infl"] }));
  const typos = readTsv("typo-pairs.tsv").map(([wrong, right]) => ({ wrong, right }));

  const write = (name: string, obj: unknown) =>
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1) + "\n");
  write("general.json", pack("tore-general-seed", "GENERAL", "SEED", "TORE CORE_DICTIONARY_WORDS + general-extra.tsv", dedupe(general), "Curated starter vocabulary. SEED: absence proves nothing."));
  write("legal.json", pack("tore-legal-seed", "LEGAL", "SEED", "TORE legal-lexicon.ts", legal, "Legal-domain vocabulary from the existing TORE lexicon."));
  write("general-corpus.json", pack("tore-corpus-forms", "GENERAL", "SEED", "corpus-forms.tsv (TORE-authored UI copy, messages, curriculum)", dedupe(corpusForms), "Surface forms only (no paradigm), attested in TORE-authored text; frequency is evidence, not truth. SEED: absence proves nothing."));
  write("proper-nouns.json", pack("tore-names-seed", "PROPER_NOUN", "SEED", "proper-nouns.tsv", dedupe(names), "Names / places."));
  write("abbreviations.json", pack("tore-abbr-seed", "ABBREVIATION", "SEED", "abbreviations.tsv", dedupe(abbr), "Abbreviations / acronyms."));
  write("typo-pairs.json", { schema: "tore-spell-typos/1", version: VERSION, provenance: { source: "typo-pairs.tsv", license: "TORE proprietary (original work)", redistributable: true }, pairs: typos });
  console.log({ corpusForms: corpusForms.length, general: general.length, legal: legal.length, names: names.length, abbr: abbr.length, typos: typos.length });
}
main();
