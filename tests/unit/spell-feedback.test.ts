import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { getContributions, listFeedbackGroups, reviewFeedbackGroup, submitFeedback, type FeedbackDeps } from "@/application/use-cases/spell/feedback";
import { feedbackRequestSchema } from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";
import { SpellAttemptKind } from "@/domain/spell/enums";
import { MAX_FEEDBACK_PER_USER_PER_DAY, feedbackGroupKey, normalizeFeedback, type FeedbackInput } from "@/domain/spell/feedback";
import { InMemorySpellFeedbackRepository } from "@/infrastructure/repositories/in-memory-spell-feedback-repository";
import { createSpellEngineV1 } from "@/spell-engine";
import { feedbackGroupsToReviewItems } from "@/spell-engine/review/feedback-bridge";
import { itemState } from "@/spell-engine/review/review";
import { DAY, makeSpell, newDevice, rejection, signRequest, type TestDevice } from "./helpers/spell-kit";

const base = { engineVersion: "1.0.0-alpha.2", dataVersion: "pack@1" };
const fb = (o: Partial<FeedbackInput> & Pick<FeedbackInput, "feedbackType">): FeedbackInput => ({ ...base, ...o });

/** A licensed, activated device for `owner`, plus the feedback deps wired to the same in-memory Spell. */
async function setup() {
  const s = makeSpell();
  const feedbackRepository = new InMemorySpellFeedbackRepository();
  const deps: FeedbackDeps = { feedbackRepository, spell: s.deps };
  const enroll = async (userId: string) => {
    const owner = s.addUser(userId);
    const { code } = await s.issue({ ownerUserId: owner.userId });
    const device = newDevice();
    const grant = await s.activate(device, code, { now: s.t0 });
    return { owner, device, activationId: grant.activationId };
  };
  const auth = (device: TestDevice, now = s.t0) =>
    authenticateSignedRequest(signRequest(device, { path: "/api/spell/v1/feedback", body: { x: 1 }, now }), toAuthenticateDeps(s.deps), SpellAttemptKind.VALIDATE, {}, now);
  const send = async (u: Awaited<ReturnType<typeof enroll>>, feedback: FeedbackInput, now = s.t0) =>
    submitFeedback({ device: await auth(u.device, now), activationId: u.activationId, feedback }, deps, now);
  return { s, deps, feedbackRepository, enroll, auth, send };
}

describe("feedback input is one word, never a document", () => {
  it("accepts the five report types", () => {
    for (const f of [
      fb({ feedbackType: "WRONG_CORRECTION", token: "багшийг", engineSuggestion: "багшыг" }),
      fb({ feedbackType: "MISSING_ERROR", token: "сургуулын", userSuggestion: "сургуулийн" }),
      fb({ feedbackType: "WRONG_SUGGESTION", token: "надэд", engineSuggestion: "надад", userSuggestion: "надад" }),
      fb({ feedbackType: "MISSING_WORD", token: "бүлжирэн" }),
      fb({ feedbackType: "GENERAL", comment: "Маш удаан байна" }),
    ]) expect(() => normalizeFeedback(f)).not.toThrow();
  });
  it("refuses sentences, missing fields and junk", () => {
    expect(() => normalizeFeedback(fb({ feedbackType: "MISSING_WORD", token: "энэ бол өгүүлбэр" }))).toThrow();
    expect(() => normalizeFeedback(fb({ feedbackType: "MISSING_ERROR", token: "сургуулын" }))).toThrow(); // needs the correct form
    expect(() => normalizeFeedback(fb({ feedbackType: "GENERAL" }))).toThrow(); // needs a comment
    expect(() => normalizeFeedback(fb({ feedbackType: "GENERAL", token: "үг", comment: "x" }))).toThrow();
    expect(() => normalizeFeedback(fb({ feedbackType: "WRONG_SUGGESTION", token: "а", userSuggestion: "долоо хоног" }))).toThrow();
    expect(() => normalizeFeedback({ ...fb({ feedbackType: "MISSING_WORD", token: "а" }), reasonCode: "bad code!" })).toThrow();
  });
  it("trims a long comment to 200 characters and strips control characters", () => {
    const n = normalizeFeedback(fb({ feedbackType: "GENERAL", comment: `a\u0000b${"x".repeat(500)}` }));
    expect(n.comment!.length).toBe(200);
    expect(n.comment).not.toMatch(/\u0000/);
  });
  it("identical reports share a key regardless of case and spacing; different reports do not", () => {
    const k = (o: Partial<FeedbackInput>) => feedbackGroupKey(normalizeFeedback(fb({ feedbackType: "MISSING_ERROR", token: "Сургуулын", userSuggestion: "сургуулийн", ...o })));
    expect(k({})).toBe(k({ token: " сургуулын " }));
    expect(k({})).not.toBe(k({ userSuggestion: "сургуулиын" }));
  });
});

