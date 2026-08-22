import type {
  BillingRepositories,
  BillingUnitOfWork,
} from "@/domain/ports/billing-unit-of-work";

export class InMemoryBillingUnitOfWork implements BillingUnitOfWork {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly repos: BillingRepositories) {}

  async runInTransaction<T>(
    work: (repos: BillingRepositories) => Promise<T>,
  ): Promise<T> {
    const run = this.chain.then(() => work(this.repos));
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
