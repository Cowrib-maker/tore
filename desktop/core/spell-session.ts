import type { SpellIssue } from "../../src/spell-engine/core/types";
import type { SpellEngineV1 } from "../../src/spell-engine/core/engine";
import { BoundaryModule } from "../../src/spell-engine/diagnostics/boundary";
import { CapitalizationModule } from "../../src/spell-engine/diagnostics/capitalization";
import { DiagnosticPipeline } from "../../src/spell-engine/diagnostics/pipeline";
import { normalizeToken } from "../../src/spell-engine/tokenizer/normalize";
import type { DocumentStore } from "./store";

export type DictionaryDoc = { version: 1; words: string[] };

export type CheckResult =
  | { locked: true }
  | { locked: false; issues: DesktopIssue[]; stats: { words: number; misspelled: number; unknown: number }; engineVersion: string; dataPackVersion: string };

export type DesktopIssue = Omit<Pick<SpellIssue, "token" | "normalizedToken" | "reasonCode" | "range" | "message" | "severity">, never> & {
  /** MISSPELLED / UNKNOWN from the spell engine; ADVISORY from the boundary and capitalization modules (never auto-applied). */
  verdict: "MISSPELLED" | "UNKNOWN" | "ADVISORY";
  suggestions: string[];
  /** CONFIDENT: one clearly best fix. AMBIGUOUS: the word is wrong but several fixes are equally plausible (no best is claimed). */
  suggestionStatus: "CONFIDENT" | "AMBIGUOUS" | "NONE";
  /** Stable public reason (INVALID_SUFFIX, GLUED_WORDS, SENTENCE_START_LOWERCASE …) for display and measurement. */
  publicReason?: string;
};

export class StaleIssueError extends Error {
  constructor() {
    super("STALE_ISSUE");
    this.name = "StaleIssueError";
  }
}

/**
 * The editing-side logic of the desktop app, free of UI: licence gate,
 * personal dictionary (persistent), ignore once / ignore all (per session),
 * and safe replacement. The engine is local and offline; no text leaves the
 * computer.
 */
export class DesktopSpellSession {
  private readonly ignoreAllKeys = new Set<string>();
  private readonly ignoreOnceKeys = new Set<string>();
  /** Incremental checking: results per paragraph text. Only paragraphs that changed are re-analysed while typing. */
  private readonly paragraphCache = new Map<string, { issues: DesktopIssue[]; words: number; misspelled: number; unknown: number }>();
  private readonly pipeline: DiagnosticPipeline;

  constructor(
    private readonly engine: SpellEngineV1,
    private readonly dictionary: DocumentStore<DictionaryDoc>,
    private readonly gate: { isEntitled(): Promise<boolean> },
  ) {
    for (const w of this.dictionary.read()?.words ?? []) this.engine.userDictionary.add(w);
    this.pipeline = new DiagnosticPipeline(engine, [new BoundaryModule(), new CapitalizationModule()]);
  }

  async check(text: string, opts: { reportUnknown?: boolean; advisory?: boolean } = {}): Promise<CheckResult> {
    if (!(await this.gate.isEntitled())) return { locked: true };
    const issues: DesktopIssue[] = [];
    let words = 0;
    let misspelled = 0;
    let unknown = 0;
    let offset = 0;
    // Paragraphs are independent for the engine (a line break starts a sentence), so a keystroke re-analyses one paragraph.
    for (const para of text.split("\n")) {
      const key = `${opts.reportUnknown ? 1 : 0}${opts.advisory ? 1 : 0}|${para}`;
      let r = this.paragraphCache.get(key);
      if (!r) {
        r = this.analyzeParagraph(para, opts);
        if (this.paragraphCache.size > 4000) this.paragraphCache.clear();
        this.paragraphCache.set(key, r);
      }
      words += r.words;
      misspelled += r.misspelled;
      unknown += r.unknown;
      for (const i of r.issues) issues.push({ ...i, range: { start: i.range.start + offset, end: i.range.end + offset } });
      offset += para.length + 1;
    }
    const visible = issues.filter((i) => !this.ignoreAllKeys.has(i.normalizedToken) && !this.ignoreOnceKeys.has(this.onceKey(i)));
    return { locked: false, issues: visible, stats: { words, misspelled, unknown }, engineVersion: this.engine.engineVersion, dataPackVersion: this.engine.dataPackVersion };
  }

