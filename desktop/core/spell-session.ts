import type { SpellIssue } from "../../src/spell-engine/core/types";
import type { SpellEngineV1 } from "../../src/spell-engine/core/engine";
import type { DocumentStore } from "./store";

export type DictionaryDoc = { version: 1; words: string[] };

export type CheckResult =
  | { locked: true }
  | { locked: false; issues: DesktopIssue[]; stats: { words: number; misspelled: number; unknown: number }; engineVersion: string; dataPackVersion: string };

export type DesktopIssue = Pick<SpellIssue, "token" | "normalizedToken" | "verdict" | "reasonCode" | "range" | "message" | "severity"> & {
  suggestions: string[];
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

  constructor(
    private readonly engine: SpellEngineV1,
    private readonly dictionary: DocumentStore<DictionaryDoc>,
    private readonly gate: { isEntitled(): Promise<boolean> },
  ) {
    for (const w of this.dictionary.read()?.words ?? []) this.engine.userDictionary.add(w);
  }

  async check(text: string, opts: { reportUnknown?: boolean } = {}): Promise<CheckResult> {
    if (!(await this.gate.isEntitled())) return { locked: true };
    const result = this.engine.analyze(text, { reportUnknown: opts.reportUnknown ?? false });
    const issues = result.issues
      .filter((i) => !this.ignoreAllKeys.has(i.normalizedToken) && !this.ignoreOnceKeys.has(this.onceKey(i)))
      .map<DesktopIssue>((i) => ({
        token: i.token,
        normalizedToken: i.normalizedToken,
        verdict: i.verdict,
        reasonCode: i.reasonCode,
        range: i.range,
        message: i.message,
        severity: i.severity,
        suggestions: i.suggestions.map((s) => s.text),
      }));
    return { locked: false, issues, stats: { words: result.stats.wordCount, misspelled: result.stats.misspelledCount, unknown: result.stats.unknownCount }, engineVersion: result.engineVersion, dataPackVersion: result.dataPackVersion };
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
    this.persist();
  }

  removeFromDictionary(word: string): boolean {
    const removed = this.engine.userDictionary.remove(word);
    if (removed) this.persist();
    return removed;
  }

  dictionaryWords(): string[] {
    return this.engine.userDictionary.toArray();
  }

  private persist(): void {
    this.dictionary.write({ version: 1, words: this.engine.userDictionary.toArray() });
  }

  /**
   * Replace one issue's text. Refuses when the document changed under the
   * issue (stale range) instead of corrupting text. Returns the new text and
   * the length delta so callers can shift later ranges.
   */
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
