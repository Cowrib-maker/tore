import { normalizeToken } from "../tokenizer/normalize";
import type { DiagnosticModule, LanguageDiagnostic, ModuleContext } from "./types";

/**
 * Capitalization is a separate diagnostic class from spelling. Conservative by design: it reports
 *   • a sentence that starts in lower case after «.», «!», «?» (not after short abbreviations, initials or decimals);
 *   • a known proper name (place / person / institution) written entirely in lower case.
 * ALL-CAPS text, acronyms, mixed-case technical terms and anything inside a list/newline start are left alone.
 */
export class CapitalizationModule implements DiagnosticModule {
  readonly id = "capitalization";
  readonly version = "2026.10.1";

  analyze({ tokens, engine }: ModuleContext): LanguageDiagnostic[] {
    const out: LanguageDiagnostic[] = [];
    let n = 0;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    tokens.forEach((t, i) => {
      if (t.kind !== "WORD" || t.caseShape !== "LOWER" || t.text.length < 2) return;
      // 1. sentence start
      let j = i - 1;
      while (j >= 0 && tokens[j]!.kind === "SPACE" && !tokens[j]!.text.includes("\n")) j -= 1;
      const p = j >= 0 ? tokens[j] : undefined;
      if (p && p.kind === "PUNCT" && /^[.!?]$/u.test(p.text) && tokens[j + 1]?.kind === "SPACE") {
        // what precedes the full stop? a short word/initial before «.» is an abbreviation (т.д., г.м, Б.), not a sentence end
        let q = j - 1;
        while (q >= 0 && tokens[q]!.kind === "SPACE") q -= 1;
        const before = q >= 0 ? tokens[q] : undefined;
        const abbreviationLike = !before || before.kind === "INITIAL" || before.kind === "NUMBER" || (before.kind === "WORD" && before.text.length <= 2) || (before.kind === "ACRONYM") || before.kind === "SUFFIX";
        const key = normalizeToken(t.text);
        const isTermLike = engine.lexicon.lookup(key).some((e) => e.layer === "ABBREVIATION");
        if (!abbreviationLike && !isTermLike) {
          out.push({
            id: `cap-${n++}`,
            type: "CAPITALIZATION",
            verdict: "ADVISORY",
            severity: "INFO",
            range: t.range,
            original: t.text,
            message: "Өгүүлбэр том үсгээр эхэлнэ.",
            reason: "SENTENCE_START_LOWERCASE",
            suggestions: [{ text: cap(t.text), confidence: 0.8, reason: "TYPO_PAIR", evidence: ["after-sentence-end"], autoApplySafe: false }],
            suggestionStatus: "CONFIDENT",
            source: this.id,
          });
          return;
        }
      }
      // 2. a known proper name written in lower case (only if the lower-case form is NOT also an ordinary word)
      const key = normalizeToken(t.text);
      const entries = engine.lexicon.lookup(key);
      if (entries.length > 0 && entries.every((e) => e.layer === "PROPER_NOUN") && /^\p{Lu}/u.test(entries[0]!.display) && key.length >= 4) {
        out.push({
          id: `cap-${n++}`,
          type: "CAPITALIZATION",
          verdict: "ADVISORY",
          severity: "INFO",
          range: t.range,
          original: t.text,
          message: "Нэрийг том үсгээр бичнэ.",
          reason: "PROPER_NOUN_LOWERCASE",
          suggestions: [{ text: entries[0]!.display, confidence: 0.75, reason: "TYPO_PAIR", evidence: ["known-proper-noun"], autoApplySafe: false }],
          suggestionStatus: "CONFIDENT",
          source: this.id,
        });
      }
    });
    return out;
  }
}
