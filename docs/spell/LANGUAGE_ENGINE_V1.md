# TORE Spell — Language Engine V1

Location: `src/spell-engine/` (dependency-free: no `@/`, no `node:`, no Next/Prisma/React — enforced by ESLint `no-restricted-imports` and a unit test).
Flag: `TORE_SPELL_LANGUAGE_ENGINE_V1` (exactly `"1"` to enable, **default OFF**). `/api/orthography/check` uses the legacy engine unless the flag is on; the response shape is unchanged either way.
Version: engine `1.0.0-alpha.1`, data `tore-*-seed@2026.10.1`.

Core principle: **precision over recall. If uncertain → UNKNOWN. No LLM, no network, deterministic.**

## Pipeline
```
text → Lexer (offset-preserving, case-aware, protected kinds)
     → per token: protected? → user dictionary → lexicon → morphology → (rules) → verdict
     → MISSPELLED only if a deterministic rule fires AND its repair is itself VALID
     → candidates (SymSpell delete-index) + weighted ranking → suggestions (MISSPELLED only)
```

## Verdict contract
| Verdict | Meaning | Suggestions |
|---|---|---|
| `VALID` | protected token, user dict, lexicon, or morphology accepts it | none |
| `MISSPELLED` | positive evidence of an error; repair verified VALID | up to 3, with confidence |
| `UNKNOWN` | cannot decide (name, loanword, rare, absent from SEED data) — **not an error** | **never** |

Each result carries `reasonCode`, `detectionConfidence` (confidence in the verdict) separate from `suggestions[].confidence` / `suggestionConfidence` (confidence in the replacement), `severity` (ERROR/WARNING/INFO), exact `range` into the original text, `autoApplySafe` (**always `false`** until a benchmark proves a reason safe), `engineVersion`, `dataPackVersion`. UNKNOWN is reported only with `reportUnknown: true` (as INFO). `minDetectionConfidence` (default 0.7) demotes weak hits to UNKNOWN.

Reason codes → base detection confidence: TYPO_PAIR .97 · HARMONY_SUFFIX .93 · YI_FEMININE_STEM .90 · DOUBLED_FINAL_LETTER .90 · DIGIT_GLUED .90 · MIXED_SCRIPT_LOOKALIKE .90 · SUFFIX_CONSONANT_CONFUSION .88 · DIGRAPH_II_FOR_IY .88 · HARMONY_VIOLATION_NEIGHBOR .75 (SEED-safe: vowel-only substitution, unique, strict M/F break) · EDIT_DISTANCE_UNIQUE .72 (**BROAD lexicon only**).

## Protected tokens (never rewritten)
Numbers/dates/ordinals (`2026`, `10-р`, `№12`), URLs and bare domains (`TORE.MN`), e-mail, Latin words (`TORE`, `Microsoft`), mixed IDs (`ISO-9001`, `A4`), acronyms (`НҮБ`, `НҮБ-ын`, unlisted ones are UNKNOWN), names (listed → VALID; a mid-sentence capitalised unknown word → `PROPER_NOUN_CANDIDATE`, never corrected). ALL-CAPS tokens are never rewritten.

## Data (data-first)
Vocabulary lives in versioned JSON packs (layers GENERAL / LEGAL / PROPER_NOUN / ABBREVIATION; USER_DEFINED in memory). `coverage: SEED|BROAD`: SEED means *absence proves nothing*, so edit-distance accusations are disabled. Build: `npx tsx scripts/build-spell-packs.ts`. Sources and licensing: `LANGUAGE_DATA_SOURCES.md`. Engine-level `UserDictionary` (add/remove, case-insensitive) outranks every rule.

## Morphology (real, not suffix-stripping)
`lemma + licensed suffix chain` with stem classes and harmony. The analyzer is a **validator**: a surface is VALID only if a lexicon lemma, transformed by a real stem alternation, takes a suffix chain the grammar licenses for that stem class AND vowel harmony.

**Nouns.** Stem classes C/Y/V/soft; alternations ь→и (хууль→хуулиар), vowel elision (ажил→ажлын), hidden г (flag `hidden-g`), short-vowel drop, г-final stems take «ий». Slots: plural → case (GEN DAT ACC ABL INS COM PRIV) → reflexive.

**Verbs (M1).** A «-х» lemma is stem + [linking vowel] + х, and the stem class decides which allomorph each suffix attaches to (`VERB STEM MODEL` in `morphology/analyzer.ts`):

