# Native review — what is needed, in what order

Everything below is infrastructure that exists today; **no native review has happened**. Nothing in this repository may be called
«native-reviewed» until `scripts/spell-data/review-v3.ts status` reports NATIVE_REVIEWED > 0, and the number is what may be quoted.

## Honest labels
NATIVE_REVIEWED (≥2 distinct native reviewers agree) · NATIVE_PENDING (one) · FLAGGED (a native asked for further review) · DISPUTED · ENGINEER_REVIEWED · MODEL_ADJUDICATED · AUTO_GENERATED · UNREVIEWED.
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

## What a reviewer can do (since Phase 5)
Each decision is **ACCEPT**, **REJECT**, **CORRECT** or **FLAG**. Every decision keeps reviewer id, kind, timestamp, note and the original proposal (the item itself is never edited; history is append-only).

| action | meaning | stored as |
|---|---|---|
| ACCEPT | the proposal is right | verdict VALID |
| REJECT | it is not a word / wrong spelling, no fix offered | verdict MISSPELLED |
| CORRECT | right word, wrong record (POS, flags, domain, lemma spelling) **or** the correct spelling | VALID + `lemmaCorrection`, or MISSPELLED + `suggestion` |
| FLAG | «not sure — someone else must look» | verdict UNKNOWN; the item becomes **FLAGGED** and can never be NATIVE_REVIEWED while the flag stands |

**Paradigm review.** On a lemma a reviewer may also list inflected forms as valid or invalid (`validForms` / `invalidForms` columns, separated by «;» or spaces). A form counts as **reviewed** only when ≥2 natives judged it the same way; a form one native calls valid and another invalid makes the item DISPUTED. Forms judged by one native stay *pending*. Corrected lemma records need the same agreement.

The sheet columns are `id category token sentence engineVerdict engineSuggestion engineReason proposedVerdict proposedSuggestion decision correction note action lemmaPos lemmaFlags validForms invalidForms`; `decision` may be `FLAG`. The reviewer's *kind* is still supplied by whoever runs the import.

**Using the result.** `npx tsx scripts/spell-data/paradigm-audit.ts` compares the engine with native-reviewed forms only and fails on a **false accept** (natives: invalid, engine: VALID) or **false reject** (natives: valid, engine: MISSPELLED); «engine says UNKNOWN» is reported as a coverage gap, not a failure. With no native review it prints that nothing can be audited. A reviewed corpus candidate (`LEMMA_CANDIDATE:*`) enters the lexicon only if the agreeing natives named the lemma and its POS.

## How much one decision is worth (planning, dev slice, upper bounds)
`npx tsx scripts/spell-data/review-impact.ts` (dev slice only, 3.13M tokens; UNKNOWN 10.11%). If a reviewer approved the top-K UNKNOWN word types that the independent dictionary also accepts, coverage could rise by at most:

| K reviewed types | 250 | 500 | 1,000 | 2,000 | 5,000 | 10,000 | 20,000 |
|---|---|---|---|---|---|---|---|
| + coverage (pp, upper bound) | 1.75 | 2.30 | 2.93 | 3.65 | 4.65 | 5.35 | 5.91 |

Dev VALID is ≈89.9%, so ≈95% needs on the order of **10,000 approved word types**, each judged by **two** natives, and only if almost all of them are approved (a reviewer will reject some). Each surface form counts as one decision here; reviewing a *lemma* also unlocks its inflected forms, so lemma-level review is worth more. Words the dictionary does not accept (≈3.8% of tokens: typos, rare names, junk) are not in this ceiling. These are planning numbers, not results.

## Open linguistic questions found while building (engine behaviour observed, no native opinion yet)
- «багшыг» is accepted as valid (багш + ыг); is «багшийг» the only standard spelling?
- Doubled final consonant after н («сайнн»): the engine treats it as UNKNOWN because loans are written that way (тонн); is it ever acceptable in a native word?

## Phase 6: disputes, uncertainty, morphology sheets, queues

**Disputes (append-only).** Two natives who disagree → `DISPUTED`; it never enters gold and never resolves by majority. It resolves only when an **additional** native records a decision carrying `adjudication: { reason }` that **agrees with at least one** of the disputing natives (verdict, correction, lemma record, no contradicting form). The result is `NATIVE_REVIEWED` with a `resolution` naming the resolver, the reason, the time, who it agreed with and who was overruled; all decisions stay in the log. An adjudicator who agrees with nobody, a missing reason, a second adjudicator, an engineer or a model → still `DISPUTED`.

**Uncertain forms.** A form marked FLAG is never a vote either way; it stays *pending* even if every reviewer flags it. A whole item marked FLAG makes it `FLAGGED` (not gold) until that reviewer decides again.

**Engine prediction vs native judgment.** Items carry `enginePredictions` (form, verdict, engine version), attached once and never edited (`withEnginePredictions` refuses to overwrite). Judgments live only in `decisions`. `paradigm-audit.ts` compares the two; a form natives call invalid that the engine accepts is a **false accept**. Example shape (fixture reviewers in the tests, NOT real review): engine accepts «багшыг»; two natives mark it INVALID and «багшийг» VALID → the audit reports one false accept. If a future change makes the engine reject «багшыг», that test must be updated on purpose.

**Morphology sheet** (`exportMorphologySheet` / `importMorphologySheet`): one row per (lemma, form) with `engineSays` in its own column; the reviewer first states `lemmaDecision` (VALID | REJECT | FLAG) on each lemma, then `judgment` (VALID | INVALID | FLAG) per form. Forms judged without a lemma decision are skipped, not assumed. Every sheet starts with a banner (ignored by the importer): *this data becomes release-grade only after the required native-review agreement is satisfied; engine columns are not answers; nothing is pre-filled.*

**Queues** (`npx tsx scripts/spell-data/review-queues.ts`, dev slice only, local files under `.spell-research/review-queue/queues/`, never committed because the source corpus has no stated licence): twelve separate queues — HIGH_IMPACT_MISSING_LEMMAS, MORPHOLOGY_VALIDATION, MORPHOLOGY_CONTRADICTIONS, HIGH_FREQUENCY_UNKNOWN, POSSIBLE_FALSE_POSITIVE, PROPER_NAMES, LOANWORDS, COMPOUNDS, DERIVATIONS, LEGAL_GOVERNMENT, DISPUTED_ITEMS, REVIEWED_REGRESSION. Ranking is deterministic (same input → byte-identical output; ties by code point) and every row says why it is high: `score = (occurrences + 2·documents + 5·fanOut) × (1 + 0.5·professionalShare) × 1.1 if the engine accuses the word`. Queue rows are ordinary review items with provenance AUTOMATIC; the score is shown next to, never inside, the decision columns.

**Gold accounting** (`goldStats`, `benchmark-report.ts`): native-review count, agreement rate, disagreement, resolution rate, reviewed/pending forms. A rate with nothing to divide is **NOT MEASURED**, never 0 or 1.
