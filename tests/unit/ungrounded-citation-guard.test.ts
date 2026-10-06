import { describe, expect, it } from "vitest";

import { extractArticleMentions, guardUngroundedCitations, INSUFFICIENT_EVIDENCE_MN } from "@/application/ai/ungrounded-citation-guard";

import { createCompletion, createService, createRetriever, sampleAuthority } from "./support/legal-ai-service-fixtures";

describe("extractArticleMentions", () => {
  it("finds ordinal article citations, not counts", () => {
    expect(extractArticleMentions("Хуулийн 17-р зүйл болон 8 дугаар зүйл, мөн зүйлийн 21 заалт.")).toEqual([8, 17, 21]);
    expect(extractArticleMentions("Хоёр зүйл анхаарна. 3 зүйл байна.")).toEqual([]);
  });
});

describe("extractArticleMentions — false positives and multiples", () => {
  it("does not read a paragraph number as an article", () => {
    expect(extractArticleMentions("Хуулийн 17 дугаар зүйлийн 1 дэх хэсэг")).toEqual([17]);
    expect(extractArticleMentions("17-р зүйлийн 2 дахь заалт")).toEqual([17]);
  });
  it("ordinary text without citations yields nothing", () => {
    expect(extractArticleMentions("Энэ нь чухал зүйл. Хоёр зүйл анхаарна уу. 5 хоногийн дотор.")).toEqual([]);
    expect(extractArticleMentions("")).toEqual([]);
  });
  it("collects several distinct articles in order", () => {
    expect(extractArticleMentions("3-р зүйл, 12-р зүйл болон 3-р зүйл дахин, 40 дүгээр зүйл")).toEqual([3, 12, 40]);
  });
});

describe("guardUngroundedCitations", () => {
  it("all cited articles verified (several) → no warning appended, text identical", () => {
    const text = "17-р зүйл болон 21-р зүйлийн 2 дахь хэсэг";
    const r = guardUngroundedCitations(text, [{ locator: "art-17.1" }, { article: "21" }]);
    expect(r.content).toBe(text);
    expect(r.ungrounded).toEqual([]);
  });
  it("one verified + one unverified article → only the unverified one is named", () => {
    const r = guardUngroundedCitations("17-р зүйл ба 999-р зүйл", [{ article: "17" }]);
    expect(r.ungrounded).toEqual([999]);
    expect(r.content).toContain("999-р зүйл нь");
  });
  it("leaves text without article citations untouched", () => {
    const r = guardUngroundedCitations("Ерөнхий зөвлөмж.", []);
    expect(r).toEqual({ content: "Ерөнхий зөвлөмж.", ungrounded: [] });
  });

  it("leaves a citation verified this turn untouched (explicit article or art- locator)", () => {
    expect(guardUngroundedCitations("17-р зүйл", [{ article: "17" }]).ungrounded).toEqual([]);
    expect(guardUngroundedCitations("17-р зүйл", [{ locator: "art-17.1" }]).ungrounded).toEqual([]);
    expect(guardUngroundedCitations("17-р зүйл", [{ locator: "art-17/p-2" }]).ungrounded).toEqual([]);
  });

  it("flags an article nobody verified and appends the insufficient-evidence sentence", () => {
    const r = guardUngroundedCitations("Хуулийн 99-р зүйлд заасны дагуу...", [{ article: "17" }]);
    expect(r.ungrounded).toEqual([99]);
    expect(r.content.startsWith("Хуулийн 99-р зүйлд заасны дагуу...")).toBe(true);
    expect(r.content).toContain("99-р зүйл");
    expect(r.content.endsWith(INSUFFICIENT_EVIDENCE_MN)).toBe(true);
  });

  it("with no verified authority at all, every cited article is ungrounded", () => {
    expect(guardUngroundedCitations("5-р зүйл ба 6-р зүйл", undefined).ungrounded).toEqual([5, 6]);
  });

  it("is deterministic and idempotent on already-guarded text only in content, not by re-guarding silently", () => {
    const a = guardUngroundedCitations("12-р зүйл", []);
    const b = guardUngroundedCitations("12-р зүйл", []);
    expect(a).toEqual(b);
  });
});

describe("LegalAiService applies the guard to model output", () => {
  it("an answer citing an article that retrieval did not verify is persisted WITH the notice", async () => {
    const completion = createCompletion();
    completion.complete.mockResolvedValue({ content: "Таны хэрэгт 99-р зүйл хамаарна.", provider: "fake", model: "fake", inputTokens: 1, outputTokens: 1 });
    const corpusRetriever = createRetriever();
    corpusRetriever.retrieveLegalQuestion.mockResolvedValueOnce({
      kind: "retrieved",
      status: "ok",
      authorities: [sampleAuthority()],
      retrievedAt: "2026-01-01T00:00:00.000Z",
    });
    const { service, store } = createService({ completion, corpusRetriever });
    const r = await service.createTurn({ userId: "user-1", message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?" });
    expect(r.message.content).toContain("Таны хэрэгт 99-р зүйл хамаарна.");
    expect(r.message.content).toContain(INSUFFICIENT_EVIDENCE_MN);
    expect(store.assistantMessages[0]).toContain(INSUFFICIENT_EVIDENCE_MN);
  });

  it("a verified article (locator art-17.1) is NOT flagged", async () => {
    const completion = createCompletion();
    completion.complete.mockResolvedValue({ content: "17-р зүйлд зааснаар...", provider: "fake", model: "fake", inputTokens: 1, outputTokens: 1 });
    const corpusRetriever = createRetriever();
    corpusRetriever.retrieveLegalQuestion.mockResolvedValueOnce({ kind: "retrieved", status: "ok", authorities: [sampleAuthority()], retrievedAt: "2026-01-01T00:00:00.000Z" });
    const { service } = createService({ completion, corpusRetriever });
    const r = await service.createTurn({ userId: "user-1", message: "Хөдөлмөрийн гэрээг хэрхэн цуцлах вэ?" });
    expect(r.message.content).toBe("17-р зүйлд зааснаар...");
  });
});
