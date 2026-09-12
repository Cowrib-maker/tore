import { describe, expect, it } from "vitest";

import {
  createLegalQuestionAccess,
  getLegalQuestionEntitlementSnapshot,
  type GuestSessionStore,
  type LegalQuestionReservation,
} from "@/application/legal-ai/legal-question-access";
import { GUEST_FREE_LEGAL_QUESTIONS, SOLO_PLAN, UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS } from "@/domain/constants/subscription-plans";
import {
  EntitlementFeature,
  SeatStatus,
  SubscriptionPlanCode,
  SubscriptionStatus,
  UserRole,
} from "@/domain/enums";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { InMemoryEntitlementUsageRepository } from "@/infrastructure/repositories/in-memory-entitlement-usage-repository";
import { InMemorySubscriptionRepository } from "@/infrastructure/repositories/in-memory-subscription-repository";
import { InMemoryUnpaidCitizenLegalQuestionUsageRepository } from "@/infrastructure/repositories/in-memory-unpaid-citizen-legal-question-usage-repository";

function futureDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

/** Shared no-op double for tests that never exercise the unpaid-citizen path. */
function noopUnpaidCitizenUsage() {
  return new InMemoryUnpaidCitizenLegalQuestionUsageRepository();
}

type GuestRow = { id: string; freeLegalQuestionsUsed: number; expiresAt: Date };

/**
 * Faithful in-memory GuestSessionStore double. `tryConsumeFreeLegalQuestion`
 * checks-and-increments in one synchronous block (no `await` between read
 * and write) — the same atomicity guarantee the real Prisma implementation
 * gets from a single `UPDATE ... WHERE ... ` statement's row-level lock.
 */
function createGuestSessionsDouble(rows: GuestRow[] = []): GuestSessionStore {
  const guests = new Map(rows.map((row) => [row.id, row]));
  return {
    async getById(id) {
      const row = guests.get(id);
      // A real DB read returns a point-in-time snapshot, not a live
      // reference — clone so a caller that holds onto this result (like
      // the naive reconstruction below) can't accidentally observe a
      // later mutation through it and appear race-free by accident.
      return row ? { ...row } : null;
    },
    async incrementFreeLegalQuestionsUsed(id) {
      const row = guests.get(id);
      if (row) row.freeLegalQuestionsUsed += 1;
    },
    async tryConsumeFreeLegalQuestion(id, limit, now) {
      const row = guests.get(id);
      if (!row || row.expiresAt.getTime() <= now.getTime()) return false;
      if (row.freeLegalQuestionsUsed >= limit) return false;
      row.freeLegalQuestionsUsed += 1;
      return true;
    },
    async releaseFreeLegalQuestion(id) {
      const row = guests.get(id);
      if (row && row.freeLegalQuestionsUsed > 0) row.freeLegalQuestionsUsed -= 1;
    },
  };
}

