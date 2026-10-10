/**
 * Registry of every language-data source TORE Spell knows about — shipped,
 * research, benchmark, investigated-and-rejected, or unreachable.
 *
 * Status (the ONLY thing the release gate looks at):
 *   VERIFIED_SHIPPABLE      we hold/read the licence and it permits commercial redistribution
 *                           and derivative works, or the data is TORE-created
 *   VERIFIED_RESEARCH_ONLY  licence text read and it forbids shipping (research/benchmark use only)
 *   UNVERIFIED              licence missing, contradictory, unreadable, or source unreachable
 *   PROHIBITED              licence/terms forbid our use, or data is proprietary/competitor
 * Only VERIFIED_SHIPPABLE may enter a release pack. Everything else is local-only at most
 * (`localUse`), never committed, never bundled.
 *
 * Fields mirror docs/spell/DATA-SOURCES.md. `licenseText` is a short verbatim excerpt (or a
 * statement that none exists). `downloadDate`, `sha256` and `version` are filled per file by
 * `pipeline fetch` into `.spell-research/manifest.json`; they are never invented here.
 */
export type SourceStatus = "VERIFIED_SHIPPABLE" | "VERIFIED_RESEARCH_ONLY" | "UNVERIFIED" | "PROHIBITED";
export type DataClass = "A_TORE_OWNED" | "B_EXTERNAL_LICENSED" | "C_RESEARCH_ONLY" | "D_BENCHMARK_ONLY";
export type Tri = "YES" | "NO" | "UNCLEAR";

export type SourceRecord = {
  sourceId: string;
  name: string;
  url: string;
  publisher: string;
  license: string;
  licenseText: string;
  commercialUse: Tri;
  redistribution: Tri;
  derivativeWorks: Tri;
  attributionRequired: Tri;
  modificationAllowed: Tri;
  version: string;
  dataType: "LEXICON" | "CORPUS" | "MORPHOLOGY" | "NAMES" | "ABBREVIATIONS" | "FREQUENCY" | "RULES" | "TOOL";
  coverage: string;
  languageVariant: string;
  status: SourceStatus;
  dataClass: DataClass;
  /** What a developer may do with it locally. NONE = nothing downloaded or used. */
  localUse: "NONE" | "RESEARCH" | "BENCHMARK";
  /** Files `pipeline fetch` can download (relative to .spell-research/<sourceId>/). */
  files?: { url: string; file: string }[];
  /** Why this status; what is needed to change it. */
  notes: string;
};

const RAW_TUG = "https://raw.githubusercontent.com/tugstugi/mongolian-nlp/master/datasets";
const RAW_LO = "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/mn_MN";
const NA = "no licence text exists (source unreachable or file absent)";

const tore = (sourceId: string, name: string, dataType: SourceRecord["dataType"], coverage: string, notes: string): SourceRecord => ({
  sourceId,
  name,
  url: "repo:tore",
  publisher: "TORE",
  license: "TORE proprietary (original work)",
  licenseText: "Created by TORE; ownership is TORE's. Shippable in the TORE Spell product.",
  commercialUse: "YES",
  redistribution: "YES",
  derivativeWorks: "YES",
  attributionRequired: "NO",
  modificationAllowed: "YES",
  version: "2026.10",
  dataType,
  coverage,
  languageVariant: "Khalkha Mongolian, Cyrillic",
  status: "VERIFIED_SHIPPABLE",
  dataClass: "A_TORE_OWNED",
  localUse: "NONE",
  notes,
});