describe("the API schema has no status field and refuses extras", () => {
  const ok = { activationId: "a1", feedback: { feedbackType: "MISSING_WORD", token: "а", engineVersion: "1", dataVersion: "2" } };
  it("accepts a normal report", () => expect(feedbackRequestSchema.safeParse(ok).success).toBe(true));
  it("refuses any attempt to set a status, a user id, or review fields", () => {
    for (const extra of [{ status: "ACCEPTED" }, { userId: "someone-else" }, { reviewedBy: "admin" }, { groupKey: "x" }]) {
      expect(feedbackRequestSchema.safeParse({ ...ok, feedback: { ...ok.feedback, ...extra } }).success).toBe(false);
      expect(feedbackRequestSchema.safeParse({ ...ok, ...extra }).success).toBe(false);
    }
  });
});

describe("who may report: only an ACTIVE activation of a live licence", () => {
  it("stores the report as PENDING, owned by the licence owner", async () => {
    const t = await setup();
    const u = await t.enroll("u1");
    const r = await t.send(u, fb({ feedbackType: "WRONG_CORRECTION", token: "багшийг", engineSuggestion: "багшыг", reasonCode: "YI_FEMININE_STEM" }));
    expect(r.status).toBe("PENDING");
    expect(t.feedbackRepository.rows[0]).toMatchObject({ userId: "u1", status: "PENDING", reviewedBy: null });
    expect(r.stats).toEqual({ submitted: 1, accepted: 0, rejected: 0, pending: 1 });
  });
  it("a device that never activated cannot report (unknown installation)", async () => {
    const t = await setup();
    const stranger = newDevice();
    const e = await rejection(t.auth(stranger));
    expect(e.code).toBe("INSTALLATION_UNKNOWN");
  });
  it("another user's activationId is refused", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const b = await t.enroll("b");
    const e = await rejection(submitFeedback({ device: await t.auth(a.device), activationId: b.activationId, feedback: fb({ feedbackType: "MISSING_WORD", token: "а" }) }, t.deps, t.s.t0));
    expect(e.code).toBe("ACTIVATION_NOT_ACTIVE");
    expect(t.feedbackRepository.rows).toHaveLength(0);
  });
  it("a deactivated or expired licence cannot report", async () => {
    const t = await setup();
    const u = await t.enroll("u1");
    const later = new Date(t.s.t0.getTime() + 200 * DAY); // 3-month plan has ended
    expect((await rejection(t.send(u, fb({ feedbackType: "MISSING_WORD", token: "а" }), later))).code).toBe("LICENSE_EXPIRED");
    const v = await t.enroll("u2");
    await t.s.deactivate(v.device, v.activationId, t.s.t0);
    expect((await rejection(t.send(v, fb({ feedbackType: "MISSING_WORD", token: "а" })))).code).toBe("ACTIVATION_NOT_ACTIVE");
  });
  it("an invalid report is refused and nothing is stored", async () => {
    const t = await setup();
    const u = await t.enroll("u1");
    await rejection(t.send(u, fb({ feedbackType: "MISSING_WORD", token: "энэ бол өгүүлбэр" })));
    expect(t.feedbackRepository.rows).toHaveLength(0);
  });
  it("a replayed signed request is refused by the existing nonce check", async () => {
    const t = await setup();
    const u = await t.enroll("u1");
    const req = signRequest(u.device, { path: "/api/spell/v1/feedback", body: { x: 1 }, now: t.s.t0 });
    await authenticateSignedRequest(req, toAuthenticateDeps(t.s.deps), SpellAttemptKind.VALIDATE, {}, t.s.t0);
    expect((await rejection(authenticateSignedRequest(req, toAuthenticateDeps(t.s.deps), SpellAttemptKind.VALIDATE, {}, t.s.t0))).code).toBe("REQUEST_REPLAYED");
  });
  it("a per-user daily cap brakes spam", async () => {
    const t = await setup();
    const u = await t.enroll("u1");
    for (let i = 0; i < MAX_FEEDBACK_PER_USER_PER_DAY; i += 1) await t.send(u, fb({ feedbackType: "MISSING_WORD", token: `слово${i}`.replace(/\d/g, "а") }));
    expect((await rejection(t.send(u, fb({ feedbackType: "MISSING_WORD", token: "ещё" })))).code).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("grouping tells the truth about how many different people reported something", () => {
  it("one user repeating a report is ONE reporter; two users are two", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const b = await t.enroll("b");
    const f = fb({ feedbackType: "MISSING_ERROR", token: "сургуулын", userSuggestion: "сургуулийн" });
    await t.send(a, f);
    await t.send(a, f);
    await t.send(b, { ...f, token: "Сургуулын" });
    const admin = t.s.admin;
    const { groups } = await listFeedbackGroups(admin, { limit: 10 }, t.deps);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ distinctUsers: 2, reports: 3 });
  });
  it("orders groups by distinct reporters", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const b = await t.enroll("b");
    await t.send(a, fb({ feedbackType: "MISSING_WORD", token: "аль" }));
    await t.send(a, fb({ feedbackType: "MISSING_WORD", token: "аль" }));
    await t.send(a, fb({ feedbackType: "MISSING_WORD", token: "бэ" }));
    await t.send(b, fb({ feedbackType: "MISSING_WORD", token: "бэ" }));
    const { groups } = await listFeedbackGroups(t.s.admin, { limit: 10 }, t.deps);
    expect(groups.map((g) => [g.token, g.distinctUsers])).toEqual([["бэ", 2], ["аль", 1]]);
  });
});

