import type { CreateSpellFeedbackInput, ReviewGroupInput, SpellFeedbackRepository } from "@/domain/repositories/spell-feedback-repository";
import { REVIEWABLE_STATUSES, type SpellFeedback, type SpellFeedbackStatus, type SpellFeedbackType } from "@/domain/spell/feedback";
import { getPrismaClient, type PrismaDbClient } from "@/infrastructure/database/prisma-client";

type Row = Omit<SpellFeedback, "feedbackType" | "status"> & { feedbackType: string; status: string };
const map = (r: Row): SpellFeedback => ({ ...r, feedbackType: r.feedbackType as SpellFeedbackType, status: r.status as SpellFeedbackStatus });

export class PrismaSpellFeedbackRepository implements SpellFeedbackRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async create(input: CreateSpellFeedbackInput): Promise<SpellFeedback> {
    // Status is never taken from the caller: PENDING is the column default and is set explicitly here.
    const row = await this.db.spellFeedback.create({ data: { ...input, status: "PENDING" } });
    return map(row as unknown as Row);
  }
  async list(f: { status?: SpellFeedbackStatus; feedbackType?: SpellFeedbackType; limit: number }): Promise<SpellFeedback[]> {
    const rows = await this.db.spellFeedback.findMany({ where: { status: f.status, feedbackType: f.feedbackType }, orderBy: { createdAt: "desc" }, take: f.limit });
    return rows.map((r) => map(r as unknown as Row));
  }
  async listByGroupKey(groupKey: string): Promise<SpellFeedback[]> {
    const rows = await this.db.spellFeedback.findMany({ where: { groupKey }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => map(r as unknown as Row));
  }
  async listByUser(userId: string, limit: number): Promise<SpellFeedback[]> {
    const rows = await this.db.spellFeedback.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => map(r as unknown as Row));
  }
  countByUserSince(userId: string, since: Date): Promise<number> {
    return this.db.spellFeedback.count({ where: { userId, createdAt: { gte: since } } });
  }
  async reviewGroup(i: ReviewGroupInput): Promise<number> {
    const r = await this.db.spellFeedback.updateMany({
      where: { groupKey: i.groupKey, status: { in: [...REVIEWABLE_STATUSES] as SpellFeedbackStatus[] } },
      data: { status: i.status, reviewedAt: i.at, reviewedBy: i.reviewedBy, reviewReason: i.reviewReason },
    });
    return r.count;
  }
}