export const SOURCES: readonly SourceRecord[] = [
  // ── A: TORE-created (may ship) ───────────────────────────────────────────
  tore("tore-core-seed", "TORE core seed vocabulary", "LEXICON", "~460 common words (CORE_DICTIONARY_WORDS + general-extra.tsv)", "Hand-authored by TORE engineers; native review pending."),
  tore("tore-legal-lexicon", "TORE legal lexicon", "LEXICON", "~180 legal terms (legal-lexicon.ts)", "Existing TORE legal vocabulary; domain pack LEGAL only."),
  tore("tore-ui-corpus-forms", "Forms attested in TORE-authored text", "LEXICON", "~900 surface forms from UI copy, messages, curriculum", "Evidence-gated (>=2 files or >=3 uses); form-only entries, no paradigm."),
  tore("tore-names-abbr", "TORE names and abbreviations", "NAMES", "~45 names/abbreviations", "Seed set."),
  tore("tore-audit-overrides", "Audit-driven corrections (overrides.tsv)", "RULES", "<50 lines", "Corrections found by auditing real text; reasons recorded per line."),
  tore("tore-native-review", "TORE native-speaker review decisions", "LEXICON", "lemmas approved by ≥2 distinct native reviewers (tests/evaluation/spell-v3/gold/native)", "Created by TORE reviewers through the review pipeline; only items with status NATIVE_REVIEWED. Empty until real native reviewers exist."),
  tore("tore-authored-vocab-2026-10", "TORE AI-drafted domain vocabulary, October 2026", "LEXICON", "domain lemma lists under src/spell-engine/data/sources/vocab/", "Drafted by the AI assistant from general knowledge of Mongolian (no external list consulted for selection). Licence-clean (TORE-owned) but NOT linguistically authoritative: every entry carries reviewStatus PENDING_NATIVE_REVIEW and a low-confidence marker; acceptance only ever makes MORE words VALID (never accuses), and paradigms are cross-checked against independent oracles locally."),

  // ── C/D: local research and benchmark only ───────────────────────────────
  {
    sourceId: "dict-mn",
    name: "dict-mn Mongolian Hunspell dictionary (LibreOffice mirror)",
    url: "https://github.com/bataak/dict-mn",
    publisher: "Batmunkh Dorjgotov",
    license: "AMBIGUOUS: «Өөрчлөн тараахыг хориглоно» + LPPL 1.3 notice",
    licenseText: "«Өөрчлөн тараахыг хориглоно. Зохиогчийн эрх хуулиар хамгаалагдсан.» … «This work may be distributed and/or modified under the conditions of the LaTeX Project Public License, either version 1.3 …»",
    commercialUse: "UNCLEAR",
    redistribution: "NO",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "YES",
    modificationAllowed: "UNCLEAR",
    version: "2026.03.01",
    dataType: "LEXICON",
    coverage: "~604k stems, 12k suffix rules, billions of generated forms",
    languageVariant: "Khalkha Mongolian, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "C_RESEARCH_ONLY",
    localUse: "RESEARCH",
    files: [
      { url: `${RAW_LO}/mn_MN.dic`, file: "mn_MN.dic" },
      { url: `${RAW_LO}/mn_MN.aff`, file: "mn_MN.aff" },
      { url: `${RAW_LO}/README_mn_MN.txt`, file: "README_mn_MN.txt" },
    ],
    notes: "Contradictory licence → UNVERIFIED, never shipped. Ask the author for a written commercial licence. Local second-opinion oracle for audits and the developer build. Every wrapper (npm dictionary-mn LPPL-1.3c, @cspell/dict-mn-mn MIT, mn-spellcheck MIT 'powered by dict-mn') is derived from it and inherits the ambiguity.",
  },
  {
    sourceId: "npm-dictionary-mn",
    name: "npm: dictionary-mn (wooorm/dictionaries)",
    url: "https://www.npmjs.com/package/dictionary-mn",
    publisher: "Titus Wormer (packaging) / Batmunkh Dorjgotov (data)",
    license: "LPPL-1.3c (package metadata)",
    licenseText: "package.json license field only; data is dict-mn",
    commercialUse: "UNCLEAR",
    redistribution: "UNCLEAR",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "YES",
    modificationAllowed: "UNCLEAR",
    version: "3.0.0",
    dataType: "LEXICON",
    coverage: "= dict-mn",
    languageVariant: "Khalkha Mongolian, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "C_RESEARCH_ONLY",
    localUse: "NONE",
    notes: "Same data as dict-mn; the wrapper's licence does not cure the upstream contradiction. Not downloaded.",
  },
  {
    sourceId: "npm-cspell-dict-mn",
    name: "npm: @cspell/dict-mn-mn",
    url: "https://www.npmjs.com/package/@cspell/dict-mn-mn",
    publisher: "Street Side Software",
    license: "MIT (package metadata)",
    licenseText: "package.json license field only; word list derived from dict-mn",
    commercialUse: "UNCLEAR",
    redistribution: "UNCLEAR",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "YES",
    modificationAllowed: "UNCLEAR",
    version: "1.3.1",
    dataType: "LEXICON",
    coverage: "derivative of dict-mn",
    languageVariant: "Khalkha Mongolian, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "C_RESEARCH_ONLY",
    localUse: "NONE",
    notes: "MIT on a derivative of ambiguously licensed data. Not downloaded.",
  },
  {
    sourceId: "npm-mn-spellcheck",
    name: "npm: mn-spellcheck",
    url: "https://www.npmjs.com/package/mn-spellcheck",
    publisher: "Ankhb0ld",
    license: "MIT (code)",
    licenseText: "README: «580,000+ root words … powered by bataak/dict-mn»; the 94 KB tarball contains code only and fetches/relies on dict-mn",
    commercialUse: "UNCLEAR",
    redistribution: "UNCLEAR",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "YES",
    modificationAllowed: "UNCLEAR",
    version: "1.1.2",
    dataType: "TOOL",
    coverage: "wrapper around dict-mn",
    languageVariant: "Khalkha Mongolian, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "C_RESEARCH_ONLY",
    localUse: "NONE",
    notes: "Inspected 2026-10-07: contains rule/suffix code only; contributes no independent data.",
  },
  {
    sourceId: "unimorph-khk",
    name: "UniMorph Khalkha Mongolian (khk)",
    url: "https://github.com/unimorph/khk",
    publisher: "UniMorph project",
    license: "CC BY-SA 3.0 (per project; licence file not retrievable by raw URL)",
    licenseText: NA,
    commercialUse: "YES",
    redistribution: "YES",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "YES",
    modificationAllowed: "YES",
    version: "UniMorph 4.0 (2,085 lemmas)",
    dataType: "MORPHOLOGY",
    coverage: "2,085 lemmas, ~15k inflected forms",
    languageVariant: "Khalkha Mongolian, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "D_BENCHMARK_ONLY",
    localUse: "BENCHMARK",
    files: [{ url: "https://raw.githubusercontent.com/unimorph/khk/master/khk", file: "khk" }],
    notes: "Share-alike would bind any pack built from it; used only to MEASURE morphology acceptance.",
  },
  {
    sourceId: "tugstugi-datasets",
    name: "tugstugi/mongolian-nlp dataset collection (Eduge news, state-registry names, abbreviations, frequency list)",
    url: "https://github.com/tugstugi/mongolian-nlp",
    publisher: "tugstugi (collection); Bolorsoft LLC (Eduge); opendata.burtgel.gov.mn (names)",
    license: "none stated",
    licenseText: "No LICENSE file in the repository (raw LICENSE and LICENSE.md return 404).",
    commercialUse: "UNCLEAR",
    redistribution: "UNCLEAR",
    derivativeWorks: "UNCLEAR",
    attributionRequired: "UNCLEAR",
    modificationAllowed: "UNCLEAR",
    version: "master (2026-10)",
    dataType: "CORPUS",
    coverage: "Eduge: 75,662 news articles, ~23 M tokens, 9 topic labels; names 220k/90k/192k; 500 abbreviations; 250 frequent words",
    languageVariant: "Khalkha Mongolian news, Cyrillic",
    status: "UNVERIFIED",
    dataClass: "D_BENCHMARK_ONLY",
    localUse: "BENCHMARK",
    files: [
      { url: `${RAW_TUG}/eduge.csv.gz`, file: "eduge.csv.gz" },
      { url: `${RAW_TUG}/most_frequent_words.csv`, file: "most_frequent_words.csv" },
      { url: `${RAW_TUG}/mongolian_abbreviations.csv`, file: "mongolian_abbreviations.csv" },
      { url: `${RAW_TUG}/mongolian_personal_names.csv.gz`, file: "mongolian_personal_names.csv.gz" },
      { url: `${RAW_TUG}/mongolian_clan_names.csv.gz`, file: "mongolian_clan_names.csv.gz" },
      { url: `${RAW_TUG}/mongolian_company_names.csv.gz`, file: "mongolian_company_names.csv.gz" },
      { url: `${RAW_TUG}/districts.csv`, file: "districts.csv" },
      { url: `${RAW_TUG}/countries.csv`, file: "countries.csv" },
    ],
    notes: "No licence → all rights reserved by default → used ONLY to measure coverage/false positives on a developer machine. Frequencies/words derived from it are never committed or shipped. Owner confirmation needed.",
  },

  // ── investigated, unreachable from the build environment ─────────────────
  ...(
    [
      ["wiktionary-mn", "Wiktionary (Mongolian entries)", "https://en.wiktionary.org", "Wikimedia Foundation", "CC BY-SA 4.0 + GFDL (per Wikimedia)", "LEXICON", "kaikki.org / dumps.wikimedia.org not reachable; share-alike may bind derived databases; counsel needed"],
      ["wikipedia-mn", "Mongolian Wikipedia dump", "https://dumps.wikimedia.org/mnwiki/", "Wikimedia Foundation", "CC BY-SA 4.0 (per Wikimedia)", "CORPUS", "not reachable; share-alike text; frequency statistics may be defensible but need legal review"],
      ["ud-mongolian", "Universal Dependencies Mongolian treebank(s)", "https://universaldependencies.org", "UD contributors", "CC BY-SA (UD default; per-treebank licence not read)", "MORPHOLOGY", "UD repository paths not reachable via GitHub raw; benchmark-only if obtained"],
      ["mongoliancorpus-org", "Mongolian Corpus (mongoliancorpus.org)", "https://mongoliancorpus.org", "unknown", "unknown", "CORPUS", "site not reachable; terms unread"],
      ["num-corpus", "NUM (National University of Mongolia) written corpus / POS data", "http://www.panl10n.net", "National University of Mongolia", "unknown", "CORPUS", "needs written permission"],
      ["cc100-mn", "CC-100 / OSCAR / Common Crawl Mongolian", "https://data.statmt.org/cc-100/", "Meta / community", "compilation terms differ from underlying copyright", "CORPUS", "not reachable; web text copyright unresolved"],
      ["legalinfo-mn", "legalinfo.mn legislation", "https://legalinfo.mn", "Ministry of Justice", "statutes may not be copyrightable in Mongolia (counsel to confirm)", "CORPUS", "not reachable from the build environment; best candidate for LEGAL/GOVERNMENT packs"],
      ["toli-gov-mn", "toli.gov.mn orthography dictionary", "https://www.toli.gov.mn", "Institute of Language and Literature", "state publication; terms unread", "LEXICON", "not reachable; rules (facts) already implemented from the standard, text not copied"],
      ["opendata-burtgel", "opendata.burtgel.gov.mn civil-registry names", "https://opendata.burtgel.gov.mn", "State registry", "terms not reachable", "NAMES", "only reachable via the unlicensed tugstugi mirror (benchmark use)"],
      ["monwn", "Mongolian WordNet (kbatsuren/monwn)", "https://github.com/kbatsuren/monwn", "National University of Mongolia", "unknown", "LEXICON", "not downloaded; a 2026-10-07 web search reports CC BY-SA 4.0 (share-alike: counsel must decide whether a spelling pack is a derivative); 26,875 words — first candidate to license-check"],
      ["common-voice-mn-text", "Common Voice Mongolian sentence corpus (Mozilla)", "https://datacollective.mozillafoundation.org", "Mozilla Foundation / contributors", "CC0-1.0 (per the dataset page, 2026-10-07 search; text CC0)", "CORPUS", "not downloaded (needs a Mozilla Data Collective account); ~6,100 sentences — tiny but the only CC0 Mongolian text found; benchmark/frequency candidate once fetched and sha256-recorded"],
      ["tatoeba-mn", "Tatoeba Mongolian sentences", "https://tatoeba.org", "Tatoeba contributors", "CC BY 2.0 FR by default (some sentences CC0); per-sentence licence must be filtered", "CORPUS", "not downloaded; attribution required; small corpus"],
      ["morphynet-mn", "MorphyNet Mongolian derivational morphology", "https://github.com/kbatsuren/MorphyNet", "MorphyNet authors", "unknown (MorphyNet is CC BY-SA)", "MORPHOLOGY", "not downloaded; share-alike"],
    ] as const
  ).map(
    ([sourceId, name, url, publisher, license, dataType, notes]): SourceRecord => ({
      sourceId,
      name,
      url,
      publisher,
      license,
      licenseText: NA,
      commercialUse: "UNCLEAR",
      redistribution: "UNCLEAR",
      derivativeWorks: "UNCLEAR",
      attributionRequired: "UNCLEAR",
      modificationAllowed: "UNCLEAR",
      version: "unknown",
      dataType,
      coverage: "not inspected",
      languageVariant: "Mongolian",
      status: "UNVERIFIED",
      dataClass: "C_RESEARCH_ONLY",
      localUse: "NONE",
      notes,
    }),
  ),
];

