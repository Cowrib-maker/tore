import type { SpellEngineV1 } from "../core/engine";
import { lex } from "../tokenizer/lexer";
import { normalizeToken } from "../tokenizer/normalize";
import { scoreCandidate } from "../ranking/scores";
import { diagnosticTypeOf, publicReason } from "./reasons";
import type { DiagnoseOptions, DiagnosticModule, LanguageDiagnostic } from "./types";

/**
 * The language stack as a pipeline:
 *   tokenizer → protected-token detector → lexical + morphological analysis + orthographic rules + candidate/ranking
 *   (all inside SpellEngineV1.analyze) → pluggable modules (boundary, capitalization, context, and later grammar,
 *   punctuation, style) → one flat, offset-exact list of LanguageDiagnostic.
 * A module is added by registering it; nothing downstream changes.
 */
export class DiagnosticPipeline {
  constructor(
    private readonly engine: SpellEngineV1,
    private readonly modules: readonly DiagnosticModule[] = [],
  ) {}

  get moduleVersions(): Record<string, string> {
    return Object.fromEntries(this.modules.map((m) => [m.id, m.version]));
  }

  diagnose(text: string, options: DiagnoseOptions = {}): LanguageDiagnostic[] {
    const out: LanguageDiagnostic[] = [];
    const result = this.engine.analyze(text, { reportUnknown: options.reportUnknown ?? false });
    result.issues.forEach((i, n) => {
      const typed = normalizeToken(i.token);
      const misspelled = i.verdict === "MISSPELLED";
      out.push({
        id: `spell-${n}`,
        type: misspelled ? diagnosticTypeOf(i.reasonCode) : "UNKNOWN",
        verdict: misspelled ? "MISSPELLED" : "UNKNOWN",
        severity: i.severity,
        range: i.range,
        original: i.token,
        message: i.message,
        reason: publicReason(i.reasonCode, i.verdict),
        internalReason: i.reasonCode,
        suggestions: i.suggestions.map((s) => ({ ...s, scores: scoreCandidate(this.engine, typed, s.text) })),
        suggestionStatus: i.suggestionStatus,
        source: "spell",
      });
    });
    if (!options.errorsOnly) {
      const tokens = lex(text);
      for (const m of this.modules) out.push(...m.analyze({ text, tokens, engine: this.engine, options }));
    } else {
      const tokens = lex(text);
      for (const m of this.modules) out.push(...m.analyze({ text, tokens, engine: this.engine, options }).filter((d) => d.verdict === "MISSPELLED"));
    }
    return out.sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end);
  }
}
