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

## M2 — real text, research mode, data pipeline (2026-10-06, private development)

Everything below was **measured** on a Linux container; every number is reproducible with the commands shown. Reference data (news corpus, dictionary) is class C/D: local only, never committed or bundled (see `DATA-SOURCES.md`). **No native-speaker review has taken place**; "adjudicated" means reviewed by the AI assistant that built the engine.

### What changed in the engine
* `ExternalLexiconProvider` boundary: a local research lexicon (here: dict-mn through Hunspell/WASM) can make absence from a *broad* dictionary meaningful. It is refused unless `environment: "development"`, is dead-code-eliminated from release builds and rejected by the package verifier.
* Noisy-channel gate for research mode (`research/provider.ts → ResearchPolicy`): a token seen more than 0.4× per million words is presumed valid; a likely name is never corrected; the repair must be ≥100× more frequent than the token; the best repair must lead the runner-up by `minMargin = 1.5` (one unit = 10× frequency), otherwise the verdict is UNKNOWN.
* Error-model candidate generator (`candidates/plausible-edits.ts`): delete / transpose / confusable-class substitution / vowel-or-any-letter insertion, each verified against the oracle.
* Data classes A–D in the pack schema; the lexicon refuses class C/D unless explicitly allowed.

### 1. Real news text, shipping configuration (class-A data only)
`npx tsx scripts/spell-data/corpus-eval.ts --limit 3000` — 2,867 articles, **755,239 word tokens**, 54,965 word types (types judged mid-sentence with their real capitalisation).

| | tokens | types |
|---|---|---|
| VALID | 46.95 % | 8.65 % |
| UNKNOWN (cannot judge — **not** an error) | **53.05 %** | 91.31 % |
| MISSPELLED | 0.01 % (56) | 0.04 % (21) |

Against the second-opinion dictionary: 345,774 UNKNOWN tokens (34,765 types) are words it accepts → this is the **coverage gap** of the 1.6 k-entry class-A lexicon. Of the 21 MISSPELLED types, 20 are also rejected by the dictionary; **1 false-positive candidate** (`онийн`, 1 token). Before this milestone's fixes the same run showed 6 types / 593 tokens (`нарын`, `авчээ`, `сахлаа`, `явуулжээ`, `хараат`, `онийн`): root causes were converb forms filed as nouns, `нар` filed as a particle, and a missing adjective — all fixed in data (`sources/overrides.tsv`) and pinned by `tests/unit/spell-real-text-audit.test.ts`.

### 2. Real news text, research mode (class-A + local dictionary + local frequency table)
Same corpus: VALID **92.73 %** of tokens, UNKNOWN 7.16 %, **MISSPELLED 0.11 %** (825 tokens, 716 types).

Adjudicated precision (seeded random sample of 100 flagged types, 1,500-article run; `gold/adjudicated-flags-v1.json`): ≈90 real errors with a correct top suggestion, 2 real errors with a wrong top suggestion, **1 valid word flagged** (`матраж`), 7 not judgeable. Read as: ~98 % of judged flags are real errors, ~1 % false accusations; counting the unjudgeable as wrong, 92 %. This sample is small and not native-reviewed — a point estimate, not a guarantee.

### 3. Synthetic errors injected into real running text
`npx tsx scripts/spell-data/synthetic-eval.ts --n 4000 --docs 3000` (seed 20261006). 4,000 real lower-case tokens ≥5 letters accepted by the dictionary, one realistic slip each; 3,453 mutants, of which 293 (8.5 %) happen to be other valid words (undetectable at word level, reported separately) → **3,160 testable**.

| | detected | UNKNOWN | top-1 (of testable) | suggestion precision (top-1 / flagged) | top-3 | MRR | wrong top-1 |
|---|---|---|---|---|---|---|---|
| shipping (class A) | 6.3 % | 93.1 % | 5.9 % | 94.5 % | 5.9 % | 0.059 | 11 |
| research mode | **75.2 %** | 24.1 % | **74.5 %** | **99.0 %** | 74.7 % | 0.746 | 24 |

Per kind (research mode, detected / suggestion precision): DOUBLE 88.4 % / 100 %, VOWEL_SWAP 87.2 % / 99.0 %, CONSONANT_CLASS 81.9 % / 100 %, TRANSPOSE 76.6 % / 99.5 %, VOWEL_DROP 64.0 % / 98.4 %, DELETE 56.1 % / 97.3 %, SUFFIX_HARMONY 50.0 % / 92.8 %. The `minMargin` knob trades recall for precision: at 0 → detection 89.8 % but suggestion precision 93.2 %; at 1.0 → 79.8 % / 98.6 %; at 1.5 (default) → 75.6 % / 99.1 % (1,500-token sweep).

