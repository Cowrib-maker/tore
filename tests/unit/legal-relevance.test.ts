import { describe, expect, it } from "vitest";

import { LegalQuestionStatus } from "@/domain/enums";
import { LegalRelevance } from "@/engine/relevance";
import {
  clarificationContainsForbiddenJargon,
  createLegalRelevanceEngine,
} from "@/engine/relevance";

describe("LegalRelevanceService", () => {
  const engine = createLegalRelevanceEngine();

  it("does not treat an unoccupied-home taking as NON_LEGAL", async () => {
    const result = await engine.classify({
      message: "Айлд хүн байхгүй байхад ороод зурагт аваад явсан",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
    expect([
      LegalRelevance.POSSIBLY_LEGAL,
      LegalRelevance.LEGAL,
    ]).toContain(result.relevance);
    if (result.relevance === LegalRelevance.POSSIBLY_LEGAL) {
      expect(result.clarificationMessage).toBeTruthy();
      expect(
        clarificationContainsForbiddenJargon(result.clarificationMessage ?? ""),
      ).toBe(false);
    }
  });

  it("treats being fired in everyday language as possibly legal or legal", async () => {
    const result = await engine.classify({
      message: "Манай дарга намайг өнөөдөр ажлаас гаргасан",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
    expect(result.issueFamily).toBe("EMPLOYMENT");
  });

  it("treats an unpaid loan story as possibly legal or legal", async () => {
    const result = await engine.classify({
      message: "Надаас мөнгө зээлээд буцааж өгөхгүй байна",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
    expect(result.issueFamily).toBe("CIVIL");
  });

  it("treats a child-taken story as family-related, not NON_LEGAL", async () => {
    const result = await engine.classify({
      message: "Нөхөр маань хүүхдээ аваад явчихсан, би яах вэ?",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
    expect(result.issueFamily).toBe("FAMILY");
  });

  it("classifies a movie question as NON_LEGAL", async () => {
    const result = await engine.classify({
      message: "Өнөөдөр ямар кино үзэх вэ?",
    });
    expect(result.relevance).toBe(LegalRelevance.NON_LEGAL);
  });

  it("classifies an exact statute citation as LEGAL", async () => {
    const result = await engine.classify({
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
    });
    expect(result.relevance).toBe(LegalRelevance.LEGAL);
    expect(result.reasons).toContain("exact-citation");
  });

  it("does not treat unknown intent as NON_LEGAL when a situation is present", async () => {
    const result = await engine.classify({
      message: "Намайг дэлгүүрээс хөөсөн, мөнгөө буцааж өгөхгүй байна",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
  });

  it("promotes a clarification follow-up into LEGAL unless the user changes topic", async () => {
    const first = await engine.classify({
      message: "Манай дарга намайг ажлаас гаргасан",
    });
    expect(first.relevance).toBe(LegalRelevance.POSSIBLY_LEGAL);

    const followUp = await engine.classify({
      message: "Тийм, ажлын талаар асууж байна",
      conversationContext: [
        { role: "USER", content: "Манай дарга намайг ажлаас гаргасан" },
        { role: "ASSISTANT", content: first.clarificationMessage ?? "" },
      ],
    });
    expect(followUp.relevance).toBe(LegalRelevance.LEGAL);
    expect(followUp.reasons).toContain("clarification-follow-up");

    const switched = await engine.classify({
      message: "Өнөөдөр ямар кино үзэх вэ?",
      conversationContext: [
        { role: "USER", content: "Манай дарга намайг ажлаас гаргасан" },
        { role: "ASSISTANT", content: first.clarificationMessage ?? "" },
      ],
    });
    expect(switched.relevance).toBe(LegalRelevance.NON_LEGAL);
  });

  it("promotes a vague clarifying-thread follow-up into LEGAL", async () => {
    const followUp = await engine.classify({
      message: "harin naad asuudal chin bn",
      questionStatus: LegalQuestionStatus.CLARIFYING,
      conversationContext: [
        { role: "USER", content: "Манай дарга намайг ажлаас гаргасан" },
        {
          role: "ASSISTANT",
          content:
            "Ойлголоо. Ажлаас халсан гэж байна. Энэ яг хэзээ болсон бэ?",
        },
      ],
    });

    expect(followUp.relevance).toBe(LegalRelevance.LEGAL);
    expect(followUp.reasons).toContain("clarifying-thread-continuation");
  });
});

const mustNotBeNonLegal = [
  "Өнөөдөр шүүх хуралд орох гэж байгаа юм.",
  "Хүний юм хулгайлчихсан чинь цагдаад шалгагдаад дууссан.",
  "Өнөөдөр шүүх хуралд орох гэж байгаа юм. Хүний юм хулгайлчихсан чинь цагдаад шалгагдаад дууссан.",
  "Цагдаагаас намайг дуудсан.",
  "Прокурорт дуудагдсан.",
  "Дарга намайг ажлаас халчихлаа.",
  "Цалингаа хоёр сар аваагүй.",
  "Мөнгөө өгчихсөн чинь буцааж өгөхгүй байна.",
  "Өчигдөр машинаар осолд орчихсон.",
  "Хүүхдийн тэтгэлэг өгөхгүй байна.",
  "Цагдаагаас намайг дуудсан, юу авч очих вэ?",
  "Дарга намайг өнөөдөр шууд ажлаас халчихлаа.",
  "Прокурорт дуудагдсан, яах вэ?",
  "Хүүхдийн тэтгэлгээ авч чадахгүй байна.",
] as const;

describe("fact-based legal relevance", () => {
  const engine = createLegalRelevanceEngine();

  it.each(mustNotBeNonLegal)(
    "does not treat lived facts as NON_LEGAL: %s",
    async (message) => {
      const result = await engine.classify({ message });
      expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
      expect([
        LegalRelevance.POSSIBLY_LEGAL,
        LegalRelevance.LEGAL,
      ]).toContain(result.relevance);
    },
  );

  it("classifies court plus theft as LEGAL or POSSIBLY_LEGAL, never NON_LEGAL", async () => {
    const result = await engine.classify({
      message:
        "Өнөөдөр шүүх хуралд орох гэж байгаа юм. Хүний юм хулгайлчихсан чинь цагдаад шалгагдаад дууссан.",
    });
    expect(result.relevance).not.toBe(LegalRelevance.NON_LEGAL);
    expect(result.reasons.join(" ")).not.toContain("no-legal-signal");
  });

  it("asks a useful employment clarification for a vague workplace problem", async () => {
    const result = await engine.classify({
      message: "Даргатай асуудал гарчихлаа.",
    });
    expect(result.relevance).toBe(LegalRelevance.POSSIBLY_LEGAL);
    expect(result.issueFamily).toBe("EMPLOYMENT");
    expect(result.clarificationMessage).toMatch(/ажлын тань ямар асуудал/i);
    expect(result.clarificationMessage).not.toMatch(
      /ямар хууль|иргэний үү|эрүүгийн үү/,
    );
  });

  it("keeps movie and definition mentions NON_LEGAL", async () => {
    await expect(
      engine.classify({ message: "Шүүхийн тухай кино үзлээ." }),
    ).resolves.toMatchObject({ relevance: LegalRelevance.NON_LEGAL });
    await expect(
      engine.classify({ message: "Цагдаагийн тухай кино байна." }),
    ).resolves.toMatchObject({ relevance: LegalRelevance.NON_LEGAL });
    await expect(
      engine.classify({ message: "Хулгай гэдэг үг ямар утгатай вэ?" }),
    ).resolves.toMatchObject({ relevance: LegalRelevance.NON_LEGAL });
  });

  it("keeps a genuinely non-legal question NON_LEGAL", async () => {
    const result = await engine.classify({
      message: "Elon Musk гэж хэн бэ?",
    });
    expect(result.relevance).toBe(LegalRelevance.NON_LEGAL);
  });
});
