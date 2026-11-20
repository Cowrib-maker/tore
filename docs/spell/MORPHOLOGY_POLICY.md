# TORE Spell — Morphology policy (M1.1)

Status: V1 verb morphology, precision-first. Flag `TORE_SPELL_LANGUAGE_ENGINE_V1` remains default OFF.

## 1. Inflection vs derivation

| Class | Example | V1 verdict |
|---|---|---|
| Inflection (tense, mood, participle, converb, imperative) | зурсан, зурна, зурж | analysed: VALID / MISSPELLED / UNKNOWN |
| Derivation (causative -уул/-үүл/-лга, passive, reciprocal) | зуруул, зуруулсан, хийлгэх | **OUT_OF_SCOPE → UNKNOWN** (never VALID, never MISSPELLED); M2 |

A derived stem is a new lemma. Without a licensed lexicon entry for it we make no claim.

## 2. Verdict contract

- VALID only when lemma + licensed suffix chain + harmony all verify.
- MISSPELLED only with a known lemma, a verified repair, and no competing analysis (e.g. wrong-gender participle on a known lemma → HARMONY; missing hidden vowel with a licensed vowel → STEM_VOWEL_MISSING).
- Anything lexically conditioned and not flagged → UNKNOWN.

## 3. Lexical flags (`verb-flags.tsv`)

`vstem`, `soft-i`, `hv:<v>`, `direct`, `cvb:ж`, `cvb:ч`. Classes that cannot be read off the spelling are data, not guessed.
Ambiguous sonorant clusters (two of м н г л б в р at the stem end) accept only vowel-initial suffixes unless flagged — this prevents ажиллсан / шалгсан / гэрлсэн from being VALID.

## 4. Oracle discrepancy classes (UniMorph khk, reference only)

A = engine bug · B = oracle noise/duplicate · C = oracle uses a non-standard/colloquial form · D = derivation filed as inflection · E = data (non-standard form / missing lexicon flag) · F = ambiguity needing native confirmation.
Result on 87 rejected unique verb forms: **0 engine bugs** (B 25, C 43, D 3, E 8, F 8). The oracle is never bundled or committed (CC BY-SA).

## 5. Legacy leniency register

| Form | Status | Note |
|---|---|---|
| ажилээс | still lenient in noun chains (labial harmony) | known debt |
| олсан (unflagged) | VALID only when lemma present | regression-tested |
| хариулахд | now not VALID (notEndsWith guard) | regression-tested |

Noun suffix chains still use lenient labial harmony; strict harmony applies to verbs only.

## 6. Gold data provenance

| Dataset class | File | Review status |
|---|---|---|
| TORE_AUTHORED | `verb-gold-draft-v1.json` (`VERB_GOLD_DRAFT_V1`) | **PENDING_NATIVE_REVIEW** — no human review has taken place |
| NATIVE_REVIEWED | `native-reviewed-v1.json` | empty (0 records) |
| REGRESSION | `regression-v1.json` | bug-derived |
| REFERENCE_ORACLE | UniMorph, local only | external; 4.8% overlap with the draft, 0 conflicts |

Human review workflow: `npx tsx scripts/spell-gold-review-export.ts` → TSV → reviewer fills verdicts → records are moved to `native-reviewed-v1.json` with `reviewer` and `reviewedOn`. `validateGold` rejects NATIVE_REVIEWED without those fields and rejects any AI-authored record claiming native review.
