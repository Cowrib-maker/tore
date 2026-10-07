# Native review — what is needed, in what order

Everything below is infrastructure that exists today; **no native review has happened**. Nothing in this repository may be called
«native-reviewed» until `scripts/spell-data/review-v3.ts status` reports NATIVE_REVIEWED > 0, and the number is what may be quoted.

## Honest labels
NATIVE_REVIEWED (≥2 distinct native reviewers agree) · NATIVE_PENDING (one) · DISPUTED · ENGINEER_REVIEWED · MODEL_ADJUDICATED · AUTO_GENERATED · UNREVIEWED.
The reviewer *kind* is claimed by whoever runs the import; a model can never be `NATIVE_HUMAN`; history is append-only.

## Workflow
1. `npx tsx scripts/spell-data/review-v3.ts queue --category MISSPELLED --limit 300 --out q.tsv` (or `--set P_LEMMAS_PROVISIONAL`).
2. The reviewer fills `decision` (VALID | MISSPELLED | UNKNOWN), `correction` (for MISSPELLED), `note` in a spreadsheet.
3. `npx tsx scripts/spell-data/review-v3.ts import --file q.tsv --reviewer <id> --kind NATIVE_HUMAN` (two different reviewers needed).
4. `npx tsx scripts/spell-data/lemma-pipeline.ts ingest` then `npx tsx scripts/build-spell-packs.ts` → approved lemmas enter tier REVIEWED.
5. Local-only queue with corpus context: `review-v3.ts corpus-queue` (class-D sentences stay under `.spell-research/`, never committed).

## Priority (highest value first)
1. `P_LEMMAS_PROVISIONAL` (≈5,200 shipped lemmas): approve or reject — this alone moves the release-claim coverage.
2. Items where the engine and the assistant disagree (priority 90–100 in sets A–O).
3. `O_COMMON_TYPOS`, `J_PROPER_NAMES*`, `K_LOANWORDS*`, `M_COMPOUNDS`, `L_ABBREVIATIONS`, `N_INFLECTION`.
4. Genre prose A–I: read each passage; mark unnatural phrasing; confirm every token.
5. The 11 Phase-2/3 rules in `MORPHOLOGY-RULES-P2.md` and the ≈400 oracle-inferred verb/noun flags (`verb-flags.tsv`, `noun-flags.tsv`).
6. The 87+ assistant-adjudicated mutation exceptions (`gold/mutation-adjudications-v1.json`).