Caveats that matter: the original words are "valid" only per the same dictionary that powers research mode (circular), the error model that injects slips is the author's, and real writers' errors are not uniformly distributed. These numbers show the *machinery* works; they are not a claim about real-user accuracy.

### 4. Targets vs measured
| Target | Status |
|---|---|
| Clean-text FP < 0.1 % | shipping: 0.01 % of tokens flagged on 755 k real tokens; 1 token (0.0001 %) is a false-positive candidate; research mode 0.11 % flagged of which ~1 % judged false → ≈0.001 % false-accusation rate (extrapolated from a 100-type sample) |
| Suggestion precision > 99 % | research mode 99.0 % (synthetic); shipping 100 % on its (tiny) flagged set — **met only in research mode / on synthetic data** |
| Top-1 > 95 % on validated errors | **not met**: 74.5 % of testable synthetic errors (recall-limited, precision-first); shipping 5.9 % |
| Dangerous false positives = 0 | 0 on all gold/regression sets; 1 candidate on real news (`онийн`) unresolved |
| Protected-token FPs = 0 | 0 (19 protected tokens + URL/e-mail/number/Latin checks, shipping and research) |

### 5. Latency / memory (shipping)
word p50/p95/p99 0.044 / 0.202 / 0.287 ms · 20,000 chars p50 18.9 ms · heap ≈19 MB (benchmark script). Research mode: Hunspell load ≈1.4 s, ≈150 MB RSS; candidate verification averaged ≈9 ms per judged unknown word (28.8 s for 3,160 mutants; cached per word); 55 k word types judged in ≈69 s (≈1.3 ms/type average).

## M3 — genre benchmark, four engines (2026-10-07, local, class-D news corpus)

Sample: 571,622 word tokens, 9 genres (corpus topic labels; ALL NEWS — no lawful clean government/legal/academic corpus exists, so "LEGAL" and "GOVERNMENT" are news proxies). The corpus contains real typos, so flag rates are upper bounds on false accusations. Judge: independent Hunspell second opinion (not ground truth).

| engine | VALID | UNKNOWN | flags / 1k words | flagged-but-oracle-accepts / 1k |
|---|---|---|---|---|
| LEGACY (orthography v0) | 86.96% (= "not flagged") | n/a | 130.36 | 127.09 |
| FROZEN_SHIPPING (start of phase) | 54.72% | 45.28% | 0.05 | 0.00 |
| NEW_SHIPPING (class-A packs only) | 79.90% | 20.09% | 0.11 | 0.03 |
| RESEARCH (local, never shipped) | 95.87% | 4.04% | 0.91 | 0.00 |

* Clean-text gate (`pipeline gate`): LONG_TERM tier (flag 0.0046% on committed clean text; baseline 0.0084%).
* Performance: word p95 0.12 ms; 20k-char document ≈ 32–37 ms on this container — **misses the 25 ms target** (not hidden); RESEARCH 160–210 ms (dev only). Heap +2.9 MB, cold start ≈ 60 ms.
* Synthetic errors (shipping): detected 8.1% (UNKNOWN 90% — most invented misspellings are not covered by class-A data, correctly left UNKNOWN); of flagged, top-1 correct 97.3%. Research: detected 76.2%, top-1 of flagged 99.3%.
* Lesson recorded: an `hv:а` verb flag inferred from only 2 oracle forms produced false accusations (зарсан, зардаг); flags now need ≥10 oracle-accepted forms.

## M4 — accuracy & coverage hardening (2026-10-07, local, class-D news corpus)

**Held-out methodology.** Documents 1…40,000 of the local news corpus were used to prioritise vocabulary and rule work; every headline number
below that says *held-out* comes from documents after 40,000 (`--skip 40000`). In-sample coverage is 88.4%, held-out 90.8%: the corpus is not
stationary, so these are not comparable to earlier in-sample figures. It is still ONE news corpus: «coverage» means «share of news tokens»,
never «share of valid Mongolian».

| | start of phase 2 | now |
|---|---|---|
| shipping VALID, held-out news | ~56% (frozen engine) · 85.8% (phase-1 end) | **90.76%** (UNKNOWN 9.23%) |
| flagged-but-oracle-accepted (FP candidates), held-out | 4 types | **0** |
| MISSPELLED tokens / 1k words | 0.05 | 0.05 |
| clean-text gate (flag rate, upper bound) | 0.0046% | 0.0060% (TARGET tier; 0 FP candidates; new flags = real typos) |
| CONFIDENT suggestion precision (synthetic, shipping, n=1,839) | 98.9% (n=738) | **99.7%** (6 wrong) |
| 20k chars p50 / max | 32–37 ms | 18.7 / 21.1 ms (quiet machine; machine-dependent) |
| word p95 | 0.12 ms | 0.04–0.29 ms |
| lexicon entries (shipped packs) | 5,766 | 9,623 |
| tests | 2,878 | 2,977 |

