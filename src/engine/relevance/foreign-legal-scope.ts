/**
 * Detects when a lawyer is asking about non-Mongolian law, comparative
 * law, or foreign professional practice. Used to open a professional
 * answer path that is not limited to the MN official corpus.
 *
 * Does not fetch foreign sources. Pinpoint citations from this path
 * remain unverified professional knowledge.
 */
export type ForeignLegalScope = {
  labels: string[];
  comparativeWithMn: boolean;
  includesPractice: boolean;
};

const JURISDICTION_CUES: readonly { label: string; pattern: RegExp }[] = [
  { label: "US", pattern: /(?:ан[уү]|америк|usa|\bus\b|u\.s\.a?|united states)/i },
  { label: "California", pattern: /калифорни|california/i },
  { label: "New York", pattern: /нью[-\s]?йорк|new york/i },
  { label: "Delaware", pattern: /delaware/i },
  { label: "UK", pattern: /их британи|англи|united kingdom|\buk\b|england|britain/i },
  { label: "EU", pattern: /европын холбоо|\beu\b|european union/i },
  { label: "Germany", pattern: /герман|germany|german law/i },
  { label: "France", pattern: /франц|france|french law/i },
  { label: "China", pattern: /хятад|china|\bprc\b|chinese law/i },
  { label: "Korea", pattern: /солонгос|korea|korean law/i },
  { label: "Japan", pattern: /япон|japan|japanese law/i },
  { label: "Singapore", pattern: /сингапур|singapore/i },
  { label: "Hong Kong", pattern: /хонконг|hong kong/i },
  { label: "Australia", pattern: /австрали|australia/i },
  { label: "Canada", pattern: /канад|canada|canadian law/i },
  { label: "Switzerland", pattern: /швейцарь|switzerland|swiss law/i },
  { label: "Russia", pattern: /орос(?:ын)?|russia|russian law/i },
  { label: "Kazakhstan", pattern: /казахстан|kazakhstan/i },
];

const INSTRUMENT_CUES: readonly { label: string; pattern: RegExp }[] = [
  { label: "GDPR", pattern: /\bgdpr\b/i },
  { label: "CISG", pattern: /\bcisg\b/i },
  { label: "UCC", pattern: /\bucc\b/i },
  { label: "UNCITRAL", pattern: /\buncitral\b/i },
  { label: "FCPA", pattern: /\bfcpa\b/i },
  { label: "SOX", pattern: /\b(?:sox|sarbanes[-\s]?oxley)\b/i },
  { label: "FATCA", pattern: /\bfatca\b/i },
  { label: "Brussels", pattern: /\bbrussels (?:i|ii|regulation)\b/i },
  { label: "Hague", pattern: /\bhague (?:convention|apostille)\b/i },
  { label: "Restatement", pattern: /\brestatement\b/i },
  { label: "USC", pattern: /\b(?:u\.s\.c\.|united states code)\b/i },
];

const EXPLICIT_FOREIGN =
  /гадаад(?:ын)?\s*хууль|бусад\s*орон(?:ы)?|олон\s*улсын\s*(?:хууль|эрх\s*зүй)|харьцуулсан\s*эрх\s*зүй|foreign\s*law|comparative\s*law|other\s*countr(?:y|ies)|cross[-\s]?border/i;

const SYSTEM_CUES =
  /\b(?:common law|civil law|stare decisis|solicitor|barrister|fiduciary(?: duty)?|law firm practice)\b/i;

const PRACTICE_CUES =
  /practice|жишиг|мэргэжлийн\s*жиш|solicitor|barrister|law firm|discovery|deposition|bar association|how (?:do|does) (?:a )?lawyers?|мэргэжлийн\s*практик/i;

const MN_CUES =
  /монгол|legalinfo|эрүүгийн\s*хууль|иргэний\s*хууль|\bmn\b|mongolia|шуух\.mn|parliament\.mn/i;

export function detectForeignLegalScope(
  message: string,
): ForeignLegalScope | null {
  const text = message.normalize("NFC").trim();
  if (!text) {
    return null;
  }

  const labels: string[] = [];
  for (const cue of JURISDICTION_CUES) {
    if (cue.pattern.test(text)) {
      labels.push(cue.label);
    }
  }
  for (const cue of INSTRUMENT_CUES) {
    if (cue.pattern.test(text)) {
      labels.push(cue.label);
    }
  }
  if (SYSTEM_CUES.test(text) && !labels.includes("comparative-system")) {
    labels.push("comparative-system");
  }
  if (EXPLICIT_FOREIGN.test(text) && labels.length === 0) {
    labels.push("foreign-law");
  }

  if (labels.length === 0) {
    return null;
  }

  return {
    labels,
    comparativeWithMn: MN_CUES.test(text),
    includesPractice: PRACTICE_CUES.test(text),
  };
}
