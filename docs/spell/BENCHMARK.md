# TORE Spell — Language Engine benchmark

Run: `npx tsx scripts/benchmark-spell-engine.ts [--json out.json]` · gates: `tests/unit/spell-engine-v1-benchmark-gate.test.ts` (run by `npm test`).
Morphology oracle (reference data, local only): `TORE_SPELL_REF_UNIMORPH=/path/khk npx tsx scripts/spell-oracle-unimorph.ts`.

## Datasets (`tests/evaluation/spell-v1/`)
| ID | Dataset | Use |
|---|---|---|
| A | `clean-text.txt` — 24 clean sentences (164 words; names, acronyms, numbers, URL, e-mail, Latin) | false positives per 1000 words; unknown/valid rate |
| B | `paradigms.json` — 14 lemmas with valid/invalid inflections + 19 protected tokens | morphology acceptance, false MISSPELLED, top‑1 fix |
| C | seeded synthetic errors (DELETE/INSERT/TRANSPOSE/VOWEL_SWAP/DOUBLE_FINAL; seed 20261005) on lexicon words | detection, suggestion precision/recall, F0.5, top‑1/3, MRR, abstention |
| D | legacy gold sets via `gold-adapter.ts`, classified VALID / MISSPELLING / UNKNOWN / PROPER_NOUN / ABBREVIATION / LEGAL / REGRESSION + dangerous pairs | regression, precision gate |
| E | performance: per-word p50/p95/p99, 20 000-char document, heap | latency/memory |
| F | legacy engine on the same A and D | comparison |
| G | UniMorph khk oracle (reference only) | analyser acceptance / false violations |
| H | `verb-gold.json` — 45 verb lemmas, 928 valid forms, 366 invalid forms (TORE-authored; **native review pending**) | verb acceptance, false MISSPELLED, invalid→VALID |

Documented expectation changes versus the legacy gold sets are listed in `gold-adapter.ts → EXPECTATION_CHANGES`.

## Results (SEED production configuration, 2026-10-05, Linux container)
Reproduce with the commands above; numbers below are from one run, seed fixed.

| Metric | V1 | Legacy engine |
|---|---|---|
| A. MISSPELLED on clean text | **0 / 164 words (0.00 per 1000)** | 22 (**134 per 1000**) |
| A. VALID / UNKNOWN rate (V1) | 70 % / 30 % | n/a |
| B. valid paradigm forms accepted | 105 / 106 (99.1 %), false MISSPELLED **0** | — |
| B. invalid forms flagged / correct top‑1 | 9 / 10, 9 / 9 | — |
| B. protected tokens flagged | **0 / 19** | — |
| C. synthetic (≈3.6 k) detection / suggestion precision / top‑1 / top‑3 / MRR | 32.6 % / **100 %** / 100 % / 100 % / 1.000 | not measured |
| C. abstention (UNKNOWN) | 67 % | — |
| D. VALID 47/47, LEGAL 36/36, UNKNOWN 6/6, PROPER_NOUN 3/3, ABBREVIATION 3/3, REGRESSION 4/4 silent; dangerous pairs flagged | 0 / 40 | all silent |
| D. legacy MISSPELLING gold (top‑1 correct) | 9 / 17, 0 wrong fixes, 8 abstain | 17 / 17 |
| E. word latency p50 / p95 / p99 | 0.04 / 0.11 / 0.41 ms | — |
| E. 20 000-char document | ≈19 ms (p50) | — |
| E. heap after load | ≈17 MB (570 words + index) | — |
| G. UniMorph noun cases accepted / false violations | 95–99 % / 34 in 30,143 forms | — |

