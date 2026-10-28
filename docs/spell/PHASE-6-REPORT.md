# TORE Spell — Phase 6 report (native-validation infrastructure + high-impact prioritisation)

Status: **INTERNAL ALPHA** (unchanged). **Native-reviewed items: 0.** No vocabulary was added or promoted; no engine rule, benchmark or baseline was changed. Windows: **INFRASTRUCTURE BLOCKED / not verified**. Production, QPay, secrets, flags, licensing: untouched.

## 1. What was implemented
| Area | What |
|---|---|
| Disputes | explicit adjudication by an additional native, with reason; overruled reviewers and the original disagreement stay on record; no silent majority |
| Uncertainty | per-form FLAG (never a vote) and item-level FLAGGED status |
| Engine vs native | immutable `enginePredictions` on items; audit names false accepts / false rejects / coverage gaps |
| Reviewer sheets | morphology sheet (lemma decision, then per-form VALID/INVALID/FLAG, engine column separate); banner on every sheet; importer ignores comments and cannot promote itself |
| Queues | 12 explicit, deterministic, impact-scored queues with reasons; export as normal review items (provenance AUTOMATIC) |
| Gold accounting | `goldStats`: native count, agreement, dispute, resolution, reviewed/pending forms; empty denominators are NOT MEASURED |
| Sources | `LEXICON-SOURCE-DECISIONS.md` generated from the registry (APPROVED / REJECTED / LEGAL_REVIEW_REQUIRED) with a drift test |
| Reporting | `benchmark-report.ts` (one table; unmeasurable metrics print NOT MEASURED); `morph-rule-precision.ts` (rule signatures vs the second-opinion dictionary) |

## 2. Why it matters
A linguist can now say «not sure», correct a record, judge each inflected form, and settle a disagreement through a recorded adjudication — and nothing the software guessed can be mistaken for what they said. The queues put the questions with the most real text behind them first and show why.

## 3. Impact estimates (dev slice 3,128,378 word tokens; UPPER-BOUND ESTIMATES; every item assumed genuinely valid; REQUIRES NATIVE REVIEW before any becomes data)
| queue | top 100 | top 500 | top 1,000 |
|---|---|---|---|
| HIGH_IMPACT_MISSING_LEMMAS (21,744 candidates) | ≤ +0.69 pp | ≤ +0.95 pp | ≤ +0.98 pp |
| HIGH_FREQUENCY_UNKNOWN (68,294 candidates; includes names, loans, forms) | ≤ +1.17 pp | ≤ +2.11 pp | ≤ +2.41 pp |

Queue sizes at limit 1,000: MORPHOLOGY_VALIDATION 1,000 lemmas (703,610 tokens in their observed forms) · MORPHOLOGY_CONTRADICTIONS 1,000 · PROPER_NAMES 1,000 · LOANWORDS 950 · COMPOUNDS 1,000 · DERIVATIONS 1,000 · LEGAL_GOVERNMENT 1,000 · POSSIBLE_FALSE_POSITIVE 0 · DISPUTED_ITEMS 0 · REVIEWED_REGRESSION 0. Queue hash `08f1814262ac3369` (engine 1.0.0-alpha.2, local corpus; reproducible only with the local corpus). The concentration is weak: the first 1,000 missing lemmas cover under 1 pp, so coverage comes from breadth, not from a short list — consistent with the earlier ≈10,000-type estimate.

## 4. Morphology leads found (engineer observations, NOT native judgments)
`morph-rule-precision.ts` (common-word lemmas, dev slice): the independent dictionary agrees with 93.6% of the 29,977 word types the engine accepts through morphology. Lowest agreement: `AUX_CHIH+CVB_AAD` 33% (27 types: «орчихоод», «болгочихоод» — rule R-AUX-CHIH, a native should confirm), `GEN+NMLZ+COLL` 81%, `PTCP_PAST+GEN` 82%. In the genitive, class-C stems also accept `ны/ний` («номний», «гэрний», «төгрөгний», «хөлний»): 121 of 461 such types (625 of 22,046 tokens, 2.8%) are rejected by the dictionary. Many are probably real over-acceptance (a missed error, not an accusation), but the dictionary is small and also rejects correct forms (e.g. «бөмбөгийн»), so **no rule was changed**: the evidence cannot separate the two, and the impact is ≈0.02% of tokens. These forms belong in the MORPHOLOGY_CONTRADICTIONS / MORPHOLOGY_VALIDATION queues. «ашиглалтанд» and «эрхэнд» (noun + collective + case) are also accepted and look wrong; same decision.

## 5. Benchmark (frozen holdout baseline; engine unchanged → identical to Phase 4)
VALID 89.98% (all tiers) · release-claim 33.34% · UNKNOWN 10.01% · MISSPELLED 144 tokens · FP candidates 0 · confident-suggestion precision 99.47% (1,320/1,327; AUTO synthetic, two seeds) · detection ≈8% (AUTO synthetic). NOT MEASURED: false-positive rate against native truth, recall on real typos, morphology accuracy, domain (legal/government) correctness. Full table: `scripts/spell-data/benchmark-report.ts`.

## 6. Performance (this container; engine and data unchanged)
word p50 0.02 / p95 0.19 / p99 0.46 ms · 20k chars warm p50 12.6 / p95 14.6 ms, **cold** p50 26.4 / p95 47.4 ms (first window ≈246 ms) · cold start ≈54 ms · engine heap ≈4.9 MB · documents: 1 page 98 ms first check, 10 pages (30k chars) 275 ms, 50 pages (150k) 693 ms; editing one paragraph ≈2 ms at every size. 35k characters measured only as an incremental edit inside a test (<250 ms bound); a separate 35k cold figure is NOT MEASURED.

## 7. Counts
Native-reviewed 0 · TRUSTED entries 411 · REVIEWED 0 · PROVISIONAL ≈10,6k lexicon entries (5,197 AI-drafted lemma proposals awaiting review) · MODEL_ADJUDICATED review items 6,303.

## 8. Lexicon sources
7 approved (all TORE-owned, legally clear; the AI-drafted ones remain linguistically PROVISIONAL) · 17 legal review required · 2 rejected. **No broad third-party lexicon is verified.** See `LEXICON-SOURCE-DECISIONS.md`.

## 9. Regressions
None found; no engine or data change in this phase.

## 10. Remaining blockers
REQUIRES NATIVE REVIEW (≥2 native reviewers; ≈10,000 word types for ≈95%; paradigm forms; the open questions in NATIVE-REVIEW.md). LEGAL decision on any third-party lexicon. INFRASTRUCTURE BLOCKED: no working Windows runner (latest runs fail in ≈4 s before any step). Production configuration (prices, QPay, hosting, signing, update host).

## 11. Release status
**INTERNAL ALPHA.**
