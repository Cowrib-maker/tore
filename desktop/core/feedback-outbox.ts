import { randomUUID } from "node:crypto";

import { FeedbackValidationError, normalizeFeedback, type ContributionStats, type FeedbackInput } from "../../src/domain/spell/feedback";
import type { DocumentStore } from "./store";

/**
 * «Санал илгээх»: reports are written to a small LOCAL outbox first and then sent, signed by this installation, to the licence server. Each
 * entry holds one word, the engine's suggestion/reason/versions, the user's suggested form and an optional note of at most 200 characters —
 * never surrounding text and never a document. If the network is down the entry waits; a definitive refusal of the content drops it.
 * Reports can never set their own status: the server stores everything as PENDING and only an admin reviews it.
 */
export type OutboxEntry = { id: string; feedback: FeedbackInput; at: string; attempts: number };
export type OutboxDoc = { version: 1; entries: OutboxEntry[]; stats?: ContributionStats };

export interface FeedbackSender {
  postFeedback(f: FeedbackInput): Promise<{ id: string; status: string; stats: ContributionStats }>;
}

/** Errors that say nothing about the report itself: keep it and try again later. */
const KEEP_CODES: ReadonlySet<string> = new Set(["NETWORK", "TOO_MANY_ATTEMPTS", "REQUEST_REPLAYED", "INTERNAL", "SPELL_NOT_CONFIGURED", "SPELL_DISABLED", "ACTIVATION_NOT_ACTIVE", "LICENSE_EXPIRED", "INSTALLATION_UNKNOWN", "NO_ACTIVATION", "REQUEST_TIMESTAMP_INVALID"]);
export const OUTBOX_MAX = 200;

export class FeedbackOutbox {
  constructor(private readonly store: DocumentStore<OutboxDoc>, private readonly sender: FeedbackSender) {}

  private read(): OutboxDoc {
    return this.store.read() ?? { version: 1, entries: [] };
  }

  /** Validates (throws FeedbackValidationError) and queues. */
  enqueue(input: FeedbackInput, now: Date = new Date()): OutboxEntry {
    const clean = normalizeFeedback(input); // rejects sentences / bad data BEFORE anything is stored
    const feedback: FeedbackInput = { ...clean, token: clean.token || undefined };
    const entry: OutboxEntry = { id: randomUUID(), feedback, at: now.toISOString(), attempts: 0 };
    const doc = this.read();
    doc.entries = [...doc.entries, entry].slice(-OUTBOX_MAX);
    this.store.write(doc);
    return entry;
  }

  pending(): number {
    return this.read().entries.length;
  }

  stats(): ContributionStats | null {
    return this.read().stats ?? null;
  }

  /** Send oldest first; stop at the first transient failure. */
  async flush(): Promise<{ sent: number; pending: number; dropped: number; stats: ContributionStats | null }> {
    let sent = 0;
    let dropped = 0;
    for (;;) {
      const doc = this.read();
      const next = doc.entries[0];
      if (!next) break;
      try {
        const r = await this.sender.postFeedback(next.feedback);
        const cur = this.read();
        this.store.write({ ...cur, entries: cur.entries.filter((e) => e.id !== next.id), stats: r.stats });
        sent += 1;
      } catch (e) {
        const code = (e as { code?: string }).code ?? "INTERNAL";
        const cur = this.read();
        if (KEEP_CODES.has(code)) {
          this.store.write({ ...cur, entries: cur.entries.map((x) => (x.id === next.id ? { ...x, attempts: x.attempts + 1 } : x)) });
          break;
        }
        // The server definitively refused this content (e.g. validation): retrying cannot help.
        this.store.write({ ...cur, entries: cur.entries.filter((x) => x.id !== next.id) });
        dropped += 1;
      }
    }
    return { sent, pending: this.pending(), dropped, stats: this.stats() };
  }
}

export { FeedbackValidationError };