export const RESEARCH_DIR = ".spell-research";
export const sourceById = (id: string): SourceRecord | undefined => SOURCES.find((s) => s.sourceId === id);

/** Back-compat for scripts that still import the old name. */
export const RESEARCH_SOURCES = SOURCES.filter((s) => s.files && s.files.length > 0).map((s) => ({ ...s, id: s.sourceId, bundlable: s.status === "VERIFIED_SHIPPABLE", licenceStatus: s.status }));

// ── Phase 6: a plain decision per source (what a product owner / counsel reads) ─────────────────────────────
export type SourceDecision = "APPROVED" | "REJECTED" | "LEGAL_REVIEW_REQUIRED";

/**
 * APPROVED               VERIFIED_SHIPPABLE only (TORE-owned or a licence we hold that permits commercial redistribution and derivatives).
 * REJECTED               forbidden, research-only, redistribution explicitly NO, or no licence at all (all rights reserved by default).
 * LEGAL_REVIEW_REQUIRED  anything else: ambiguous, share-alike, unreadable, unreachable, unknown terms. NOT shippable until counsel decides.
 * «Publicly downloadable» is never a reason to ship.
 */
export function decisionOf(s: Pick<SourceRecord, "status" | "redistribution" | "license">): SourceDecision {
  if (s.status === "VERIFIED_SHIPPABLE") return "APPROVED";
  if (s.status === "PROHIBITED" || s.status === "VERIFIED_RESEARCH_ONLY" || s.redistribution === "NO" || /^none stated/i.test(s.license)) return "REJECTED";
  return "LEGAL_REVIEW_REQUIRED";
}

