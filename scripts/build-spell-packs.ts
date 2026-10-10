/**
 * Build TORE Spell data packs (JSON) from TORE-authored sources.
 *   npx tsx scripts/build-spell-packs.ts
 * Output: src/spell-engine/data/packs/*.json (+ typo-pairs.json).
 * Vocabulary lives in DATA, never in engine TypeScript. Every pack carries
 * provenance + a `redistributable` flag; no third-party data is used here.
 */
import { loadAll } from "../tests/evaluation/spell-v3/gold-sets";
import { readReviewedLemmas } from "./spell-data/lib/reviewed";
import fs from "node:fs";
import path from "node:path";
import { LEGAL_LEXICON_WORDS } from "../src/domain/mongolian-orthography/legal-lexicon";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src/spell-engine/data/sources");
const OUT = path.join(ROOT, "src/spell-engine/data/packs");
const VERSION = "2026.10.3";

type Entry = { w: string; pos?: string; flags?: string[]; conf?: "HIGH" | "MEDIUM" | "LOW"; lemma?: string };

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
    const k = `${e.w.toLowerCase()}|${e.pos}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, e);
    else if (e.flags?.length) prev.flags = [...new Set([...(prev.flags ?? []), ...e.flags])]; // a later file may add flags (loan, form …)
  }
  return [...seen.values()].sort((a, b) => a.w.localeCompare(b.w, "mn"));
}

/**
 * Structured vocabulary files (sources/vocab/<layer>-<topic>.tsv). Format:
 *   @POS [flag,flag] [conf=H|M|L]     — section header; applies to the words below it
 *   word word word …                  — whitespace-separated surface lemmas
 * Layer comes from the file-name prefix. Everything here is TORE-AI-drafted
 * (source tore-authored-vocab-2026-10) and PENDING_NATIVE_REVIEW.
 */
const VOCAB_LAYERS: Record<string, string> = { general: "GENERAL", legal: "LEGAL", government: "GOVERNMENT", business: "BUSINESS", academic: "ACADEMIC", tech: "TECH", medical: "MEDICAL", names: "PROPER_NOUN", abbr: "ABBREVIATION" };
const CONF: Record<string, "HIGH" | "MEDIUM" | "LOW"> = { H: "HIGH", M: "MEDIUM", L: "LOW" };

function readVocab(): Map<string, { entries: Entry[]; files: string[] }> {
  const dir = path.join(SRC, "vocab");
  const out = new Map<string, { entries: Entry[]; files: string[] }>();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".tsv")).sort()) {
    const layer = VOCAB_LAYERS[f.split("-")[0]!];
    if (!layer) throw new Error(`vocab/${f}: file name must start with one of ${Object.keys(VOCAB_LAYERS).join(", ")}-`);
    const bucket = out.get(layer) ?? { entries: [], files: [] };
    bucket.files.push(f);
    let pos = "N";
    let flags: string[] = [];
    let conf: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    let lemma: string | undefined;
    for (const raw of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("@")) {
        const [p, ...rest] = line.slice(1).split(/\s+/);
        pos = p!;
        flags = [];
        conf = "MEDIUM";
        lemma = undefined;
        for (const r of rest) {
          if (r.startsWith("conf=")) conf = CONF[r.slice(5)] ?? "MEDIUM";
          else if (r.startsWith("lemma=")) lemma = r.slice(6);
          else flags = r.split(",").filter(Boolean);
        }
        continue;
      }
      for (const w of line.split(/\s+/)) {
        // A verb entry that is not an infinitive is an inflected FORM, never a paradigm head.
        const f = pos === "V" && !w.endsWith("х") && !flags.includes("form") ? [...flags, "form"] : [...flags];
        bucket.entries.push({ w, pos: pos === "V" && f.includes("form") ? "X" : pos, flags: f.length ? f : undefined, conf, ...(lemma ? { lemma } : {}) });
      }
    }
    out.set(layer, bucket);
  }
  return out;
}

/** Trust tiers (docs/spell/PHASE-3-DATA-TIERS.md). TRUSTED = committed to the repository's production dictionaries before the language-engine work. */
type Tier = "REVIEWED" | "TRUSTED" | "PROVISIONAL";

function pack(id: string, layer: string, coverage: string, source: string, entries: Entry[], notes: string, sourceIds: string[] = ["tore-core-seed"], reviewStatus = "PENDING_NATIVE_REVIEW", tier: Tier = "PROVISIONAL") {
  return {
    schema: "tore-spell-pack/1",
    id,
    version: VERSION,
    layer,
    language: "mn-Cyrl",
    coverage,
    provenance: { source, license: "TORE proprietary (original work)", redistributable: true, dataClass: "A_TORE_OWNED", tier, sourceIds, reviewStatus, notes },
    entries: entries.map((e) => ({ ...e, flags: e.flags?.length ? e.flags : undefined, conf: e.conf ?? "HIGH" })),
  };
}

  // Agent nouns in -ч / -чин have a suppletive plural stem: жүжигчин → жүжигчид (→ жүжигчдийн), зохиолч → зохиолчид (→ зохиолчдын).
  // Rule R-AGENT-CH-PLURAL: 88 of 89 ч-final nouns in the lexicon have a plural that the second-opinion dictionary accepts
  // (scripts/spell-data, 2026-10-07). Generated here so the analyzer needs no special case; the pseudo-lemma is a plain noun entry.
function addChid(entries: Entry[]): Entry[] {
    const have = new Set(entries.map((e) => e.w));
    const out = [...entries];
    for (const e of entries) {
      if (e.pos !== "N" || e.flags?.includes("form") || e.w.length < 5 || e.w !== e.w.toLowerCase()) continue;
      const pl = e.w.endsWith("чин") ? `${e.w.slice(0, -3)}чид` : e.w.endsWith("ч") ? `${e.w.slice(0, -1)}чид` : null;
      if (pl && !have.has(pl)) (out.push({ w: pl, pos: "N", flags: ["no-plural"], conf: e.conf }), have.add(pl));
    }
    return out;
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
  // Noun stem-class flags (hidden-g …), same mechanism: facts the spelling does not reveal (scripts/spell-data/noun-flags-suggest.ts).
  const nounFlags = new Map(readTsv("noun-flags.tsv").map(([w, f]) => [w!, f!.split(",")] as const));
  const applyFlags = (list: Entry[]) => {
    for (const e of list) {
      const f = e.pos === "V" ? verbFlags.get(e.w) : e.pos === "N" ? nounFlags.get(e.w) : undefined;
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
  // Audit-driven corrections (overrides.tsv) replace the automatic classification.
  // pos "REMOVE" deletes the word from every pack (wrong forms, bare suffixes filed as words).
  const removals = new Set(readTsv("overrides.tsv").filter(([, pos]) => pos === "REMOVE").map(([w]) => w!));
  const overrides = new Map(readTsv("overrides.tsv").filter(([, pos]) => pos !== "REMOVE").map(([w, pos, flags]) => [w!, { w: w!, pos: pos!, flags: flags ? flags.split(",") : undefined } as Entry] as const));
  const applyOverrides = (list: Entry[]) => list.map((e) => overrides.get(e.w) ?? e);
  let generalOut = applyOverrides(general).filter((e) => !removals.has(e.w));
  const legalOut = applyOverrides(legal).filter((e) => !removals.has(e.w));
  const known = new Set([...generalOut, ...legalOut].map((e) => e.w));
  for (const [w, e] of overrides) if (!known.has(w)) generalOut.push(e);
  // A vocabulary lemma (@N …) outranks a seed entry that had only been filed as a non-inflecting FORM (үе, төгрөг …): promote it,
  // otherwise the form entry silently wins and the paradigm is never generated.
  const vocabLemmas = new Set<string>();
  for (const { entries } of readVocab().values()) for (const e of entries) if (!e.flags?.includes("form") && e.pos !== "X") vocabLemmas.add(`${e.w.toLowerCase()}|${e.pos}`);
  for (const e of [...generalOut, ...legalOut]) {
    if (e.flags?.includes("form") && vocabLemmas.has(`${e.w.toLowerCase()}|${e.pos}`)) e.flags = e.flags.filter((f) => f !== "form");
  }
  generalOut = dedupe(addChid(generalOut));
  // Evidence-gated surface forms from TORE-authored text (see scripts/spell-extract-corpus-forms.ts).
  const corpusForms: Entry[] = readTsv("corpus-forms.tsv").filter(([w]) => !removals.has(w!)).map(([w]) => ({ w: w!, pos: "X", flags: ["form"] }));
  const names = readTsv("proper-nouns.tsv").map(([w]) => ({ w: w!, pos: "N" }));
  const abbr = readTsv("abbreviations.tsv").map(([w]) => ({ w: w!, pos: "X", flags: ["no-infl"] }));
  const typos = readTsv("typo-pairs.tsv").map(([wrong, right]) => ({ wrong, right }));

  const write = (name: string, obj: unknown) =>
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1) + "\n");
  // TRUSTED = the words committed to src/domain/mongolian-orthography/dictionary.ts (CORE_DICTIONARY_WORDS) and legal-lexicon.ts before the
  // language-engine work (git-verifiable). Everything TORE added afterwards (general-extra.tsv, overrides, vocab/*.tsv) is PROVISIONAL.
  const coreSet = new Set(corePatterns().map((w) => w.toLowerCase()));
  const generalCore = generalOut.filter((e) => coreSet.has(e.w));
  const generalRest = generalOut.filter((e) => !coreSet.has(e.w));
  write("general-core.json", pack("tore-general-core", "GENERAL", "SEED", "TORE CORE_DICTIONARY_WORDS (committed production dictionary)", generalCore, "Committed production dictionary, pre-dating the language-engine work. Engineer-vetted, NOT native-validated. SEED: absence proves nothing.", ["tore-core-seed"], "PENDING_NATIVE_REVIEW", "TRUSTED"));
  write("general.json", pack("tore-general-seed", "GENERAL", "SEED", "general-extra.tsv + overrides.tsv", generalRest, "AI-drafted starter vocabulary and audit overrides. PROVISIONAL. SEED: absence proves nothing.", ["tore-core-seed", "tore-audit-overrides"]));
  write("legal.json", pack("tore-legal-seed", "LEGAL", "SEED", "TORE legal-lexicon.ts", dedupe(legalOut), "Legal-domain vocabulary from the existing committed TORE lexicon (overrides applied).", ["tore-legal-lexicon"], "PENDING_NATIVE_REVIEW", "TRUSTED"));
  write("general-corpus.json", pack("tore-corpus-forms", "GENERAL", "SEED", "corpus-forms.tsv (TORE-authored UI copy, messages, curriculum)", dedupe(corpusForms), "Surface forms only (no paradigm), attested in TORE-authored text; frequency is evidence, not truth. SEED: absence proves nothing.", ["tore-ui-corpus-forms"]));
  write("proper-nouns.json", pack("tore-names-seed", "PROPER_NOUN", "SEED", "proper-nouns.tsv", dedupe(names), "Names / places.", ["tore-names-abbr"]));
  write("abbreviations.json", pack("tore-abbr-seed", "ABBREVIATION", "SEED", "abbreviations.tsv", dedupe(abbr), "Abbreviations / acronyms.", ["tore-names-abbr"]));
  // Structured vocabulary (AI-drafted, pending native review): one pack per layer, de-duplicated against the seed packs.
  const seedKeys = new Map<string, Set<string>>([["GENERAL", new Set(generalOut.map((e) => `${e.w}|${e.pos}`))], ["LEGAL", new Set(legalOut.map((e) => `${e.w}|${e.pos}`))], ["PROPER_NOUN", new Set(names.map((e) => `${e.w}|${e.pos}`))], ["ABBREVIATION", new Set(abbr.map((e) => `${e.w}|${e.pos}`))]]);
  const vocabCounts: Record<string, number> = {};
  for (const [layer, { entries, files }] of readVocab()) {
    const have = seedKeys.get(layer) ?? new Set<string>();
    const list = addChid(entries).filter((e) => !removals.has(e.w) && !have.has(`${e.w}|${e.pos}`));
    applyFlags(list);
    const lowerOk = layer === "PROPER_NOUN" || layer === "ABBREVIATION";
    const cleaned = list.map((e) => (lowerOk ? e : { ...e, w: e.w.toLowerCase() }));
    const name = layer === "PROPER_NOUN" ? "names" : layer === "ABBREVIATION" ? "abbr" : layer.toLowerCase();
    write(`vocab-${name}.json`, pack(`tore-vocab-${name}`, layer, "SEED", `sources/vocab/${files.join(", ")}`, dedupe(cleaned), `AI-drafted ${layer} vocabulary (${files.join(", ")}); every entry is PENDING_NATIVE_REVIEW. SEED: absence proves nothing.`, ["tore-authored-vocab-2026-10"]));
    vocabCounts[name] = dedupe(cleaned).length;
  }
  // R-DERIV-GCH / R-DERIV-LT: productive deverbal nouns — the agent noun «infinitive − х + гч» (оруулах → оруулагч, эрхлэх → эрхлэгч) and the
  // action noun «infinitive − х + лт» (оруулах → оруулалт, унах → уналт). Evidence: the second-opinion dictionary accepts BOTH for ≥99% of the
  // ~750 lexicon verbs it knows (scripts/spell-data, 2026-10-07), i.e. the derivation is productive in the spelling system. They are generated
  // here as LOW-confidence noun lemmas: accepted as VALID, inflected as nouns, NEVER offered as a repair. Rule-generated, PENDING_NATIVE_REVIEW.
  {
    const verbs = new Set<string>();
    const collect = (list: Entry[]) => {
      for (const e of list) if (e.pos === "V" && e.w.endsWith("х") && e.w.length >= 5 && e.w === e.w.toLowerCase() && !e.flags?.includes("form")) verbs.add(e.w);
    };
    collect(generalOut);
    collect(legalOut);
    for (const { entries } of readVocab().values()) collect(entries);
    const derived: Entry[] = [];
    const LINK = "аэоөиуү";
    for (const v of [...verbs].sort()) {
      const stem = v.slice(0, -1);
      derived.push({ w: `${stem}гч`, pos: "N", conf: "LOW" }, { w: `${stem}лт`, pos: "N", conf: "LOW" });
      // R-DERIV-CAUS / R-DERIV-PASS: causative «root + уул/үүл + ах/эх» (бодох → бодуулах, ажиллах → ажиллуулах) and passive «root + link + гд +
      // ах/эх» (засах → засагдах, ажиллах → ажиллагдах). Only for «root + linking vowel + х» lemmas (the root is unambiguous); vowel-final stems such as
      // хийх take irregular causatives (хийлгэх) and are NOT generated. The oracle accepts the causative for ~60% and the passive for ~56% of verbs:
      // productive but not universal, hence LOW confidence (valid, never a repair, never evidence for an accusation).
      const a = v[v.length - 2]!;
      const b = v[v.length - 3]!;
      if (v.length >= 6 && LINK.includes(a) && !"аэоөиуүяеёюй".includes(b) && !/(гд[аэ]х|[уү]ул[аэ]х|[уү]ул[аэ]х)$/u.test(v)) {
        const root = v.slice(0, -2);
        const back = /[аоуяё]/u.test(v.replace(/[эөүе].*$/u, "")) && !/[эөүе]/u.test(v) ? true : /[аоуяё][^эөүе]*$/u.test(v) && !/[эөүе][^аоуяё]*$/u.test(v);
        derived.push(
          { w: `${root}${back ? "уул" : "үүл"}${back ? "ах" : "эх"}`, pos: "V", flags: ["cvb:ж"], conf: "LOW" },
          { w: `${root}${a}гд${back ? "ах" : "эх"}`, pos: "V", conf: "LOW" },
        );
      }
    }
    const withPlural = addChid(dedupe(derived));
    write("derived-deverbal.json", pack("tore-derived-deverbal", "GENERAL", "SEED", "rule: infinitive − х + гч / лт", withPlural, `Rule-generated deverbal nouns and causative / passive verbs from ${verbs.size} verb lemmas (R-DERIV-GCH, R-DERIV-LT, R-DERIV-CAUS, R-DERIV-PASS). LOW confidence: valid, never a repair.`, ["tore-authored-vocab-2026-10"]));
    vocabCounts["derived-deverbal"] = withPlural.length;
  }
  // REVIEWED tier: lemmas two native reviewers approved (vocab-reviewed/lemmas.tsv, verified against gold/native). Emitted only when non-empty.
  {
    const rf = path.join(SRC, "vocab-reviewed", "lemmas.tsv");
    if (fs.existsSync(rf)) {
      const native = loadAll().filter((x) => x.provenanceDir === "native").flatMap((x) => x.items);
      const reviewed = readReviewedLemmas(fs.readFileSync(rf, "utf8"), native);
      const byLayer = new Map<string, Entry[]>();
      for (const r of reviewed) (byLayer.get(r.domain) ?? byLayer.set(r.domain, []).get(r.domain)!).push({ w: r.w, pos: r.pos, flags: r.flags, conf: "HIGH" });
      for (const [layer, list] of byLayer) write(`reviewed-${layer.toLowerCase()}.json`, pack(`tore-reviewed-${layer.toLowerCase()}`, layer, "SEED", "vocab-reviewed/lemmas.tsv (native-reviewed)", dedupe(list), "Lemmas approved by ≥2 distinct native reviewers through the review pipeline.", ["tore-native-review"], "NATIVE_REVIEWED", "REVIEWED"));
    }
  }
  write("typo-pairs.json", { schema: "tore-spell-typos/1", version: VERSION, provenance: { source: "typo-pairs.tsv", license: "TORE proprietary (original work)", redistributable: true, dataClass: "A_TORE_OWNED", sourceIds: ["tore-core-seed"], reviewStatus: "PENDING_NATIVE_REVIEW" }, pairs: typos });
  // Generated index so the engine bundles exactly the packs this build produced.
  const packFiles = fs.readdirSync(OUT).filter((f) => f.endsWith(".json") && f !== "typo-pairs.json").sort();
  const ident = (f: string) => "p_" + f.replace(/\.json$/, "").replace(/[^a-z0-9]/gi, "_");
  fs.writeFileSync(
    path.join(OUT, "index.ts"),
    `// GENERATED by scripts/build-spell-packs.ts — do not edit.\nimport type { DataPack } from "../../lexicon/pack-schema";\n` +
      packFiles.map((f) => `import ${ident(f)} from "./${f}";`).join("\n") +
      `\n\nexport const ALL_PACKS: readonly DataPack[] = [${packFiles.map(ident).join(", ")}] as unknown as DataPack[];\n`,
  );
  console.log({ vocab: vocabCounts, corpusForms: corpusForms.length, general: general.length, legal: legal.length, names: names.length, abbr: abbr.length, typos: typos.length });
}
main();
