# TORE Spell — Phase 3 report

Status: **INTERNAL ALPHA.** Not ready for any claim of native-level quality. Local development only: no production, QPay, secrets, feature-flag or
deployment changes. Windows is **not** verified. The 95% held-out coverage target was **not achieved**.

## 1. Headline numbers (all local, news corpus, see BENCHMARK.md M5)

| Measure | Value |
|---|---|
| Tests | 3,083 / 3,083 pass |
| Lexical coverage, frozen holdout | 89.88% (Phase 2 frozen 89.02%, Phase 3 start 89.12%) |
| UNKNOWN, frozen holdout | ~8.4% |
| CONFIDENT suggestion precision (synthetic) | 99.7% (floor 99.5%) |
| Clean-text FP baseline | 0.0060% (Phase 2), no regression |
| Release-claim coverage (TRUSTED + REVIEWED only) | ~33.3% |
| Native-reviewed items | **0** |
| Provisional AI-drafted lemmas | 5,197 |
| Target (95% held-out) | **NOT achieved**; gap ≈5.1 points |

## 2. Provenance vocabulary — what each label means

Data tiers (pack level, `provenance.tier`; selected with `createSpellEngineV1({ minTier })`):
- **TRUSTED** — committed pre-engine production dictionaries (core dictionary + legal lexicon, 411 entries). Engineer-vetted. **Not** native-reviewed.
- **REVIEWED** — requires ≥2 distinct native reviewers in agreement. Currently **0 entries**.
- **PROVISIONAL** — AI-drafted or rule-generated; the default for everything else. Unverified.
- **REJECTED** — never loaded.

Review statuses (per item, append-only decision log):
- **NATIVE_REVIEWED** — ≥2 distinct native-human reviewers agree. **0 items exist.**
- **MODEL_ADJUDICATED** — decided by the assistant (≈1,106 items, incl. ≈190 mutation adjudications). This is **not native validation** and never promotes anything.
- **AUTO** (AUTO_GENERATED) — produced by rules/scripts.
- Also: NATIVE_PENDING, DISPUTED (natives disagree), ENGINEER_REVIEWED, UNREVIEWED.

Engineers and models can never produce NATIVE_REVIEWED or REVIEWED status. Only TRUSTED and REVIEWED data may support release-quality claims.

## 3. What was built
- Review pipeline (`src/spell-engine/review/review.ts`): item schema, append-only decisions, consensus rules, TSV export/import; local-corpus sentences are never exported by default.
- Data tiers in pack schema and engine configuration.
- Gold-set scaffolding A–O separated by provenance (native / engineer / model / auto); only model and auto directories hold content.
- Controlled lemma pipeline and vocabulary packs (general, legal, government, business, names), all PROVISIONAL.
- Evidence-based morphology rules (R-GEN-LONG-GIIN, R-AGENT-CH-PLURAL, R-GEN-NMLZ-X, R-HAB-DAG-NOMINAL, R-PTCP-ELISION, R-CVB-N, R-AUX-CHIH and others; see MORPHOLOGY-RULES-P2/P3.md).
- Rival-repair ambiguity: competing repairs make a suggestion AMBIGUOUS; `autoApplySafe` is always false.
- Benchmarks and tooling under `scripts/spell-data/`; immutable baselines under `tests/evaluation/spell-v3/baselines/`.
- Performance work (lexer fast path, verb-plan/option caches, validity-first rival filter). Engine version 1.0.0-alpha.2.

## 4. Remaining causes of UNKNOWN (share of corpus tokens, approximate)
1. Missing lemmas ≈4.75%
2. Missing inflection / lemma-level gaps ≈1.3%
3. Compounds and derivational forms ≈1.3%
4. Proper names ≈1.2%
5. True-unknown variants ≈1.05%

Bulk-importing unverified words would raise the number and was rejected. Arbitrary concatenation is never VALID.

## 5. Limits of the evidence
- One news corpus; no lawful clean government/legal/academic corpus exists, so those genres are news proxies. No standalone government/legal coverage figure is claimed.
- A local second-opinion dictionary was used for QA only; nothing was copied from it.
- Name/loanword sets and all gold sets are PENDING_NATIVE_REVIEW.
- Synthetic-error precision is not human-verified precision.

## 6. Remaining blockers
1. No native reviewers: nothing in shipped vocabulary can be called native-validated.
2. No large lawful corpus to ingest (Common Voice CC0 text, CC BY-SA sources need legal review).
3. Long tail of missing lemmas cannot be closed by rules.
4. Windows not verified.

## 7. Next phase
Native review of `P_LEMMAS_PROVISIONAL` and the gold sets → ingest into the REVIEWED tier → lawful corpus acquisition → re-measure on a fresh holdout.

## 8. Release recommendation
**INTERNAL ALPHA.** Not CONTROLLED BETA until claim-tier coverage is raised by native review.