export function renderSourceDecisions(): string {
  const cell = (x: string) => x.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const order: Record<SourceDecision, number> = { APPROVED: 0, LEGAL_REVIEW_REQUIRED: 1, REJECTED: 2 };
  const rows = [...SOURCES].sort((a, b) => order[decisionOf(a)] - order[decisionOf(b)] || a.sourceId.localeCompare(b.sourceId));
  const n = (d: SourceDecision) => SOURCES.filter((s) => decisionOf(s) === d).length;
  return [
    "# Lexicon source decisions",
    "",
    "_Generated by `npx tsx scripts/spell-data/source-decisions.ts` from `scripts/spell-data/sources.ts`; a test fails if this file is out of date. Do not edit by hand._",
    "",
    `**${n("APPROVED")} approved · ${n("LEGAL_REVIEW_REQUIRED")} legal review required · ${n("REJECTED")} rejected.** The only approved sources are TORE's own original vocabulary and rules. **No broad third-party lexicon is verified for shipping.** **APPROVED means legally clear to ship — it says nothing about linguistic correctness:** TORE's AI-drafted vocabulary is APPROVED legally yet stays PROVISIONAL until native reviewers validate it. A source being publicly downloadable is never a reason to ship it; a licence that was not read, or that conflicts with itself, counts as not permitted.`,
    "",
    "| source | licence (as recorded) | commercial use | redistribution | derivatives | attribution | modification | local use | decision |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((s) => `| ${cell(s.name)} (\`${s.sourceId}\`) · ${cell(s.url)} | ${cell(s.license)} | ${s.commercialUse} | ${s.redistribution} | ${s.derivativeWorks} | ${s.attributionRequired} | ${s.modificationAllowed} | ${s.localUse} | **${decisionOf(s)}** |`),
    "",
    "## Why each non-approved source is not shipped",
    "",
    ...rows.filter((s) => decisionOf(s) !== "APPROVED").map((s) => `- **${decisionOf(s)}** \`${s.sourceId}\` — ${cell(s.notes)}`),
    "",
  ].join("\n");
}