  private analyzeParagraph(para: string, opts: { reportUnknown?: boolean; advisory?: boolean }) {
    const diags = this.pipeline.diagnose(para, { reportUnknown: opts.reportUnknown ?? false, errorsOnly: !opts.advisory });
    const stats = this.engine.analyze(para).stats;
    const issues = diags.map<DesktopIssue>((d) => ({
      token: d.original,
      normalizedToken: normalizeToken(d.original),
      verdict: d.verdict,
      reasonCode: (d.internalReason ?? "NOT_IN_LEXICON") as DesktopIssue["reasonCode"],
      publicReason: d.reason,
      range: d.range,
      message: d.message,
      severity: d.severity,
      suggestions: d.suggestions.map((s) => s.text),
      suggestionStatus: d.suggestionStatus,
    }));
    return { issues, words: stats.wordCount, misspelled: stats.misspelledCount, unknown: stats.unknownCount };
  }

  private onceKey(i: Pick<DesktopIssue, "range" | "normalizedToken">): string {
    return `${i.range.start}:${i.normalizedToken}`;
  }

  ignoreOnce(issue: Pick<DesktopIssue, "range" | "normalizedToken">): void {
    this.ignoreOnceKeys.add(this.onceKey(issue));
  }

  ignoreAll(issue: Pick<DesktopIssue, "normalizedToken">): void {
    this.ignoreAllKeys.add(issue.normalizedToken);
  }

  addToDictionary(word: string): void {
    const w = word.trim();
    if (!w || !/^[\p{L}\p{M}'’-]+$/u.test(w)) throw new Error("INVALID_DICTIONARY_WORD");
    this.engine.userDictionary.add(w);
    this.paragraphCache.clear(); // a new word changes verdicts everywhere
    this.persist();
  }

  removeFromDictionary(word: string): boolean {
    const removed = this.engine.userDictionary.remove(word);
    if (removed) {
      this.paragraphCache.clear();
      this.persist();
    }
    return removed;
  }

  dictionaryWords(): string[] {
    return this.engine.userDictionary.toArray();
  }

  /** Case-insensitive substring search over the personal dictionary. */
  searchDictionary(query: string): string[] {
    const q = query.trim().toLowerCase();
    return this.dictionaryWords().filter((w) => w.toLowerCase().includes(q));
  }

  private persist(): void {
    this.dictionary.write({ version: 1, words: this.engine.userDictionary.toArray() });
  }

  /**
   * Replace one issue's text. Refuses when the document changed under the
   * issue (stale range) instead of corrupting text. Returns the new text and
   * the length delta so callers can shift later ranges.
   */
  /** Replace every listed occurrence with one confident repair, or none at all (stale/ambiguous refuses the whole batch). */
  applyReplacementAll(text: string, issues: readonly Pick<DesktopIssue, "token" | "range" | "suggestionStatus" | "verdict">[], replacement: string): { text: string; count: number } {
    const r = replaceAllSafe(text, issues, replacement);
    if (!r) throw new StaleIssueError();
    this.ignoreOnceKeys.clear();
    return r;
  }

  applyReplacement(text: string, issue: Pick<DesktopIssue, "token" | "range">, replacement: string): { text: string; delta: number } {
    if (text.slice(issue.range.start, issue.range.end) !== issue.token) throw new StaleIssueError();
    // Edits invalidate position-keyed "ignore once" marks.
    this.ignoreOnceKeys.clear();
    return {
      text: text.slice(0, issue.range.start) + replacement + text.slice(issue.range.end),
      delta: replacement.length - (issue.range.end - issue.range.start),
    };
  }
}

/** Replace-all (shared by the session and tests). Returns null when any occurrence is stale — nothing is changed then. */
export function replaceAllSafe(text: string, issues: readonly Pick<DesktopIssue, "token" | "range" | "suggestionStatus" | "verdict">[], replacement: string): { text: string; count: number } | null {
  if (issues.length === 0) return null;
  if (issues.some((i) => i.verdict !== "MISSPELLED" || i.suggestionStatus !== "CONFIDENT")) return null; // only unambiguous fixes may be applied in bulk
  const sorted = [...issues].sort((a, b) => b.range.start - a.range.start);
  let out = text;
  for (const i of sorted) {
    if (out.slice(i.range.start, i.range.end) !== i.token) return null;
    out = out.slice(0, i.range.start) + replacement + out.slice(i.range.end);
  }
  return { text: out, count: sorted.length };
}
