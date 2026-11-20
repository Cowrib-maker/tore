import type { SpellFeedback, SpellFeedbackStatus, SpellFeedbackType } from "@/domain/spell/feedback";

export type CreateSpellFeedbackInput = Omit<SpellFeedback, "id" | "status" | "reviewedAt" | "reviewedBy" | "reviewReason">;

export type ReviewGroupInput = {
  groupKey: string;
  status: Exclude<SpellFeedbackStatus, "PENDING">;
  reviewedBy: string;
  reviewReason: string;
  at: Date;
};

export interface SpellFeedbackRepository {
  /** Always inserts with status PENDING: a submitter cannot choose a status. */
  create(input: CreateSpellFeedbackInput): Promise<SpellFeedback>;
  /** Newest first. */
  list(filter: { status?: SpellFeedbackStatus; feedbackType?: SpellFeedbackType; limit: number }): Promise<SpellFeedback[]>;
  listByGroupKey(groupKey: string): Promise<SpellFeedback[]>;
  listByUser(userId: string, limit: number): Promise<SpellFeedback[]>;
  countByUserSince(userId: string, since: Date): Promise<number>;
  /** Updates only rows still PENDING / NEEDS_NATIVE_REVIEW; returns how many changed. */
  reviewGroup(input: ReviewGroupInput): Promise<number>;
}
