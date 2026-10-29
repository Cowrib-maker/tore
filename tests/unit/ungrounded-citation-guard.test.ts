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

describe("extractArticleMentions — explicit citations are recognised", () => {
  it.each([
    ["12-р зүйл", [12]],
    ["Хуулийн 12 -р зүйл", [12]],
    ["17 дугаар зүйл", [17]],
    ["40 дүгээр зүйл", [40]],
    ["Иргэний хуулийн 17 дугаар зүйлийн 1 дэх хэсэг", [17]],
    ["17-р зүйлийн 2 дахь заалт", [17]],
    ["Хуулийн зүйлийн 21 заалт", [21]],
    ["Зүйл 12. Зорилго", [12]],
    ["Зүйл 12-т зааснаар", [12]],
    ["(зүйл 7)", [7]],
    ["Тайлбар: Зүйл 15\nДараагийн мөр", [15]],
  ])("%s → %j", (text, expected) => {
    expect(extractArticleMentions(text)).toEqual(expected);
  });
});

describe("extractArticleMentions — plain numbers are not articles", () => {
  it.each([
    "Энэ зүйл 5 хоногийн дотор шийдэгдэнэ.",
    "Нэг зүйл 3 удаа давтагдсан байна.",
    "Таны асуусан 2 дахь зүйл нь гэрээ юм.",
    "Дараах 3 зүйлийг анхаарна уу: 1) гэрээ 2) төлбөр 3) хугацаа.",
    "Үнэ 25 зүйл бүтээгдэхүүн",
    "Тухайн зүйлийн 5 хувийг төлнө.",
    "Тухайн зүйлийн 30 хоногийн дотор.",
    "Тухайн зүйлийн 10 өдрийн дотор.",
    "Нийт 12 зүйл байна, 5 хоногийн дотор, 3 удаа.",
  ])("%s → none", (text) => {
    expect(extractArticleMentions(text)).toEqual([]);
  });
});

describe("guardUngroundedCitations — warning only for an explicit, unverified article", () => {
  it("never warns on quantities, even with no verified authority at all", () => {
    const text = "Энэ зүйл 5 хоногийн дотор шийдэгдэнэ. Дараах 3 зүйлийг анхаарна уу. 2 дахь зүйл нь гэрээ юм.";
    expect(guardUngroundedCitations(text, undefined)).toEqual({ content: text, ungrounded: [] });
    expect(guardUngroundedCitations(text, [{ article: "17" }])).toEqual({ content: text, ungrounded: [] });
  });
  it("a verified article is not warned, in every recognised spelling", () => {
    const verified = [{ article: "12" }, { locator: "art-17.1" }, { article: "40" }];
    for (const text of ["12-р зүйл", "17 дугаар зүйлийн 1 дэх хэсэг", "40 дүгээр зүйл", "Зүйл 12-т зааснаар"]) {
      expect(guardUngroundedCitations(text, verified)).toEqual({ content: text, ungrounded: [] });
    }
  });
  it("warns about the unverified explicit article only, not the quantity next to it", () => {
    const text = "Хуулийн 99-р зүйл 5 хоногийн дотор хамаарна, 12 дугаар зүйл мөн адил.";
    const r = guardUngroundedCitations(text, [{ article: "12" }]);
    expect(r.ungrounded).toEqual([99]);
    expect(r.content).toContain("99-р зүйл");
    expect(r.content).not.toContain("5-р зүйл");
    expect(r.content).not.toContain("12-р зүйл нь");
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

  it("never raises a false warning for the common case: one verified authority per article number, with or without a title", () => {
    expect(guardUngroundedCitations("17-р зүйл", [{ article: "17", title: "Иргэний хууль" }]).ungrounded).toEqual([]);
    expect(guardUngroundedCitations("17-р зүйл", [{ article: "17" }]).ungrounded).toEqual([]);
  });

  it("flags a same-numbered article as ambiguous (ungrounded) when this turn's own verified authorities disagree on which law it belongs to", () => {
    // The exact wrong-law/same-article-number gap 93167b4 closed inside the
    // exact-citation retriever, but this separate post-generation guard
    // never inherited it: an open-question turn can retrieve two different
    // laws' "92-р зүйл" in one turn (e.g. Civil Code and Labor Law both
    // verified this turn), and free text citing "92-р зүйл" never names
    // which law it means — so that number must not be silently trusted.
    const verified = [
      { article: "92", title: "Иргэний хууль" },
      { article: "92", title: "Хөдөлмөрийн тухай хууль" },
    ];
    const r = guardUngroundedCitations("Үүнийг 92-р зүйлд заасан.", verified);
    expect(r.ungrounded).toEqual([92]);
    expect(r.content).toContain(INSUFFICIENT_EVIDENCE_MN);
  });

  it("does not flag a same-numbered article when every verified authority carrying it agrees on the law (same title repeated, e.g. article + paragraph both verified)", () => {
    const verified = [
      { article: "17", title: "Эрүүгийн хууль" },
      { locator: "art-17/p-2", title: "Эрүүгийн хууль" },
    ];
    expect(guardUngroundedCitations("17-р зүйл", verified).ungrounded).toEqual([]);
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

  it("the general (non-legal) answer path is guarded too — not just the legal/retrieval paths (regression)", async () => {
    // completeGeneralAnswer (DomainLabel.NON_LEGAL / PromptTurnKind.GENERAL)
    // never calls the retriever at all, so if the model answers a non-legal
    // question anyway with a fabricated-looking article citation — contrary
    // to its GENERAL-mode instructions — nothing used to catch it: this was
    // the one of the three createTurn persistence sites that never called
    // guardUngroundedCitations, unlike the other two.
    const completion = createCompletion();
    completion.complete.mockResolvedValue({ content: "Энэ бол 99-р зүйлд заасан хариулт.", provider: "fake", model: "fake", inputTokens: 1, outputTokens: 1 });
    const corpusRetriever = createRetriever();
    const { service, store } = createService({ completion, corpusRetriever });
    const r = await service.createTurn({ userId: "user-1", message: "Elon Musk хэдэн хүүхэдтэй вэ?" });
    expect(r.turnKind).toBe("GENERAL");
    expect(r.message.content).toContain(INSUFFICIENT_EVIDENCE_MN);
    expect(store.assistantMessages[0]).toContain(INSUFFICIENT_EVIDENCE_MN);
    expect(corpusRetriever.retrieveLegalQuestion).not.toHaveBeenCalled();
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
