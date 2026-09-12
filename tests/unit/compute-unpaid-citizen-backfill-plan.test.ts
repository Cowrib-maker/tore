import { describe, expect, it } from "vitest";

import { computeUnpaidCitizenBackfillPlan } from "@/application/use-cases/entitlements/compute-unpaid-citizen-backfill-plan";

describe("computeUnpaidCitizenBackfillPlan", () => {
  it("seeds a brand-new counter from the historical aggregate", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 1, currentCounter: 0 },
    ]);
    expect(plan.usersSeen).toBe(1);
    expect(plan.usersTouched).toBe(1);
    expect(plan.usersAlreadyCorrect).toBe(0);
    expect(plan.questionsBackfilled).toBe(1);
    expect(plan.mismatches).toHaveLength(0);
    expect(plan.actions).toEqual([
      { kind: "set", userId: "u1", from: 0, to: 1 },
    ]);
  });

  it("is idempotent: re-running when already correct is a no-op", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 1, currentCounter: 1 },
    ]);
    expect(plan.usersTouched).toBe(0);
    expect(plan.usersAlreadyCorrect).toBe(1);
    expect(plan.questionsBackfilled).toBe(0);
    expect(plan.actions).toEqual([
      { kind: "skip_already_correct", userId: "u1", value: 1 },
    ]);
  });

  it("never resets an existing user's usage to zero (a user with historical usage stays seeded, never dropped)", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 3, currentCounter: 0 },
    ]);
    expect(plan.actions).toEqual([
      { kind: "set", userId: "u1", from: 0, to: 3 },
    ]);
    // Confirms the target is the historical total, not a blind reset.
    expect(plan.actions[0]).toMatchObject({ to: 3 });
  });

  it("never grants additional free questions beyond the historical aggregate", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 1, currentCounter: 0 },
    ]);
    const setAction = plan.actions.find((a) => a.kind === "set");
    expect(setAction).toBeDefined();
    if (setAction?.kind === "set") {
      expect(setAction.to).toBe(1); // never higher than billedTotal
    }
  });

  it("flags (does not silently apply) a user whose live counter is already ahead of the aggregate", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 1, currentCounter: 2 },
    ]);
    expect(plan.usersTouched).toBe(0);
    expect(plan.usersAlreadyCorrect).toBe(0);
    expect(plan.mismatches).toEqual([
      { kind: "mismatch_would_decrease", userId: "u1", from: 2, to: 1 },
    ]);
    expect(plan.questionsBackfilled).toBe(0);
  });

  it("handles a mixed batch deterministically and sums questionsBackfilled correctly", () => {
    const plan = computeUnpaidCitizenBackfillPlan([
      { userId: "already-correct", billedTotal: 1, currentCounter: 1 },
      { userId: "needs-seed", billedTotal: 1, currentCounter: 0 },
      { userId: "never-asked", billedTotal: 0, currentCounter: 0 },
      { userId: "ahead-of-aggregate", billedTotal: 0, currentCounter: 1 },
    ]);
    expect(plan.usersSeen).toBe(4);
    expect(plan.usersTouched).toBe(1); // only "needs-seed"
    expect(plan.usersAlreadyCorrect).toBe(2); // "already-correct" and "never-asked" (0 === 0)
    expect(plan.mismatches).toHaveLength(1); // "ahead-of-aggregate"
    expect(plan.questionsBackfilled).toBe(1);
  });

  it("running the computed plan's result back through itself a second time is a no-op (true idempotency)", () => {
    const first = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 2, currentCounter: 0 },
    ]);
    const applied = first.actions[0];
    expect(applied?.kind).toBe("set");
    const newCounter = applied && applied.kind === "set" ? applied.to : 0;

    const second = computeUnpaidCitizenBackfillPlan([
      { userId: "u1", billedTotal: 2, currentCounter: newCounter },
    ]);
    expect(second.usersTouched).toBe(0);
    expect(second.usersAlreadyCorrect).toBe(1);
  });
});