describe("review is admin-only, reasoned, final, and never a language-data change", () => {
  const seed = async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const b = await t.enroll("b");
    const f = fb({ feedbackType: "WRONG_SUGGESTION", token: "надэд", engineSuggestion: "надад" });
    await t.send(a, f);
    await t.send(b, f);
    const key = t.feedbackRepository.rows[0]!.groupKey;
    return { t, a, b, key };
  };
  it("users and unauthenticated roles cannot list or review", async () => {
    const { t, key } = await seed();
    const user = { userId: "a", role: UserRole.CLIENT };
    expect((await rejection(listFeedbackGroups(user, { limit: 5 }, t.deps))).code).toBe("FORBIDDEN");
    expect((await rejection(reviewFeedbackGroup(user, { groupKey: key, decision: "ACCEPT", reason: "me" }, t.deps))).code).toBe("FORBIDDEN");
    expect(t.feedbackRepository.rows.every((r) => r.status === "PENDING")).toBe(true);
  });
  it("needs a known decision and a reason", async () => {
    const { t, key } = await seed();
    expect((await rejection(reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "ACCEPTED", reason: "x" }, t.deps))).code).toBe("VALIDATION_ERROR");
    expect((await rejection(reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "ACCEPT", reason: "  " }, t.deps))).code).toBe("VALIDATION_ERROR");
    expect((await rejection(reviewFeedbackGroup(t.s.admin, { groupKey: "nope", decision: "ACCEPT", reason: "x" }, t.deps))).code).toBe("NOT_FOUND");
  });
  it("applies to the whole group, records reviewer/time/reason, and is final", async () => {
    const { t, key } = await seed();
    const at = new Date("2026-10-09T10:00:00Z");
    expect(await reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "ACCEPT", reason: "reproducible" }, t.deps, at)).toEqual({ updated: 2, status: "ACCEPTED" });
    expect(t.feedbackRepository.rows.every((r) => r.status === "ACCEPTED" && r.reviewedBy === "admin-1" && r.reviewReason === "reproducible" && +r.reviewedAt! === +at)).toBe(true);
    expect((await rejection(reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "REJECT", reason: "changed my mind" }, t.deps))).code).toBe("VALIDATION_ERROR");
  });
  it("NEEDS_NATIVE_REVIEW stays open for a later decision; REJECT and DUPLICATE are final", async () => {
    const { t, key } = await seed();
    await reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "NEEDS_NATIVE_REVIEW", reason: "linguistic question" }, t.deps);
    expect((await listFeedbackGroups(t.s.admin, { status: "NEEDS_NATIVE_REVIEW", limit: 5 }, t.deps)).groups).toHaveLength(1);
    expect((await reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "DUPLICATE", reason: "same as another" }, t.deps)).status).toBe("DUPLICATE");
  });
  it("a new report in an already-reviewed group starts PENDING again (a reviewer decides on it too)", async () => {
    const { t, key } = await seed();
    await reviewFeedbackGroup(t.s.admin, { groupKey: key, decision: "ACCEPT", reason: "ok" }, t.deps);
    const c = await t.enroll("c");
    await t.send(c, fb({ feedbackType: "WRONG_SUGGESTION", token: "надэд", engineSuggestion: "надад" }));
    const last = t.feedbackRepository.rows.at(-1)!;
    expect(last.status).toBe("PENDING");
    expect(last.groupKey).toBe(key);
  });
});

