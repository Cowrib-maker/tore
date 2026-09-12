import type { UnpaidCitizenLegalQuestionUsageRepository } from "@/domain/repositories/unpaid-citizen-legal-question-usage-repository";

export class InMemoryUnpaidCitizenLegalQuestionUsageRepository
  implements UnpaidCitizenLegalQuestionUsageRepository
{
  private readonly counts = new Map<string, number>();

  clear(): void {
    this.counts.clear();
  }

  async tryReserve(userId: string, limit: number): Promise<boolean> {
    const current = this.counts.get(userId) ?? 0;
    if (current >= limit) return false;
    this.counts.set(userId, current + 1);
    return true;
  }

  async release(userId: string): Promise<void> {
    const current = this.counts.get(userId) ?? 0;
    if (current > 0) this.counts.set(userId, current - 1);
  }

  async getUsedCount(userId: string): Promise<number> {
    return this.counts.get(userId) ?? 0;
  }
}