| Class | Example | Rule | How it is known |
|---|---|---|---|
| NATIVE | хий-х, хаа-х | vowel/й-final stem; every suffix attaches directly | spelling |
| BASE | зур-а-х, бич-и-х | consonant-final stem. Vowel-initial suffixes take the lemma's **own** linking vowel (зур-**а**в, бич-**и**в); consonant-initial suffixes attach directly (зур-сан) | spelling |
| EPENTHETIC | нотл-ох, эхл-эх | stem ends C1C2 with C1 ∈ д т ж з с ш ц ч х: a hidden vowel surfaces before consonant-initial suffixes (нотол-сон, эхэл-сэн); и after ш/ж/ч, otherwise the stem's harmony; vowel-initial suffixes keep the bare stem (нотл-оод) | default rule, or flag `hv:<v>` (амрах → амар-сан) |
| VOWEL_STEM | ажилла-х, шалга-х | the stem keeps its vowel before consonant-initial suffixes (ажилла-сан) | **flag `vstem`** (cannot be read off the spelling: ажиллах → ажилласан, танилцах → танилцсан) |
| SOFT_I / SOFT_SIGN | бари-х, хори-х | бари- before в л м н, барь- before с т ц ч д з and я/ё | flag `soft-i` |

Groups: converbs `-ж -аад -тал -магц -нгаа -лгүй -саар`; participles `-сан` (+ case/privative chains), `-аагүй`; finite `-даг -лаа -в -жээ -на`; mood `-вал -маар -аасай -я(ъя/ье)`; imperatives `-аарай -ааЧ -чих -цгаа`; the «-х» participle takes case chains through the noun path (бичихийг, хийхгүй). Newer groups use **strict labial harmony**: оо/өө follows the stem's *last* non-neutral vowel (нотл-оод, оногдуул-аад). Older groups keep the original leniency (олсан is accepted next to олсон).

No unflagged guess: a lemma without `vstem`/`hv:`/`soft-i` is analysed with the default class, and a form that needs another class is simply not recognised (UNKNOWN). **Explicitly flagged** lemmas written without their stem vowel (ажиллсан, нотлсон, амрсан) are MISSPELLED / `STEM_VOWEL_MISSING` with an exact repair (ажилласан); nothing is claimed about unflagged lemmas.

A chain that fits except for **one wrong-gender or д/т-confused suffix** yields a violation with an exact repair, which is re-parsed and must be VALID; two different diagnoses → abstain. Mixed-harmony stems (loanwords, last vowel «и») are never accused. Every verb parse carries an internal `analysis` (lemma, stem allomorph, stem kind, linking vowel, suffix chain); the public check response is unchanged.

Validated against UniMorph khk (reference only, `scripts/spell-oracle-unimorph.ts`) and a TORE-authored verb gold (`tests/evaluation/spell-v1/verb-gold.json`), see `BENCHMARK.md`.

## Candidate generation & ranking
No scan of the dictionary: `DeleteIndex` (SymSpell-style, edit distance 1, Damerau transpositions via direct lookup; lazy, built once). Ranking = weighted edit cost (о↔ө .35, у↔ү .35, same-class vowel/consonant < 1, transposition .8) minus small frequency bonus, small layer penalty; frequency can only break near-ties.

## Integration
`src/application/use-cases/orthography/language-engine-v1-adapter.ts` maps results to the existing `OrthographyCheckResult`; Latin→Cyrillic stays served by the legacy module. `SpellEngineV1` also implements the existing `LanguageEngine` contract (`check()`), so the Phase‑1 registry/conformance suite applies.

## Limitations (honest)
- **Recall is low by design** on the SEED lexicon (≈570 words): most typos return UNKNOWN. Real recall needs a licensed BROAD lexicon.
- `ажилээс`-style forms (masculine stem with last vowel «и») are accepted leniently; not flagged, never suggested.
- Hidden-consonant nouns need a `hidden-g` flag in data; there is no hidden-н (`ногоон`) support yet.
- Verb morphology (M1) is complete only for the groups listed above. **Not** recognised (UNKNOWN): the bare converbs -ж/-ч after a consonant stem (явж, авч), causative stems (зуруул, хийлгэ — derivation), the «-зна» forms, soft-sign stems other than `soft-i` lemmas (тахья), contested «д+даг» contractions, and every lemma whose stem class is unflagged and non-default.
- Verbal nouns in «-х» inherit the noun case chain, which accepts a bare «-д» (хариулахд). Pre-existing; not tightened in M1.
- No grammar, punctuation, context or compound-splitting checks. No claim of being better than any commercial checker: see `BENCHMARK.md` for what *was* measured.

## M1.1

See [MORPHOLOGY_POLICY.md](MORPHOLOGY_POLICY.md): inflection/derivation scope, lexical flags (`cvb:ж`/`cvb:ч`), strict labial harmony for verbs, gold provenance. Causatives are OUT_OF_SCOPE (UNKNOWN) until M2.
