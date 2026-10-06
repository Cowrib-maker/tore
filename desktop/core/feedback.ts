import type { DocumentStore } from "./store";

/**
 * «Алдаа мэдээлэх»: a LOCAL, consent-based feedback log. It stores only a
 * single word (never surrounding text), the engine's verdict and versions.
 * Nothing is uploaded; the user exports the file and sends it themselves.
 */
export type FeedbackKind = "MISSED_MISSPELLING" | "WRONG_SUGGESTION" | "VALID_WORD_FLAGGED" | "UNKNOWN_WORD";

export type FeedbackEntry = {
  kind: FeedbackKind;
  word: string;
  verdict: "MISSPELLED" | "UNKNOWN" | "VALID" | null;
  suggestion: string | null;
  reasonCode: string | null;
  engineVersion: string;
  dataPackVersion: string;
  at: string;
};

export type FeedbackDoc = { version: 1; entries: FeedbackEntry[] };

export const FEEDBACK_KIND_MN: Readonly<Record<FeedbackKind, string>> = {
  MISSED_MISSPELLING: "Алдаа илрээгүй",
  WRONG_SUGGESTION: "Буруу санал",
  VALID_WORD_FLAGGED: "Зөв үгийг алдаатай гэсэн",
  UNKNOWN_WORD: "Тодорхойгүй гэсэн зөв үг",
};

const MAX_ENTRIES = 500;
const WORD_RE = /^[\p{L}\p{M}'’-]{1,40}$/u;

export class FeedbackLog {
  constructor(private readonly store: DocumentStore<FeedbackDoc>) {}

  add(input: Omit<FeedbackEntry, "at"> & { at?: string }): FeedbackEntry {
    if (!(input.kind in FEEDBACK_KIND_MN)) throw new Error("INVALID_FEEDBACK_KIND");
    // One word only: refuse sentences/paragraphs so no document text can be exported by accident.
    if (!WORD_RE.test(input.word)) throw new Error("INVALID_FEEDBACK_WORD");
    if (input.suggestion !== null && !WORD_RE.test(input.suggestion)) throw new Error("INVALID_FEEDBACK_SUGGESTION");
    const entry: FeedbackEntry = { ...input, at: input.at ?? new Date().toISOString() };
    const doc = this.store.read() ?? { version: 1 as const, entries: [] };
    doc.entries = [...doc.entries, entry].slice(-MAX_ENTRIES);
    this.store.write(doc);
    return entry;
  }

  count(): number {
    return this.store.read()?.entries.length ?? 0;
  }

  /** Tab-separated, one entry per line; the header documents every column. */
  exportTsv(): string {
    const rows = this.store.read()?.entries ?? [];
    const head = ["at", "kind", "word", "verdict", "suggestion", "reasonCode", "engineVersion", "dataPackVersion"].join("\t");
    return [head, ...rows.map((e) => [e.at, e.kind, e.word, e.verdict ?? "", e.suggestion ?? "", e.reasonCode ?? "", e.engineVersion, e.dataPackVersion].join("\t"))].join("\n") + "\n";
  }

  clear(): void {
    this.store.clear();
  }
}