function macrotaskDelay(): Promise<void> {
  // A real DB round-trip has actual I/O latency, so two concurrent
  // requests' reads genuinely overlap before either write commits. A bare
  // microtask (plain `await` on an already-resolved value) does not
  // reliably reproduce that interleaving — V8 can fully drain one call's
  // entire microtask chain before the other call's first `await` even
  // resumes. A macrotask boundary (setTimeout) forces the same kind of
  // overlap a real network/DB call would have.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Reconstructs the *pre-fix* shape of guest quota enforcement: a separate
 * read-then-compare (`getById`) followed by a separate later write
 * (`incrementFreeLegalQuestionsUsed`), exactly as `assertCanStartNewLegalQuestion`
 * + `consumeNewLegalQuestion` used to work before this change. This is not
 * production code — it exists only so the concurrency test below has a
 * concrete "before" to contrast against the "after".
 */
async function naiveCheckThenConsume(
  store: GuestSessionStore,
  id: string,
  limit: number,
): Promise<void> {
  const session = await store.getById(id);
  await macrotaskDelay(); // simulates real round-trip latency between check and write
  if (!session || session.freeLegalQuestionsUsed >= limit) {
    throw new EntitlementError("no quota", "AUTHENTICATION_REQUIRED", 401);
  }
  await store.incrementFreeLegalQuestionsUsed(id);
}

/**
 * Reconstructs the *pre-fix* shape of the unpaid-citizen check: read a
 * (possibly stale) aggregate, compare, and only write much later on
 * success. Not production code — exists only to contrast against the
 * atomic fix below.
 */
async function naiveUnpaidCitizenCheck(
  countBilled: () => Promise<number>,
  limit: number,
): Promise<void> {
  const used = await countBilled();
  await macrotaskDelay();
  if (used >= limit) {
    throw new EntitlementError("billing required", "BILLING_REQUIRED", 402);
  }
}

describe("createLegalQuestionAccess", () => {
  it("allows a guest first legal question and reserves the free thread atomically in assert", async () => {
    const g1: GuestRow = { id: "g1", freeLegalQuestionsUsed: 0, expiresAt: futureDate() };
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble([g1]),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });

    const reservation = await access.assertCanStartNewLegalQuestion({
      kind: "guest",
      guestSessionId: "g1",
    });
    expect(reservation).toEqual({ kind: "guest", guestSessionId: "g1" });
    // The reservation already happened inside assert; consume is a no-op.
    expect(g1.freeLegalQuestionsUsed).toBe(1);
    await access.consumeNewLegalQuestion({ kind: "guest", guestSessionId: "g1" });
    expect(g1.freeLegalQuestionsUsed).toBe(1);
  });

  it("gates a guest new question after the free thread is used", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble([
        { id: "g1", freeLegalQuestionsUsed: 1, expiresAt: futureDate() },
      ]),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "guest",
        guestSessionId: "g1",
      }),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
  });

  it("releases a guest reservation on failure, so a failed turn does not permanently consume quota", async () => {
    const g1: GuestRow = { id: "g1", freeLegalQuestionsUsed: 0, expiresAt: futureDate() };
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble([g1]),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });
    const subject = { kind: "guest" as const, guestSessionId: "g1" };

    const reservation = await access.assertCanStartNewLegalQuestion(subject);
    expect(g1.freeLegalQuestionsUsed).toBe(1);

    // Simulates legal-ai.service.ts's catch block after e.g. an AI failure.
    await access.releaseNewLegalQuestion(reservation);
    expect(g1.freeLegalQuestionsUsed).toBe(0);

    // The guest's free question is usable again — failure was not billed.
    await expect(
      access.assertCanStartNewLegalQuestion(subject),
    ).resolves.toEqual({ kind: "guest", guestSessionId: "g1" });
    expect(g1.freeLegalQuestionsUsed).toBe(1);
  });

  it("REGRESSION (P0-3): concurrent guest requests cannot both consume the same single free question", async () => {
    // "Before" — the pre-fix shape (separate check, then separate later
    // write) double-consumes under concurrency: both calls read
    // freeLegalQuestionsUsed = 0 before either has written, so both pass
    // the check and both increment.
    const naiveRow: GuestRow = { id: "g1", freeLegalQuestionsUsed: 0, expiresAt: futureDate() };
    const naiveStore = createGuestSessionsDouble([naiveRow]);
    await Promise.allSettled([
      naiveCheckThenConsume(naiveStore, "g1", GUEST_FREE_LEGAL_QUESTIONS),
      naiveCheckThenConsume(naiveStore, "g1", GUEST_FREE_LEGAL_QUESTIONS),
    ]);
    expect(naiveRow.freeLegalQuestionsUsed).toBe(2); // the bug this fix closes

    // "After" — the actual production code path. Same concurrent shape,
    // same starting state, but authorization is now the atomic operation.
    const fixedRow: GuestRow = { id: "g1", freeLegalQuestionsUsed: 0, expiresAt: futureDate() };
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble([fixedRow]),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });
    const subject = { kind: "guest" as const, guestSessionId: "g1" };
    const results = await Promise.allSettled([
      access.assertCanStartNewLegalQuestion(subject),
      access.assertCanStartNewLegalQuestion(subject),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(fixedRow.freeLegalQuestionsUsed).toBe(1); // exactly one consumed, not two
  });

  describe("unpaid citizen (lifetime counter)", () => {
    it("allows the first free question and reserves atomically in assert", async () => {
      const unpaidCitizenUsage = noopUnpaidCitizenUsage();
      const access = createLegalQuestionAccess({
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage,
      });
      const subject = { kind: "user" as const, userId: "client-1", role: UserRole.CLIENT };

      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      expect(reservation).toEqual({ kind: "unpaid_citizen", userId: "client-1" });
      expect(await unpaidCitizenUsage.getUsedCount("client-1")).toBe(1);
    });

    it("gates a new question once the lifetime allowance is used, WITHOUT reading countBilledQuestionsForUser", async () => {
      const unpaidCitizenUsage = noopUnpaidCitizenUsage();
      await unpaidCitizenUsage.tryReserve("client-1", UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS);
      let countBilledCalls = 0;
      const access = createLegalQuestionAccess({
        guestSessions: createGuestSessionsDouble(),
        // If the enforcement gate ever reads this again, this test fails
        // loudly instead of silently — it must not be the authorization
        // source of truth any more.
        conversations: {
          countBilledQuestionsForUser: async () => {
            countBilledCalls += 1;
            return 0;
          },
        },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage,
      });

      await expect(
        access.assertCanStartNewLegalQuestion({
          kind: "user",
          userId: "client-1",
          role: UserRole.CLIENT,
        }),
      ).rejects.toMatchObject({ code: "BILLING_REQUIRED", statusCode: 402 });
      expect(countBilledCalls).toBe(0);
    });

    it("releases on failure, so a failed turn does not permanently consume the lifetime allowance", async () => {
      const unpaidCitizenUsage = noopUnpaidCitizenUsage();
      const access = createLegalQuestionAccess({
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage,
      });
      const subject = { kind: "user" as const, userId: "client-1", role: UserRole.CLIENT };

      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      expect(await unpaidCitizenUsage.getUsedCount("client-1")).toBe(1);

      await access.releaseNewLegalQuestion(reservation);
      expect(await unpaidCitizenUsage.getUsedCount("client-1")).toBe(0);

      await expect(access.assertCanStartNewLegalQuestion(subject)).resolves.toEqual({
        kind: "unpaid_citizen",
        userId: "client-1",
      });
      expect(await unpaidCitizenUsage.getUsedCount("client-1")).toBe(1);
    });

    it("REGRESSION (unpaid-citizen quota race): concurrent requests cannot both consume the same lifetime allowance", async () => {
      // "Before" — the pre-fix shape (countBilledQuestionsForUser read,
      // then a much-later write after AI success) lets both concurrent
      // requests pass the check before either has "billed" anything.
      let naiveUsed = 0;
      const countBilled = async () => naiveUsed;
      await Promise.allSettled([
        naiveUnpaidCitizenCheck(countBilled, UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS),
        naiveUnpaidCitizenCheck(countBilled, UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS),
      ]);
      // Both "passed" the naive check (neither threw) — simulating both
      // going on to a real AI call and eventually both billing.
      naiveUsed += 2;
      expect(naiveUsed).toBeGreaterThan(UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS); // the bug this fix closes

      // "After" — the actual production code path.
      const unpaidCitizenUsage = noopUnpaidCitizenUsage();
      const access = createLegalQuestionAccess({
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage,
      });
      const subject = { kind: "user" as const, userId: "client-1", role: UserRole.CLIENT };
      const results = await Promise.allSettled([
        access.assertCanStartNewLegalQuestion(subject),
        access.assertCanStartNewLegalQuestion(subject),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: "BILLING_REQUIRED",
      });
      expect(await unpaidCitizenUsage.getUsedCount("client-1")).toBe(1);
    });

    it("entitlement snapshot matches the counter, not the (no-longer-authoritative) conversation aggregate", async () => {
      const unpaidCitizenUsage = noopUnpaidCitizenUsage();
      await unpaidCitizenUsage.tryReserve("client-1", UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS);
      const snapshot = await getLegalQuestionEntitlementSnapshot(
        { kind: "user", userId: "client-1", role: UserRole.CLIENT },
        {
          guestSessions: createGuestSessionsDouble(),
          // Deliberately wrong/stale, to prove the snapshot no longer
          // reads this for unpaid citizens.
          conversations: { countBilledQuestionsForUser: async () => 999 },
          subscriptionRepository: new InMemorySubscriptionRepository(),
          entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
          unpaidCitizenUsage,
        },
      );
      expect(snapshot.audience).toBe("unpaid_citizen");
      expect(snapshot.remainingLegalQuestions).toBe(
        Math.max(0, UNPAID_CITIZEN_FREE_LEGAL_QUESTIONS - 1),
      );
    });
  });

  it("allows a paid citizen new question within catalog quota", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const usage = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "client-1",
      planCode: SubscriptionPlanCode.CITIZEN_BASIC,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureDate(),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "client-1",
      status: SeatStatus.ACTIVE,
    });
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble(),
      conversations: { countBilledQuestionsForUser: async () => 8 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usage,
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });

    const reservation = await access.assertCanStartNewLegalQuestion({
      kind: "user",
      userId: "client-1",
      role: UserRole.CLIENT,
    });
    expect(reservation.kind).toBe("entitlement_usage");
    await access.consumeNewLegalQuestion({
      kind: "user",
      userId: "client-1",
      role: UserRole.CLIENT,
    });
    const row = await usage.getOrCreate({
      userId: "client-1",
      subscriptionId: created.id,
      periodStart: new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      ),
    });
    expect(row.legalAiQueryCount).toBe(1);
    // The reservation identity IS that exact row.
    expect(reservation).toMatchObject({ kind: "entitlement_usage", usageId: row.id });
    await expect(
      access.hasPaidLegalAiAccess({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).resolves.toBe(true);
  });

  describe("paid reservation identity (fixes the wrong-row release bug)", () => {
    async function setupLawyer(now: () => Date) {
      const subscriptions = new InMemorySubscriptionRepository();
      const usage = new InMemoryEntitlementUsageRepository();
      const created = await subscriptions.create({
        ownerUserId: "lawyer-1",
        planCode: SubscriptionPlanCode.SOLO,
        status: SubscriptionStatus.ACTIVE,
        seatLimit: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: futureDate(),
      });
      await subscriptions.createSeat({
        subscriptionId: created.id,
        userId: "lawyer-1",
        status: SeatStatus.ACTIVE,
      });
      const access = createLegalQuestionAccess({
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: subscriptions,
        entitlementUsageRepository: usage,
        unpaidCitizenUsage: noopUnpaidCitizenUsage(),
        now,
      });
      return { subscriptions, usage, created, access };
    }

    it("release targets the exact reserved row, not a freshly re-derived month/subscription", async () => {
      const { usage, created, access } = await setupLawyer(() => new Date());
      const subject = { kind: "user" as const, userId: "lawyer-1", role: UserRole.LAWYER };
      const periodStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );

      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      let row = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
      expect(row.legalAiQueryCount).toBe(1);
      expect(reservation).toMatchObject({ kind: "entitlement_usage", usageId: row.id });

      await access.releaseNewLegalQuestion(reservation);
      row = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
      expect(row.legalAiQueryCount).toBe(0);
    });

    it("REGRESSION: a UTC month boundary between reserve and release does not leak the reservation or touch the new month's row", async () => {
      const endOfMonth = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 900)); // 2026-09-30 23:59:59.9 UTC
      const startOfNextMonth = new Date(Date.UTC(2026, 9, 1, 0, 0, 0, 100)); // 2026-10-01 00:00:00.1 UTC
      let clock = endOfMonth;
      const { usage, created, access } = await setupLawyer(() => clock);
      const subject = { kind: "user" as const, userId: "lawyer-1", role: UserRole.LAWYER };

      // Reserve while it's still September.
      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      const septemberPeriodStart = new Date(Date.UTC(2026, 8, 1));
      let septemberRow = await usage.getOrCreate({
        userId: "lawyer-1",
        subscriptionId: created.id,
        periodStart: septemberPeriodStart,
      });
      expect(septemberRow.legalAiQueryCount).toBe(1);

      // Time crosses into October before the (failed) turn's release runs —
      // exactly the window that used to make releasePaidLegalAiQuota
      // re-derive a DIFFERENT (October) usage row and never actually
      // release the September reservation.
      clock = startOfNextMonth;
      await access.releaseNewLegalQuestion(reservation);

      septemberRow = await usage.getOrCreate({
        userId: "lawyer-1",
        subscriptionId: created.id,
        periodStart: septemberPeriodStart,
      });
      expect(septemberRow.legalAiQueryCount).toBe(0); // actually released, not leaked

      const octoberPeriodStart = new Date(Date.UTC(2026, 9, 1));
      const octoberRow = await usage.getOrCreate({
        userId: "lawyer-1",
        subscriptionId: created.id,
        periodStart: octoberPeriodStart,
      });
      expect(octoberRow.legalAiQueryCount).toBe(0); // release must not touch/create the new month's row
    });

    it("REGRESSION: a subscription/seat change between reserve and release does not redirect the release to a different row", async () => {
      const { subscriptions, usage, created, access } = await setupLawyer(() => new Date());
      const subject = { kind: "user" as const, userId: "lawyer-1", role: UserRole.LAWYER };
      const periodStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );

      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      let originalRow = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
      expect(originalRow.legalAiQueryCount).toBe(1);

      // Simulate the subscription changing between reserve and release
      // (e.g. an admin action, a plan change) — a fresh lookup of
      // findActiveSeatForUser/findActiveOwnedByUserId would now resolve
      // differently than it did at reserve time. A different plan code
      // (TEAM, not another SOLO) avoids the repository's own "one active
      // SOLO per owner" business rule, which is unrelated to what this
      // test is exercising.
      const replacement = await subscriptions.create({
        ownerUserId: "lawyer-1",
        planCode: SubscriptionPlanCode.TEAM,
        status: SubscriptionStatus.ACTIVE,
        seatLimit: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: futureDate(),
      });
      await subscriptions.createSeat({
        subscriptionId: replacement.id,
        userId: "lawyer-1",
        status: SeatStatus.ACTIVE,
      });

      await access.releaseNewLegalQuestion(reservation);

      originalRow = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
      expect(originalRow.legalAiQueryCount).toBe(0); // the row actually reserved was released

      const replacementRow = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: replacement.id, periodStart });
      expect(replacementRow.legalAiQueryCount).toBe(0); // the new subscription's row was never touched
    });

    it("a double release cannot over-decrement below zero", async () => {
      const { usage, created, access } = await setupLawyer(() => new Date());
      const subject = { kind: "user" as const, userId: "lawyer-1", role: UserRole.LAWYER };
      const periodStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );

      const reservation = await access.assertCanStartNewLegalQuestion(subject);
      await access.releaseNewLegalQuestion(reservation);
      await access.releaseNewLegalQuestion(reservation); // defensive double-call

      const row = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
      expect(row.legalAiQueryCount).toBe(0); // guarded at 0, never negative
    });
  });

  it("REGRESSION (P0-3): concurrent paid requests cannot both consume the last unit of quota", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const usage = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "lawyer-1",
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureDate(),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "lawyer-1",
      status: SeatStatus.ACTIVE,
    });
    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    // Pre-consume the quota down to exactly one remaining unit.
    const seedUsage = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
    await usage.increment(seedUsage.id, {
      legalAiQueryCount: SOLO_PLAN.quotas.legalAiQueries - 1,
    });

    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble(),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usage,
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });
    const subject = { kind: "user" as const, userId: "lawyer-1", role: UserRole.LAWYER };

    const results = await Promise.allSettled([
      access.assertCanStartNewLegalQuestion(subject),
      access.assertCanStartNewLegalQuestion(subject),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "FEATURE_QUOTA_EXCEEDED",
    });

    const finalUsage = await usage.getOrCreate({ userId: "lawyer-1", subscriptionId: created.id, periodStart });
    expect(finalUsage.legalAiQueryCount).toBe(SOLO_PLAN.quotas.legalAiQueries); // exactly at the ceiling, not over it
  });

  it("treats guests and unpaid citizens as unpaid for general questions", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble([
        { id: "g1", freeLegalQuestionsUsed: 0, expiresAt: futureDate() },
      ]),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });

    await expect(
      access.hasPaidLegalAiAccess({
        kind: "guest",
        guestSessionId: "g1",
      }),
    ).resolves.toBe(false);
    await expect(
      access.hasPaidLegalAiAccess({
        kind: "user",
        userId: "client-1",
        role: UserRole.CLIENT,
      }),
    ).resolves.toBe(false);
  });

  it("enforces lawyer SOLO LEGAL_AI_QUERY quota only for new questions", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const usageRepo = new InMemoryEntitlementUsageRepository();
    const created = await subscriptions.create({
      ownerUserId: "lawyer-1",
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: futureDate(),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "lawyer-1",
      status: SeatStatus.ACTIVE,
    });
    const periodStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const usage = await usageRepo.getOrCreate({
      userId: "lawyer-1",
      subscriptionId: created.id,
      periodStart,
    });
    await usageRepo.increment(usage.id, {
      legalAiQueryCount: SOLO_PLAN.quotas.legalAiQueries,
    });
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble(),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: subscriptions,
      entitlementUsageRepository: usageRepo,
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });

    await expect(
      access.assertCanStartNewLegalQuestion({
        kind: "user",
        userId: "lawyer-1",
        role: UserRole.LAWYER,
      }),
    ).rejects.toMatchObject({ code: "FEATURE_QUOTA_EXCEEDED" });
    expect(EntitlementFeature.LEGAL_AI_QUERY).toBe("LEGAL_AI_QUERY");
  });

  it("reports guest remaining threads from server snapshot", async () => {
    const snapshot = await getLegalQuestionEntitlementSnapshot(
      { kind: "anonymous" },
      {
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: new InMemorySubscriptionRepository(),
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage: noopUnpaidCitizenUsage(),
      },
    );
    expect(snapshot.audience).toBe("guest");
    expect(snapshot.remainingKind).toBe("guest_free");
    expect(snapshot.remainingLegalQuestions).toBe(1);
    expect(snapshot.exhaustedNextStep).toBe("login");
    expect(snapshot.remainingLabel).toContain("1");
    expect(snapshot.expiresSoon).toBe(false);
    expect(snapshot.currentPeriodEnd).toBeNull();
  });

  it("warns when a paid plan ends within three days", async () => {
    const subscriptions = new InMemorySubscriptionRepository();
    const created = await subscriptions.create({
      ownerUserId: "lawyer-1",
      planCode: SubscriptionPlanCode.SOLO,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 1,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    await subscriptions.createSeat({
      subscriptionId: created.id,
      userId: "lawyer-1",
      status: SeatStatus.ACTIVE,
    });
    const snapshot = await getLegalQuestionEntitlementSnapshot(
      { kind: "user", userId: "lawyer-1", role: UserRole.LAWYER },
      {
        guestSessions: createGuestSessionsDouble(),
        conversations: { countBilledQuestionsForUser: async () => 0 },
        subscriptionRepository: subscriptions,
        entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
        unpaidCitizenUsage: noopUnpaidCitizenUsage(),
      },
    );
    expect(snapshot.expiresSoon).toBe(true);
    expect(snapshot.expiryWarningLabel).toContain("3 хоног");
  });
});

describe("LegalQuestionReservation exhaustiveness", () => {
  it("releaseNewLegalQuestion is a safe no-op for a 'none' reservation (demo subjects, etc.)", async () => {
    const access = createLegalQuestionAccess({
      guestSessions: createGuestSessionsDouble(),
      conversations: { countBilledQuestionsForUser: async () => 0 },
      subscriptionRepository: new InMemorySubscriptionRepository(),
      entitlementUsageRepository: new InMemoryEntitlementUsageRepository(),
      unpaidCitizenUsage: noopUnpaidCitizenUsage(),
    });
    const none: LegalQuestionReservation = { kind: "none" };
    await expect(access.releaseNewLegalQuestion(none)).resolves.toBeUndefined();
  });
});
