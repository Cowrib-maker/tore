import type { SpellEngineV1 } from "../core/engine";
import type { DiagnosticModule, LanguageDiagnostic, ModuleContext } from "../diagnostics/types";
import { normalizeToken } from "../tokenizer/normalize";
import type { ContextModel } from "./types";

/** Vowel pairs whose swap yields a different real word (о/ө, у/ү, а/э): ус–үс, тор–төр, уул–үүл, ар–эр. */
const SWAPS: Record<string, string> = { о: "ө", ө: "о", у: "ү", ү: "у", а: "э", э: "а" };

/**
 * Confusion sets derived FROM THE LEXICON (no hand-written list): two entries that differ by one swappable vowel are
 * a confusion pair. Only lemma-level, non-LOW entries take part, and words shorter than 3 letters are skipped.
 */
export function buildConfusionSets(engine: SpellEngineV1): Map<string, string[]> {
  const sets = new Map<string, string[]>();
  const ok = (k: string) => k.length >= 3 && /^[а-яёөү]+$/u.test(k) && engine.lexicon.lookup(k).some((e) => e.conf !== "LOW" && e.layer !== "PROPER_NOUN" && e.layer !== "ABBREVIATION");
  for (const k of engine.lexicon.keys()) {
    if (!ok(k)) continue;
    for (let i = 0; i < k.length; i += 1) {
      const sw = SWAPS[k[i]!];
      if (!sw) continue;
      const v = k.slice(0, i) + sw + k.slice(i + 1);
      if (v !== k && ok(v)) {
        const list = sets.get(k) ?? [];
        if (!list.includes(v)) list.push(v);
        sets.set(k, list);
      }
    }
  }
  return sets;
}

export type RealWordOptions = {
  /** Minimum log-score advantage of the partner over the written word. */
  minDelta?: number;
  /** Minimum count of observed n-grams that back the partner. */
  minSupport?: number;
};

/**
 * Real-word errors: the written word is VALID in isolation, but a confusable partner fits its context far better.
 * Reported as an ADVISORY with reason CONTEXTUAL_ANOMALY, status AMBIGUOUS, never auto-applied, and only when the
 * model has real evidence (support) — with no/weak context data the module says nothing.
 */
export class RealWordContextModule implements DiagnosticModule {
  readonly id = "context-real-word";
  readonly version = "2026.10.1";
  private readonly sets: Map<string, string[]>;
  private readonly minDelta: number;
  private readonly minSupport: number;

  constructor(
    engine: SpellEngineV1,
    private readonly model: ContextModel,
    options: RealWordOptions = {},
  ) {
    this.sets = buildConfusionSets(engine);
    this.minDelta = options.minDelta ?? 6;
    this.minSupport = options.minSupport ?? 5;
  }

  get confusionPairs(): number {
    return [...this.sets.values()].reduce((s, l) => s + l.length, 0) / 2;
  }

  analyze({ tokens, engine }: ModuleContext): LanguageDiagnostic[] {
    const out: LanguageDiagnostic[] = [];
    const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.kind === "WORD");
    const adj = (a: number, b: number) => b - a === 2 && tokens[a + 1]!.kind === "SPACE" && !tokens[a + 1]!.text.includes("\n");
    words.forEach((w, k) => {
      const key = normalizeToken(w.t.text);
      const partners = this.sets.get(key);
      if (!partners || w.t.caseShape === "UPPER" || !engine.isValid(key)) return;
      const prevW = k > 0 && adj(words[k - 1]!.i, w.i) ? normalizeToken(words[k - 1]!.t.text) : null;
      const nextW = k + 1 < words.length && adj(w.i, words[k + 1]!.i) ? normalizeToken(words[k + 1]!.t.text) : null;
      if (prevW === null && nextW === null) return;
      const own = this.model.logFit(prevW, key, nextW);
      let best: { p: string; delta: number } | null = null;
      for (const p of partners) {
        const sup = this.model.support(prevW, p, nextW);
        if (sup < this.minSupport) continue;
        const delta = this.model.logFit(prevW, p, nextW) - own;
        if (delta >= this.minDelta && (!best || delta > best.delta)) best = { p, delta };
      }
      if (!best) return;
      const text = w.t.caseShape === "TITLE" ? best.p.charAt(0).toUpperCase() + best.p.slice(1) : best.p;
      out.push({
        id: `ctx-${out.length}`,
        type: "SPELLING",
        verdict: "ADVISORY",
        severity: "INFO",
        range: w.t.range,
        original: w.t.text,
        message: "Үг зөв бичигдсэн ч өгүүлбэрийн утгад тохирохгүй байж магадгүй.",
        reason: "CONTEXTUAL_ANOMALY",
        suggestions: [
          {
            text,
            confidence: 0.6,
            reason: "TYPO_PAIR",
            evidence: [`context:${this.model.id}`, `delta=${best.delta.toFixed(1)}`, `support=${this.model.support(prevW, best.p, nextW)}`],
            autoApplySafe: false,
            scores: { lexical: 1, morphology: 0.8, frequency: null, errorModel: 0.8, domain: 1, context: Math.round((1 / (1 + Math.exp(-best.delta / 4))) * 1000) / 1000, combined: 0.6 },
          },
        ],
        suggestionStatus: "AMBIGUOUS",
        source: this.id,
      });
    });
    return out;
  }
}