describe("contribution accounting counts only accepted work", () => {
  it("submitted ≠ credit: only distinct ACCEPTED reports count; rejected spam earns nothing", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const good = fb({ feedbackType: "MISSING_ERROR", token: "сургуулын", userSuggestion: "сургуулийн" });
    const spam = fb({ feedbackType: "MISSING_WORD", token: "аааа" });
    await t.send(a, good);
    await t.send(a, good); // repeating does not multiply anything
    await t.send(a, spam);
    let stats = await getContributions({ device: await t.auth(a.device), activationId: a.activationId }, t.deps, t.s.t0);
    expect(stats).toEqual({ submitted: 2, accepted: 0, rejected: 0, pending: 2 });
    await reviewFeedbackGroup(t.s.admin, { groupKey: feedbackGroupKey(normalizeFeedback(good)), decision: "ACCEPT", reason: "valid" }, t.deps);
    await reviewFeedbackGroup(t.s.admin, { groupKey: feedbackGroupKey(normalizeFeedback(spam)), decision: "REJECT", reason: "not a word" }, t.deps);
    stats = await getContributions({ device: await t.auth(a.device), activationId: a.activationId }, t.deps, t.s.t0);
    expect(stats).toEqual({ submitted: 2, accepted: 1, rejected: 1, pending: 0 });
  });
  it("a user sees only their own statistics", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const b = await t.enroll("b");
    await t.send(a, fb({ feedbackType: "MISSING_WORD", token: "аль" }));
    const sb = await getContributions({ device: await t.auth(b.device), activationId: b.activationId }, t.deps, t.s.t0);
    expect(sb.submitted).toBe(0);
  });
});

describe("feedback never promotes anything", () => {
  it("accepting a report changes no engine verdict", async () => {
    const t = await setup();
    const a = await t.enroll("a");
    const engine = createSpellEngineV1();
    const before = engine.analyze("Энэ бүлжирэн нь").tokens[1]!.verdict;
    await t.send(a, fb({ feedbackType: "MISSING_WORD", token: "бүлжирэн" }));
    await reviewFeedbackGroup(t.s.admin, { groupKey: t.feedbackRepository.rows[0]!.groupKey, decision: "ACCEPT", reason: "real word" }, t.deps);
    expect(createSpellEngineV1().analyze("Энэ бүлжирэн нь").tokens[1]!.verdict).toBe(before);
  });
  it("the feedback code has no path to language data, review gold, or data tiers (static check)", () => {
    const files = ["src/domain/spell/feedback.ts", "src/application/use-cases/spell/feedback.ts", "src/infrastructure/repositories/prisma-spell-feedback-repository.ts", "src/infrastructure/repositories/in-memory-spell-feedback-repository.ts"];
    for (const f of files) {
      const text = fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/spell-engine|data\/packs|vocab|gold|NATIVE_REVIEWED|TRUSTED|REVIEWED/);
    }
  });
  it("exported review items are AUTOMATIC, undecided, and never native — the number of reporters only raises priority", () => {
    const items = feedbackGroupsToReviewItems(
      [
        { groupKey: "a".repeat(32), feedbackType: "MISSING_ERROR", token: "сургуулын", engineSuggestion: null, userSuggestion: "сургуулийн", distinctUsers: 17, reports: 20 },
        { groupKey: "b".repeat(32), feedbackType: "MISSING_WORD", token: "бүлжирэн", engineSuggestion: null, userSuggestion: null, distinctUsers: 1, reports: 1 },
        { groupKey: "c".repeat(32), feedbackType: "GENERAL", token: "", engineSuggestion: null, userSuggestion: null, distinctUsers: 9, reports: 9 },
      ],
      { at: "2026-10-09T00:00:00Z" },
    );
    expect(items.map((i) => i.token)).toEqual(["сургуулын", "бүлжирэн"]); // GENERAL feedback is not a language item
    for (const i of items) {
      expect(i.provenance).toBe("AUTOMATIC");
      expect(itemState(i).status).toBe("AUTO_GENERATED");
    }
    expect(items[0]!.currentReason).toMatch(/17 distinct user/);
  });
});
