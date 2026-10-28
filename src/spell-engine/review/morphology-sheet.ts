/**
 * Morphology review sheet: one row per (lemma, form). The ENGINE's prediction sits in its own column (`engineSays`) and is stored on the
 * item (`enginePredictions`) — it is never copied into a decision column, never pre-fills an answer, and is never overwritten by a judgment.
 *   lemmaDecision (first row of a lemma):  VALID | REJECT | FLAG      — is this lemma record right at all?
 *   judgment (per form):                   VALID | INVALID | FLAG      — blank = no opinion
 * A lemma without a lemmaDecision is skipped (reported), so a form is never judged on the unstated assumption that the lemma is fine.
 * The reviewer's identity and KIND come from the importer's arguments; the file cannot promote itself.
 */
import { REVIEW_SHEET_BANNER, appendDecision, type FormJudgment, type ReviewerKind, type SpellReviewItem } from "./review";

export const MORPH_COLUMNS = ["id", "lemma", "pos", "form", "engineSays", "lemmaDecision", "judgment", "note"] as const;

const esc = (s: string | undefined) => (s ?? "").replace(/[\t\r\n]+/g, " ");

export function exportMorphologySheet(items: readonly SpellReviewItem[]): string {
  const rows: string[] = [];
  for (const it of items) {
    const forms = it.enginePredictions ?? [];
    forms.forEach((f, k) => rows.push([it.id, it.token, it.lemma?.pos ?? "", f.form, f.verdict, "", "", k === 0 ? "" : ""].map(esc).join("\t")));
  }
  return [...REVIEW_SHEET_BANNER, "# lemmaDecision: VALID | REJECT | FLAG on the first row of each lemma.   judgment: VALID | INVALID | FLAG per form.", MORPH_COLUMNS.join("\t"), ...rows].join("\n") + "\n";
}

export type MorphImportResult = { applied: number; skipped: { line: number; reason: string }[]; items: SpellReviewItem[] };

export function importMorphologySheet(items: readonly SpellReviewItem[], tsv: string, reviewer: { id: string; kind: ReviewerKind }, at: string): MorphImportResult {
  const lines = tsv.split(/\r?\n/).filter((l) => l.length > 0 && !l.startsWith("#"));
  const header = (lines.shift() ?? "").split("\t");
  const col = (n: string) => header.indexOf(n);
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const skipped: MorphImportResult["skipped"] = [];
  const groups = new Map<string, { decision: string; forms: FormJudgment[]; notes: string[]; firstLine: number }>();
  lines.forEach((l, n) => {
    const f = l.split("\t");
    const cell = (name: string) => (f[col(name)] ?? "").trim();
    const id = cell("id");
    if (!byId.has(id)) return void skipped.push({ line: n + 2, reason: `unknown id ${id}` });
    const g = groups.get(id) ?? { decision: "", forms: [], notes: [], firstLine: n + 2 };
    groups.set(id, g);
    const ld = cell("lemmaDecision").toUpperCase();
    if (ld) g.decision = ld;
    const j = cell("judgment").toUpperCase();
    const form = cell("form");
    if (j && form) {
      if (j === "VALID") g.forms.push({ form, valid: true });
      else if (j === "INVALID") g.forms.push({ form, valid: false });
      else if (j === "FLAG") g.forms.push({ form, valid: false, uncertain: true });
      else skipped.push({ line: n + 2, reason: `invalid judgment "${j}" for ${form}` });
    }
    if (cell("note")) g.notes.push(`${form || "lemma"}: ${cell("note")}`);
  });
  let applied = 0;
  for (const [id, g] of groups) {
    if (!g.decision && g.forms.length === 0) continue; // nothing filled for this lemma
    if (!["VALID", "REJECT", "FLAG"].includes(g.decision)) {
      skipped.push({ line: g.firstLine, reason: g.decision ? `invalid lemmaDecision "${g.decision}"` : `forms judged without a lemmaDecision for ${id}` });
      continue;
    }
    const base = { reviewerId: reviewer.id, reviewerKind: reviewer.kind, at, note: g.notes.join(" | ") || undefined };
    try {
      const d =
        g.decision === "VALID"
          ? { ...base, verdict: "VALID" as const, action: "ACCEPT" as const, forms: g.forms.length ? g.forms : undefined }
          : g.decision === "REJECT"
            ? { ...base, verdict: "MISSPELLED" as const, action: "REJECT" as const }
            : { ...base, verdict: "UNKNOWN" as const, action: "FLAG" as const };
      byId.set(id, appendDecision(byId.get(id)!, d));
      applied += 1;
    } catch (e) {
      skipped.push({ line: g.firstLine, reason: (e as Error).message });
    }
  }
  return { applied, skipped, items: [...byId.values()] };
}
