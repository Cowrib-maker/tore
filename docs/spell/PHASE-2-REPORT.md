# TORE Spell — Phase 2 final report (frozen, 2026-10-07)

HISTORICAL DOCUMENT. Not edited by later phases. Machine-readable copy: `tests/evaluation/spell-v3/baselines/phase2-frozen.json`;
engine + data copy: `tests/evaluation/spell-v3/frozen-phase2-2026-10-07/`.

Scope: accuracy & coverage hardening. Nothing committed, pushed or deployed. Windows not verified. No native-reviewed gold existed.

| Metric | Value |
|---|---|
| VALID coverage, news, docs >40,000 («held-out»; later inspected word by word, so NOT a clean holdout) | 90.76% (UNKNOWN 9.23%); in-sample 88.37%; frozen start-of-phase engine 56.0% |
| UNKNOWN taxonomy (share of UNKNOWN) | missing lemma 33.8 · true unknown 22.6 · proper name 12.2 · missing inflection 12.1 · compound 9.7 · derivational 5.3 · loanword 2.3 · abbreviation 1.1 · tokenizer 0.9 · technical 0.1 |
| FP candidates (flagged while the second-opinion dictionary accepts) | 0 types; clean-text gate flag rate 0.0060% (upper bound incl. real typos) |
| Confident suggestion precision (synthetic, shipping, n=1,839) | 99.7% |
| Top-1/top-3/MRR over all injected errors (shipping) | 8.2% / 8.4% / 0.083 (97.1% of flagged have the right top-1); research engine 78.2% / 78.5% / 0.784 |
| Genre VALID (news labels) | business 91.0 · legal-news 90.2 · tech 89.8 · government 89.7 · academic 89.6 · environment 88.2 · health 87.9 · culture 87.4 · sport 80.9 |
| Proper names (188 forms, in-sample, not gold) | 0 accused, 96.8% recognised |
| Loanwords (96 forms, in-sample, not gold) | 0 accused, 97.9% recognised |
| Paradigm gate | 100% accepted, 0 false accusations; mutation gate 5,721 mutants, 0 suspects, 0 wrong repairs |
| Latency | 20k chars 18.7 ms median / 21.1 ms max; word p95 0.04–0.29 ms; heap ≈ +4.6 MB; cold ≈ 84 ms |
| Lexicon entries shipped | 9,623 |
| Tests | 2,977 |

Honest caveats recorded at the time: one news corpus only; all new vocabulary AI-authored (PENDING_NATIVE_REVIEW); mutation adjudications
assistant-authored; proper-name/loanword sets in-sample; no lawful commercial lexicon found (Hunspell mn GPLv2; Mongolian WordNet CC BY-SA 4.0
unverified; Common Voice Mongolian CC0 ~6,100 sentences and Tatoeba not downloaded). Milestone B (95%) not met.
Rules added: see `MORPHOLOGY-RULES-P2.md`. Benchmark detail: `BENCHMARK.md` §M4.
