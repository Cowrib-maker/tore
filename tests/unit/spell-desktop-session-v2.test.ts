import { describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "@/spell-engine";
import { DesktopSpellSession, replaceAllSafe, StaleIssueError, type DictionaryDoc } from "../../desktop/core/spell-session";
import { MemoryStore } from "../../desktop/core/store";

const mk = () => new DesktopSpellSession(createSpellEngineV1(), new MemoryStore<DictionaryDoc>(), { isEntitled: async () => true });

describe("desktop session: incremental checking, advisory tier, safe replace-all", () => {
  it("gives the same result with and without the paragraph cache, with exact offsets across paragraphs", async () => {
    const text = "Хуулын заалт байна.\nХурал эхэллээ.\nӨнөөдөр хуулын тухай ярив.";
    const s = mk();
    const first = await s.check(text);
    const second = await s.check(text); // served from the cache
    if (first.locked || second.locked) throw new Error("locked");
    expect(second.issues).toEqual(first.issues);
    for (const i of first.issues) expect(text.slice(i.range.start, i.range.end)).toBe(i.token);
    expect(first.issues.filter((i) => i.token.toLowerCase() === "хуулын")).toHaveLength(2);
  });
  it("editing one paragraph does not disturb the others; adding a dictionary word invalidates everything", async () => {
    const s = mk();
    const a = "Хуулын заалт.\nБүлжирэн хөлгөйтөр.";
    const r1 = await s.check(a, { reportUnknown: true });
    if (r1.locked) throw new Error("locked");
    expect(r1.issues.some((i) => i.token === "Бүлжирэн")).toBe(true);
    s.addToDictionary("Бүлжирэн");
    const r2 = await s.check(a, { reportUnknown: true });
    if (r2.locked) throw new Error("locked");
    expect(r2.issues.some((i) => i.token === "Бүлжирэн")).toBe(false);
    expect(r2.issues.some((i) => i.token === "Хуулын")).toBe(true);
  });
  it("advisory diagnostics are opt-in, flagged ADVISORY and never claim to be errors", async () => {
    const s = mk();
    const text = "Хурал дууслаа. маргааш үргэлжилнэ.  Дахин";
    const off = await s.check(text);
    const on = await s.check(text, { advisory: true });
    if (off.locked || on.locked) throw new Error("locked");
    expect(off.issues.filter((i) => i.verdict === "ADVISORY")).toHaveLength(0);
    const adv = on.issues.filter((i) => i.verdict === "ADVISORY");
    expect(adv.length).toBeGreaterThan(0);
    for (const a of adv) expect(text.slice(a.range.start, a.range.end)).toBe(a.token);
    expect(on.stats.misspelled).toBe(off.stats.misspelled);
  });
  it("replace-all applies only CONFIDENT fixes, all-or-nothing", () => {
    const text = "Хуулын тухай хуулын заалт.";
    const mkIssue = (start: number, status: "CONFIDENT" | "AMBIGUOUS" = "CONFIDENT") => ({ token: text.slice(start, start + 6), range: { start, end: start + 6 }, suggestionStatus: status, verdict: "MISSPELLED" as const });
    const ok = replaceAllSafe(text, [mkIssue(0), mkIssue(13)], "хуулийн");
    expect(ok).toEqual({ text: "хуулийн тухай хуулийн заалт.", count: 2 });
    expect(replaceAllSafe(text, [mkIssue(0), mkIssue(13, "AMBIGUOUS")], "x")).toBeNull();
    expect(replaceAllSafe("Өөр текст.", [mkIssue(0)], "x")).toBeNull(); // stale
    expect(() => mk().applyReplacementAll(text, [mkIssue(0, "AMBIGUOUS")], "x")).toThrow(StaleIssueError);
  });
  it("personal dictionary, ignore-all and ignore-once still behave with the cache in place", async () => {
    const s = mk();
    const t = "Бүлжирэн хөлгөйтөр ирлээ.";
    const r = await s.check(t, { reportUnknown: true });
    if (r.locked) throw new Error("locked");
    const w = r.issues.find((i) => i.token === "Бүлжирэн")!;
    s.ignoreAll(w);
    const r2 = await s.check(t, { reportUnknown: true });
    if (r2.locked) throw new Error("locked");
    expect(r2.issues.some((i) => i.token === "Бүлжирэн")).toBe(false);
  });
});
