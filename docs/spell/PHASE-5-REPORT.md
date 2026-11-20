# TORE Spell — Phase 5 report (master product excellence pass)

Status: **INTERNAL ALPHA** (unchanged). Native-reviewed items: **0**. Windows: **not verified** (latest GitHub runs for commit 54f3e61 again failed within ~4 s, before any step). Production, QPay, secrets, flags: untouched.

## What was the highest-value problem?
After Phase 4 the product's ceiling is **lexicon breadth**, and the only lawful way to raise it is **native review of word data**. The review pipeline could not yet capture what a linguist actually needs to say (flag a doubt, correct a record, judge inflected forms). That was fixed. No vocabulary was added, no engine rule was changed, no benchmark was touched.

## What changed
| Change | Why it matters |
|---|---|
| Reviewer actions ACCEPT / REJECT / CORRECT / FLAG; new status FLAGGED | a reviewer who is unsure can say so without forcing a verdict; a flag blocks gold status |
| Lemma correction (lemma spelling, POS, flags, domain, kind) needing two agreeing natives | reviewers fix a wrong record instead of only accepting/rejecting it |
| Paradigm forms judged valid/invalid; a form is *reviewed* only if ≥2 natives agree; contradictions → DISPUTED | morphology can finally be validated form by form |
| TSV export/import with the new columns; reviewer kind still supplied by the importer | spreadsheet workflow for linguists; a file cannot promote itself to native |
| `paradigm-gold` + `paradigm-audit` (engine vs native forms: false accept / false reject / coverage gap) | the moment natives exist, every engine error against them is named; today it reports 0 forms |
| Lemma ingest honours agreed lemma corrections; corpus candidates need a named lemma + POS | a reviewed surface form cannot slip in as a lemma |
| `review-impact.ts` planning tool (dev slice only) | tells how many reviewer decisions buy how much coverage (table in NATIVE-REVIEW.md) |
| 13 new tests (`spell-review-paradigm.test.ts`) | consensus rules, flags, corrections, forms, TSV, audit |

## Measured planning result (dev slice, upper bound, not an improvement)
UNKNOWN is 10.11% of dev tokens; 6.34% of tokens are UNKNOWN word types the independent dictionary accepts. Approving the top 500 / 2,000 / 10,000 of those types could add at most +2.3 / +3.65 / +5.35 pp. So reaching ≈95% needs ≈10,000 natively approved types (each by two natives) — roughly an order of magnitude more than the 5,197 provisional lemmas already waiting. Nothing in this repo can substitute for that.

## Unchanged baselines (engine and data untouched; numbers from Phase 4 runs)
VALID 89.98% · UNKNOWN 10.01% · release-claim coverage 33.34% · confident-suggestion precision 99.47% pooled (99.1–99.7% by seed) · shipped synthetic typo detection ≈8% · 20k chars p50 ≈12 ms / p95 ≈14 ms · word p95 0.17 ms · cold start ≈52 ms.

## Evaluated and not built
- Soft suggestions on UNKNOWN words, keyboard-neighbour costs, bulk vocabulary: see PHASE-4-REPORT.md (78% of affected UNKNOWN words are valid; no ground truth; no lawful source).
- Form generator for reviewer sheets: stem alternations (hidden vowels, drops) make a naive generator misleading; reviewers type forms instead.
- Lexicon sources: the registry still has exactly one VERIFIED_SHIPPABLE source (TORE's own original vocabulary). Every third-party list is UNVERIFIED or AMBIGUOUS and stays local QA only. A legal decision is required before any is shipped.

## Remaining blockers (all external)
1. Two or more native Mongolian reviewers (≥10,000 word-type decisions for ≈95%).
2. A legal decision on broad lexicon sources.
3. A working Windows runner (installer, install/uninstall, selftest, activation have never executed on Windows).
4. Production configuration: prices, QPay, installer hosting, signing certificate, update host; Spell flag OFF.

## Release status
**INTERNAL ALPHA.** Not a beta, not production-ready, not «native-grade».
