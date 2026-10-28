# TORE Spell — Language data sources & licensing decision

> The wider research register (four data classes A–D, per-source licence status, what could and could not be verified) is **[DATA-SOURCES.md](DATA-SOURCES.md)** (2026-10-06). This file remains the *shipping* decision.

Status: **decision recorded 2026-10-05** · scope: Language Engine V1 · reviewer: legal sign-off still required before any change to the bundled set.

Principle: **source-code license ≠ data license.** A permissive license on a repo's code says nothing about its word lists. Anything with an ambiguous or share-alike data license is **not bundled** into the paid desktop product.

## Decision

| Role | Resource |
|---|---|
| **PRIMARY_PRODUCTION_RESOURCE** | TORE-owned data packs (`src/spell-engine/data/packs/*.json`, built by `scripts/build-spell-packs.ts` from TORE-authored sources) **+** TORE-implemented morphology (`src/spell-engine/morphology`). Fully owned, redistributable, `coverage: SEED`. |
| **SECONDARY_REFERENCE_RESOURCES** | Used locally to *design and validate*, never shipped: UniMorph Mongolian (khk) as a morphology oracle; `bataak/dict-mn` as a coverage reference. |
| **BENCHMARK_ONLY_RESOURCES** | UniMorph khk, UD Mongolian treebank, dict-mn word list — loaded from local paths via env vars (`TORE_SPELL_REF_UNIMORPH`), in memory only, never committed. |

Why: no resource found is both **broad** and **clearly licensed for commercial redistribution**. A small owned lexicon plus real morphology with a *SEED* policy (no edit-distance accusations from a lexicon that cannot prove absence) is the only configuration whose precision we can defend today. The pack format is pluggable, so a licensed broad lexicon can be dropped in without engine changes.

## Resource table

| Resource | Source-code license | **Data license** | Coverage / quality | Redistribution in paid product | Verdict |
|---|---|---|---|---|---|
| `bataak/dict-mn` (Hunspell, 580,636 entries, 11,954 affix rules) | permissive-looking repo | **Self-contradictory**: text prohibits redistribution while the package also cites LPPL 1.3 | Best coverage found; quality unaudited | Not safe | **AMBIGUOUS / DO NOT BUNDLE.** Ask the author for an explicit commercial license (recommended action). Local benchmark/reference only. |
| `dictionary-mn` (npm) | MIT wrapper | derived from dict-mn → inherits the ambiguity | same | Not safe | **DO NOT BUNDLE** |
| `@cspell/dict-mn-mn` | MIT | derivative of dict-mn word list | same | Not safe | **DO NOT BUNDLE** |
| UniMorph Mongolian (khk) | n/a | CC BY-SA 3.0 (share-alike) | ~2k lemmas, good paradigms, some noise on loanwords | Share-alike would taint the bundled pack | **Reference/oracle only** |
| UD Mongolian (MG treebank) | n/a | CC BY-SA | tiny, annotated text | Share-alike | **Benchmark only** |
| Old Hunspell wrapper in TORE history | — | origin/licence undocumented | broken | — | **Not revived** |
| TORE `CORE_DICTIONARY_WORDS`, `legal-lexicon.ts`, `typo-pairs` | proprietary | **TORE original work** | ~570 words (seed) | Yes | **Bundled** (`redistributable: true`) |

Nothing in this repository contains dict-mn, UniMorph or UD data. Tests assert that bundled packs declare `redistributable: true`, carry provenance, and do not mention third-party sources. The morphology *rules* are written from standard Mongolian grammar (toli.gov.mn «Зөв бичих дүрэм»), and UniMorph was used only to **measure** them.

## Safe path to broad coverage (next)

1. Obtain a written commercial license for dict-mn (or another broad lexicon) → add as a `GENERAL` pack with `coverage: "BROAD"`, `redistributable: true`, provenance recording the license text.
2. Until then the pack stays SEED. When BROAD loads, `EDIT_DISTANCE_UNIQUE` detection activates automatically (benchmark it first: see `BENCHMARK.md`).
3. Corpus-derived vocabulary (legal corpus) may enter only as `LEGAL` packs after the existing review gate.

## Verb stem-class data
`src/spell-engine/data/sources/verb-flags.tsv` (TORE-authored; native review pending) marks verbs whose stem class cannot be read off the spelling (`vstem`, `hv:<v>`, `soft-i`). It is merged into the packs by `scripts/build-spell-packs.ts`. A future licensed lexicon must supply the same information (Hunspell-style affix classes map onto it).

## Pack rules (enforced by `validatePack`)
Schema `tore-spell-pack/1`; required `provenance.source`, `provenance.license`, boolean `provenance.redistributable`; lower-case Cyrillic words (names/abbreviations excepted); no duplicates; invalid packs are refused outright (a half-loaded lexicon would silently change what counts as valid).

## Beta coverage batch (2026-10-06)
* `corpus-forms.tsv` → pack `tore-corpus-forms` (`scripts/spell-extract-corpus-forms.ts`): surface forms attested in **TORE-authored** text only (UI copy, messages, curriculum fixtures). Pipeline: tokenize → normalize → frequency → filter (length, repeated letters, no-vowel, acronym/name candidates dropped) → engine cross-check → evidence gate (≥2 files or ≥3 occurrences, lower-case seen) → `form`-only entries (no paradigm). 917 forms. Frequency is evidence, not truth; no native review.
* `general-extra.tsv` Beta batch: ~118 basic function words / numerals / common verbs / nouns authored by TORE; non-verb content words are `form`-only. Pending native review.
* No third-party word list, no Bolor data, no dict-mn. Coverage remains **SEED** (absence proves nothing) so edit-distance accusation stays disabled.
