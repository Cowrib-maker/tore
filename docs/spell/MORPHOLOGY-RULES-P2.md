# Phase 2 morphology / orthography rules (2026-10-07)

Every rule below was added or tightened in the accuracy-and-coverage hardening phase. **All are PENDING native review.** Evidence = a local
second-opinion dictionary (class C, QA only, nothing copied) and corpus attestation (class D, local only). Each rule has positive,
negative and counter-example tests in `tests/unit/spell-phase2.test.ts`.

| Rule | What | Direction | Evidence |
|---|---|---|---|
| R-GEN-LONG-GIIN | long-vowel stem also takes genitive «гийн» (байгаагийн, хүүгийн, Болормаагийн) | widens VALID | oracle accepts for ~50% of long-vowel nouns (lexical) → both ны/ний and гийн licensed |
| R-AGENT-CH-PLURAL | ч-final / чин nouns: plural stem «-чид» (зохиолчид, зохиолчдын); the pseudo-lemma takes no second plural (`no-plural`) | widens VALID | 88/89 lexicon ч-nouns |
| R-GEN-NMLZ-X | genitive + «х»: хотынх, хотынхон, багийнхан, оныхоос | widens VALID | corpus ~1% of tokens; oracle 41% of nouns |
| R-HAB-DAG-NOMINAL / R-PTCP-ELISION | habitual and past participles as nouns, with vowel elision before a vowel-initial case suffix (байдаггүй, байдгийг, болсныг, зурснаар) | widens VALID | oracle + corpus; un-elided «байдагийг» stays invalid |
| R-CVB-N | converb = infinitive − х + н (ашиглан, оруулан, дэмжин) | widens VALID | 100% of 700+ verbs, every stem class |
| R-DERIV-GCH / R-DERIV-LT | agent noun «…гч» and action noun «…лт» generated from verb lemmas as LOW-confidence nouns (never a repair) | widens VALID | oracle ≥99% of ~750 verbs |
| R-SOFT-I-2LETTER | a two-letter lemma grounds a guess only if flagged `soft-i` (үе → үеийг) | widens VALID | – |
| R-INVARIANT-GUI | «-гүй» is invariant and is ignored by the vowel-neighbour accusation (дамжихгүй, тусгүй) | **removes false accusations** | real-text FP types |
| R-DOUBLE-FINAL-LOAN-GUARD | no «doubled final» accusation for л н м с т ф б п р з к unless TRIPLE (холл, хилл, тонн, билл) | **removes false accusations**, costs ~1 pt detection | corpus survey of double-final types |
| R-DT-LONG-VOWEL-GUARD | long vowel + т (хүрээт) is the adjectival «-т», never a mistyped converb | **removes false accusations** | held-out FP candidate |
| R-VERB-FLAG-LOST-FORM-GUARD | a verb stem flag must not invalidate a form the oracle accepts (дагах+vstem would break дагсан); homograph-stem conflicts are reviewed by hand | removes false accusations | `audit-verb-flags.ts` |
| rival repairs | a second valid word one transposition / vowel swap / deletion away makes the suggestion `AMBIGUOUS` (no best) | removes wrong confident suggestions | synthetic wrong-top-1 analysis |

Lexical flags inferred under the same discipline (explain ≥N more oracle-accepted forms, lose none, add no more oracle-rejected forms than the
default): `verb-flags.tsv` (vstem / hv / soft-i / cvb), `noun-flags.tsv` (hidden-g, soft-i).

Not implemented (and why): ordinal typo detection (ordinals are rule-generated `X form` entries, MEDIUM, never repairs); derivational suffixes other
than гч/лт (-лаг, -мж, -лга: oracle acceptance 5–10%, not productive enough); compound splitting (high false-accept risk).