Genre (held-out, VALID): business 91.0 · legal-news 90.2 · tech 89.8 · government/politics 89.7 · academic 89.6 · environment 88.2 · health 87.9 ·
culture 87.4 · sport 80.9. UNKNOWN taxonomy (held-out, share of UNKNOWN): missing lemma 33.8 · true unknown 22.6 · proper name 12.2 ·
missing inflection 12.1 · compound 9.7 · derivational 5.3 · loanword 2.3 · abbreviation 1.1 · tokenizer 0.9 · technical 0.1.
Proper-name set (188 forms, in-sample, not gold): 0 accused, 96.8% recognised. Loanword set (96 forms): 0 accused, 97.9% recognised;
non-standard spellings are NOT detected (UNKNOWN, by design). Context re-ranking (synthetic slips, 2,500 multi-repair cases): engine order 99.0%
→ unigram 99.3% → bigram 99.9% → trigram 99.9%; decisive subset 89.6% of cases at 100% precision — little headroom, the ceiling is the test.
Per-kind weak spot (shipping): synthetic DELETE / VOWEL_DROP detection stays ≈0.5% (UNKNOWN is preferred over guessing).

## M5 — Phase 3: native-validation infrastructure + coverage hardening (2026-10-07, local)

**Result in one line: the 95% held-out target was NOT achieved. Lexical coverage on the frozen holdout is 89.88%. Recommendation: INTERNAL ALPHA.**

**Methodology.** Same corpus split as M4 (dev slice = docs ≤ 40,000; frozen holdout = docs > 70,000, aggregates only, never used to guide work).
Baselines are immutable JSON under `tests/evaluation/spell-v3/baselines/` (`phase2-frozen`, `phase3-start-*`, `phase3-final-*`). No benchmark
definition was changed to improve numbers. The corpus is news only (class D, local, never committed): «coverage» means «share of news tokens
the engine accepts», not «share of valid Mongolian», and a «lexically valid» token is not a native-reviewed one.

| | Phase 2 frozen | Phase 3 start | Phase 3 final |
|---|---|---|---|
| lexical coverage, frozen holdout | 89.02% | 89.12% | **89.88%** |
| lexical coverage, dev slice | – | – | 89.75% (89.98% artifact-free subset) |
| UNKNOWN, frozen holdout | – | – | **~8.4%** |
| release-claim coverage (TRUSTED + REVIEWED data only) | – | – | **~33.3%** |
| CONFIDENT suggestion precision (synthetic, shipping) | 99.7% | – | **99.7%** (fresh seeds: 99.68%, 99.73%; floor 99.5%) |
| clean-text FP baseline (Phase 2) | 0.0060% | – | 0.0060%, no regression |
| tests | 2,977 | – | **3,083 / 3,083 pass** |

**Why 89.88% vs 33.3%.** The product configuration loads PROVISIONAL packs (AI-drafted or rule-generated, 5,197 provisional lemma proposals plus
rule-derived forms). The release-claim configuration (`createSpellEngineV1({ minTier: "TRUSTED" })`) loads only TRUSTED (411 committed, engineer-vetted
entries) and REVIEWED (currently 0 entries) data. The difference is unverified vocabulary. It is closed by native review, not by engineering.

**UNKNOWN causes (share of corpus tokens, holdout, approximate):** missing lemma ≈4.75 · compound/derivational ≈1.3 · missing inflection/lemma-level ≈1.3 ·
proper name ≈1.2 · true-unknown variants ≈1.05. Gap to 95%: ≈5.1 points.

**Gates (no regression):** protected tokens, dangerous words, 5,700-case mutation suite (0 unexplained; ≈190 new adjudications are MODEL_ADJUDICATED, not
native), valid-paradigm acceptance, nonsense-word gate. Proper-name set: 0 accused, ≈96.8% recognised. Loanword set: 0 accused, ≈97.9% recognised
(both PENDING_NATIVE_REVIEW, not gold).

**Performance.** 20k-character document stayed within the 25 ms target in a clean process (`scripts/spell-data/perf-v3.ts`); see PHASE-3-REPORT.md.
**Not verified:** Windows. **Not changed:** production, QPay, secrets, feature flags.
