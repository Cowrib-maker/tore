/**
 * TORE Spell language-engine contract.
 *
 * This directory is DEPENDENCY-FREE on purpose: it imports nothing from the
 * rest of the app (no Prisma, Next, React, Node built-ins or `@/` aliases), so
 * the engine can be shipped inside the desktop client, compiled to WASM, or
 * moved to its own package without dragging licensing or web code along. The
 * boundary is enforced by ESLint (`no-restricted-imports`) and a unit test.
 *
 * Licensing, activation and the desktop shell depend only on `LanguageEngine`.
 * Improving or replacing the engine must never touch them.
 */

/** Offsets are UTF-16 code units into the exact input string; `end` is exclusive. */
export type TextSpan = { start: number; end: number };

export type IssueCategory =
  | "SPELLING"
  | "ORTHOGRAPHY"
  | "SCRIPT_CONVERSION"
  | "GRAMMAR"
  | "PUNCTUATION"
  | "STYLE";

export type Suggestion = {
  text: string;
  /** 1 = best. Strictly increasing within an issue. */
  rank: number;
};

export type LanguageIssue = {
  /** Stable within one result; not stable across engine versions. */
  id: string;
  category: IssueCategory;
  span: TextSpan;
  /** Must equal `text.slice(span.start, span.end)`. */
  original: string;
  /** Short explanation for the user (Mongolian). */
  message: string;
  /** Engine-defined rule identifiers, for measurement and support. */
  ruleIds: readonly string[];
  /** Best first. May be empty when the engine detects but cannot fix. */
  suggestions: readonly Suggestion[];
};

export type CheckRequest = {
  text: string;
  options?: {
    /** Offer Latin-typed Mongolian → Cyrillic conversions. */
    convertLatinToCyrillic?: boolean;
  };
};

export type EngineIdentity = {
  /** e.g. "orthography-rules" */
  id: string;
  /** Semantic version of the engine AND its data (dictionary) together. */
  version: string;
};

export type CheckResult = {
  engine: EngineIdentity;
  issues: readonly LanguageIssue[];
  stats: { characterCount: number; wordCount: number };
};

export type EngineInfo = EngineIdentity & {
  /** What this engine can detect. Anything absent is NOT checked. */
  capabilities: readonly IssueCategory[];
  /** Honest self-description, surfaced in support tooling. */
  maturity: "BASELINE_RULES" | "STATISTICAL" | "MORPHOLOGICAL" | "CONTEXTUAL";
};

export interface LanguageEngine {
  readonly info: EngineInfo;
  /** Async so a WASM or remote engine fits the same contract. Must not throw on any string input. */
  check(request: CheckRequest): Promise<CheckResult>;
}