Reading it honestly:
- The legacy set scores 17/17 on its **own** gold typos because the gold set was written for it (circular), yet produces 134 false positives per 1000 words on independent clean text. V1 trades recall for precision: **it never accused a correct word in any dataset** but corrects fewer typos until a BROAD lexicon exists.
- Simulation (`--` second block of the script): declaring the same 570 words BROAD lifts synthetic detection to ≈76 % but produces 3 false positives on 164 clean words (18 per 1000). This is exactly why SEED packs disable edit-distance detection, and it is the number to re-measure with any real BROAD lexicon before enabling it.
- No claim is made relative to Bolor Duraan or any other product: it was not measured here.

## Gates (build fails if violated)
Zero MISSPELLED on clean text · zero false MISSPELLED on valid paradigms and protected tokens · wrong top‑1 fixes = 0 · synthetic suggestion precision ≥ 0.99 · no gold VALID/LEGAL/UNKNOWN/PROPER/ABBREVIATION/REGRESSION case flagged · dangerous pairs never flagged · word p95 < 5 ms · 20k chars < 500 ms.

## M1 — verb morphology (2026-10-05)

**UniMorph khk oracle** (local, reference only). The file repeats each verb paradigm many times, so the historical row-weighted number is dominated by verbs (15,551 of 30,143 rows are verb rows but only 899 are distinct). Both views are reported; the oracle lexicon has no stem-class data, so each verb lemma is given the flag set (`vstem` / `soft-i`) that explains more of its own forms (`--no-infer` turns that off).

| | Before M1 | After M1 (row-weighted) | After M1 (unique) | After M1, no flags inferred |
|---|---|---|---|---|
| Overall acceptance | 57.7 % | **93.5 %** | 96.3 % | 87.4 % |
| Verbs | ≈ 22 % | 90.5 % | 90.0 % | 78.7 % |
| Nouns | 95–99 % | 96.7 % | 96.7 % | 96.7 % |
| FALSE-VIOLATION | 34 | **34** (all nouns, none new) | 34 | 34 |

Per verb tag (row-weighted, after): IMP;PL;2 98.2 %, IMP;2 100 %, **IMP;3 2.9 %**, IND;PRS **74.0 %**, IND;PST 98.0 %, PRF 98.3 %, SBJV;PL;1 94.2 %, SBJV;1+2 100 %, SBJV;2+3 100 %, CVB01–05 100 / 100 / 100 / 100 / 99.9 %.

Two tags stay below 80 % on purpose:
- **IMP;3** (`-уул/-үүл`, `-лга`): causative stems, i.e. derivation, labelled «imperative» by UniMorph. Out of M1 scope.
- **IND;PRS**: the missing forms are `-зна` forms of verbs that are not in the lemma list (хөхөрзнө = хөхөрзөх) and «д + даг → -аг» contractions (бахиудаг) that contradict standard «-ддаг» (мэддэг). Accepting them would be wrong.

**TORE verb gold**: 45 lemmas, 928 valid forms accepted 928 (100 %), wrongly flagged 0; 366 invalid forms, 0 returned VALID (258 MISSPELLED, the rest UNKNOWN). The gold was expanded from a hand-written suffix chart and reviewed form by form; it has **not** been reviewed by a native linguist, and agreement with the engine shows internal consistency, not external truth.

**Mutation leak (informational)**: one-letter mutations of gold forms (5,481 strings that are not themselves gold forms): 7 accepted as VALID (0.13 %); every one is a different legitimate form or the inherited noun-chain leniency (хариулахд).

## M1.1 additions

Reported separately by `scripts/benchmark-spell-engine.ts`: verb gold draft (`VERB_GOLD_DRAFT_V1`, pending native review) valid acceptance and INVALID→VALID; regression set; seeded negative-mutation harness (0 unadjudicated VALID mutants; 113 adjudicated legitimate collisions); word p95 ≈ 0.2–0.3 ms. Oracle (local, reference only): 96.3% overall, nouns 96.7%, verbs 90.1% (77.6% with `--no-infer`), 24 noun false violations (all missing `harmony:F` lexicon flags on 4 loanword lemmas).
