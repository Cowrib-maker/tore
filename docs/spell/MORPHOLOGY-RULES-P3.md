# Phase 3 morphology / orthography rules (2026-10-08)

All PENDING native review. Evidence = a local second-opinion dictionary (class C, QA only, nothing copied) measured over the lexicon's verbs/nouns,
plus corpus attestation (class D, local only). Tests with positive / negative / counter-examples: `tests/unit/spell-phase3-rules.test.ts`.
Phase 2 rules: `MORPHOLOGY-RULES-P2.md`.

| Rule | Effect | Evidence |
|---|---|---|
| R-CVB-HDAA | «while doing»: participle -х + даа/дээ/доо/дөө (хэлэхдээ, ажиллахдаа); strict harmony (хэлэхдаа is a flagged slip) | ~80% of 798 verbs; 0.07% of news tokens |
| R-AUX-CHIH | perfective auxiliary «чих» + endings accepted ≥90% by the oracle (сан, даг, лаа, жээ, вал, тал, магц, саар, маар, оод…): болчихсон, эхэлчихсэн. Parses only — never an accusation. «ирчихэв», «болчихчих» stay UNKNOWN | 798 verbs; 0.14% of news tokens |
| R-DERIV-CAUS / R-DERIV-PASS | generated LOW-confidence verbs «root+уул/үүл+ах/эх» and «root+link+гд+ах/эх» (valid, never a repair). Vowel-final stems (хийх) and already-derived verbs are skipped | oracle 60% / 56% of verbs |
| R-PRONOUN-STEMS | stems бидэн тэдэн түүн үүн өөрсөд өөр as no-plural nouns: биднээс, түүнийгээ, өөрсдийгөө | grammar fact; corpus |
| R-ORDINALS | rule-generated ordinals 1–99 incl. glued news compounds (арваннэгдүгээр) + -т | numeral system |
| R-SOFT-I-2LETTER, R-GEN-NMLZ-X, R-HAB-DAG-NOMINAL, R-CVB-N, R-DERIV-GCH/LT … | see P2 | see P2 |

Evaluated and REJECTED (evidence too weak, risk of garbage): generic noun derivations (-лаг 11%, -чин 4%, -т 20%, -лан 8% of nouns), diminutive -хан/-хэн
(48% of adjectives, semantically irregular), unrestricted compounding, name-element compounds (covers 4.6% of unknown names ≈ 0.1% of tokens), verb endings
-сугай/-тугай (archaic), keyboard-adjacency typo model (the Mongolian layout table is not verified; not guessed).

Corpus artifact, not an engine defect: 2.4% of corpus documents split ө/ү into lone tokens («т ө р ө л»); the benchmark reports ALL and CLEAN (artifact-free).
Variants the oracle rejects but writers use (хүсч, засч, сонсч — contracted converbs; дээрхи; компаний; хуулинд) are left UNKNOWN on purpose.
