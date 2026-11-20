import { randomUUID } from "node:crypto";

import type { CreateSpellFeedbackInput, ReviewGroupInput, SpellFeedbackRepository } from "@/domain/repositories/spell-feedback-repository";
import { REVIEWABLE_STATUSES, type SpellFeedback, type SpellFeedbackStatus, type SpellFeedbackType } from "@/domain/spell/feedback";

export class InMemorySpellFeedbackRepository implements SpellFeedbackRepository {
  readonly rows: SpellFeedback[] = [];

  async create(input: CreateSpellFeedbackInput): Promise<SpellFeedback> {
    const row: SpellFeedback = { ...input, id: randomUUID(), status: "PENDING", reviewedAt: null, reviewedBy: null, reviewReason: null };
    this.rows.push(row);
    return { ...row };
  }
  async list(f: { status?: SpellFeedbackStatus; feedbackType?: SpellFeedbackType; limit: number }): Promise<SpellFeedback[]> {
    return this.rows
      .filter((r) => (!f.status || r.status === f.status) && (!f.feedbackType || r.feedbackType === f.feedbackType))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, f.limit)
      .map((r) => ({ ...r }));
  }
  async listByGroupKey(groupKey: string): Promise<SpellFeedback[]> {
    return this.rows.filter((r) => r.groupKey === groupKey).map((r) => ({ ...r }));
  }
  async listByUser(userId: string, limit: number): Promise<SpellFeedback[]> {
    return this.rows.filter((r) => r.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((r) => ({ ...r }));
  }
  async countByUserSince(userId: string, since: Date): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.createdAt >= since).length;
  }
  async reviewGroup(i: ReviewGroupInput): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.groupKey === i.groupKey && REVIEWABLE_STATUSES.includes(r.status)) {
        r.status = i.status;
        r.reviewedAt = i.at;
        r.reviewedBy = i.reviewedBy;
        r.reviewReason = i.reviewReason;
        n += 1;
      }
    }
    return n;
  }
}
