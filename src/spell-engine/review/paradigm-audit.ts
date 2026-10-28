/**
 * Paradigm gold + engine audit. Only forms that ≥2 NATIVE reviewers judged the same way (and only on a NATIVE_REVIEWED lemma) are gold.
 * The audit compares the engine to that gold and names the two kinds of disagreement, which are NOT equally bad:
 *   falseAccept   natives say the form is INVALID, the engine says VALID      → a wrong word is silently accepted (a correctness bug)
 *   falseReject   natives say the form is VALID,   the engine says MISSPELLED → a right word is accused (the dangerous one: precision)
 *   coverageGap   natives say the form is VALID,   the engine says UNKNOWN    → missing knowledge (honest, not an accusation)
 * Pure: the engine is passed in as a function, so the module has no dependency on the engine and can run in tests with any fixture.
 */
import { itemState, type SpellReviewItem } from "./review";

export type ParadigmGoldForm = { lemma: string; form: string; valid: boolean; itemId: string };

/** Native-reviewed paradigm forms (lemma items whose verdict is VALID). Nothing weaker than two agreeing natives appears here. */
export function paradigmGold(items: readonly SpellReviewItem[]): ParadigmGoldForm[] {
  const out: ParadigmGoldForm[] = [];
  for (const it of items) {
    const st = itemState(it);
    if (st.status !== "NATIVE_REVIEWED" || st.verdict !== "VALID") continue;
    const lemma = st.lemmaCorrection?.lemma ?? it.token;
    for (const f of st.reviewedForms ?? []) out.push({ lemma, form: f.form, valid: f.valid, itemId: it.id });
  }
  return out;
}

export type ParadigmAudit = {
  forms: number;
  agree: number;
  falseAccept: ParadigmGoldForm[];
  falseReject: ParadigmGoldForm[];
  coverageGap: ParadigmGoldForm[];
};

export function paradigmAudit(gold: readonly ParadigmGoldForm[], verdictOf: (form: string) => "VALID" | "MISSPELLED" | "UNKNOWN"): ParadigmAudit {
  const r: ParadigmAudit = { forms: gold.length, agree: 0, falseAccept: [], falseReject: [], coverageGap: [] };
  for (const g of gold) {
    const v = verdictOf(g.form);
    if (g.valid && v === "VALID") r.agree += 1;
    else if (g.valid && v === "MISSPELLED") r.falseReject.push(g);
    else if (g.valid) r.coverageGap.push(g);
    else if (v === "VALID") r.falseAccept.push(g);
    else r.agree += 1; // an invalid form the engine does not accept: MISSPELLED or UNKNOWN are both safe
  }
  return r;
}
