# TORE Spell — language-engine architecture

Status 2026-10-07. The product is a **Mongolian language-intelligence stack**; spelling is its first layer. Everything below `src/spell-engine/` is dependency-free (no Node built-ins, no Prisma/Next/React), offline, deterministic.

```
text
 └─ Tokenizer (offset-exact, case-aware)            tokenizer/lexer.ts
     └─ Normalizer + protected-token detector       URL EMAIL NUMBER PHONE HASHTAG MENTION PATH CODE INITIAL SUFFIX LATIN MIXED ACRONYM
         └─ Lexical analyzer                        lexicon/ (domain packs, user dictionary)
             └─ Morphological analyzer              morphology/ (suffix tables, stem classes, harmony)
                 └─ Orthographic rule engine        rules/ + core/engine.ts  (harmony break, ы/ий, doubled letter, digraph, look-alikes)
                     └─ Candidate generator         candidates/ (plausible-edit error model; lexicon delete-index)
                         └─ Error model + ranker    ranking/ + data/models/error-model.json  (costs are DATA)
                             └─ Context model       context/ (bigram; real-word errors) — optional, local
                                 └─ Confidence / abstention   core/policy.ts, ambiguity (rival repairs), research gate
                                     └─ Diagnostic            diagnostics/ (unified LanguageDiagnostic; pluggable modules)
                                         └─ Desktop / API    desktop/core/spell-session.ts
```

## Contract
* **VALID / MISSPELLED / UNKNOWN.** UNKNOWN is never converted into MISSPELLED to raise recall. MISSPELLED needs positive evidence (a rule fired **and** the repair is itself valid). Names, loanwords and anything the data does not cover stay UNKNOWN.
* **A suggestion must be safer than doing nothing.** Every suggestion carries `confidence`, `reason`, `evidence[]`, `autoApplySafe` (always `false` today; text is never mutated silently) and, through the diagnostics layer, an explainable score breakdown. If two repairs are about equally plausible (алхх → алх / алхах; гэраас → гэрээс / гараас) the word is still reported but `suggestionStatus: AMBIGUOUS`, no best is claimed and the UI pre-selects nothing. A research-mode suggestion needs a margin over the runner-up or the word stays UNKNOWN.
* **Accusations are grounded on evidence, not on lexicon coincidence.** A harmony accusation requires a real harmony break (a strict vowel of the wrong gender; a suffix made of neutral letters such as «ийн» is a *form-selection* question and never an accusation). Lemmas shorter than 3 letters never ground an accusation (аж+ээ, ам+ийг). A д/т accusation needs a hand-curated (HIGH-confidence) lemma. Loanwords carry the `loan` flag (клуб → клубаас/клубээс: both accepted). A «vowel-neighbour» accusation needs a HIGH-confidence neighbour. Lemma confidence (`HIGH` hand-curated seed, `MEDIUM` AI-drafted vocabulary, `LOW` spelling-unstable loans) is carried per entry; LOW entries are accepted as VALID but are never offered as a repair.

## Data (language knowledge lives in data, algorithms in code)
| Layer | Where | Notes |
|---|---|---|
| Lexicon packs (domain layers GENERAL, LEGAL, GOVERNMENT, BUSINESS, ACADEMIC, TECH, MEDICAL, PROPER_NOUN, ABBREVIATION) | `data/sources/*.tsv`, `data/sources/vocab/*.tsv` → `scripts/build-spell-packs.ts` → `data/packs/*.json` (+ generated `index.ts`) | A word valid in one domain is not universally valid (`domains` option). Every pack declares `provenance.sourceIds`, `dataClass` and `reviewStatus`. |
| Verb stem classes | `data/sources/verb-flags.tsv` | `vstem`, `hv:<v>`, `soft-i`, `cvb:ж|ч` — facts the spelling does not reveal. |
| Audit overrides / removals | `data/sources/overrides.tsv` | Each line is a bug found on real text, with the reason. |
| Error model | `data/models/error-model.json` | Named costs and confusion pairs; estimates, not fitted (no lawful error corpus). Lists which of the 17 error kinds are implemented. |
| Typo pairs | `data/packs/typo-pairs.json` | Curated wrong→right. |
| Context model | none bundled | `NGramContextModel` + `RealWordContextModule`; a model is built locally from a corpus the owner may use. |

## Versions (separately versioned; a result is reproducible from them + the input)
`ENGINE_VERSION` (code) · `LANGUAGE_PACK_VERSION` · `LEXICON_VERSION` · `MORPHOLOGY_VERSION` · `RULES_VERSION` · `ERROR_MODEL_VERSION` · `CONTEXT_MODEL_VERSION` — all written to `dist/spell-pack/manifest.json` by `pipeline build`, together with every file's sha-256, entry count, data class, review status and the source registry status of each cited source.

## Diagnostics (one result type for everything)
`LanguageDiagnostic { type: SPELLING | MORPHOLOGY | CAPITALIZATION | WORD_BOUNDARY | GRAMMAR | PUNCTUATION | STYLE | UNKNOWN, verdict: MISSPELLED | UNKNOWN | ADVISORY, reason (public vocabulary: KNOWN_VALID … CONTEXTUAL_ANOMALY), range, suggestions[], suggestionStatus, source }`. A module implements `DiagnosticModule { id, version, analyze(ctx) }`; shipping modules today: **boundary** (extra space, space before punctuation, duplicated word, glued words, split suffix), **capitalization** (sentence start, known proper noun in lower case) and the optional **real-word context** module. Grammar, punctuation and style modules are interface-ready and **not implemented**.

## Performance contract
Single word p95 < 5 ms · 20,000 characters ≈ 20 ms · incremental re-check re-analyses only changed paragraphs (desktop session cache) · the research lexicon and the context model are local, slower, and never part of a release build (`desktop/scripts/verify-package.mjs` rejects them).

## What is deliberately NOT here
No neural model, no AI rewriting, no grammar/punctuation/style checking, no macOS/Word/browser integration, no keyboard-neighbour error class (needs the physical layout table; not guessed), no derivational morphology beyond lexicon-listed words (unsupported derivations stay UNKNOWN), no claim of native-speaker validation.
