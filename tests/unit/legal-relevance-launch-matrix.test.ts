import { describe, expect, it } from "vitest";

import { LegalRelevance } from "@/engine/relevance";
import {
  clarificationContainsForbiddenJargon,
  createLegalRelevanceEngine,
} from "@/engine/relevance";

const LAUNCH_PHRASES = [
  {
    id: 1,
    message: "Айлд хүн байхгүй байхад ороод зурагт аваад явсан",
    notNonLegal: true,
  },
  {
    id: 2,
    message: "Дарга намайг ажлаас халчихлаа",
    notNonLegal: true,
  },
  {
    id: 3,
    message: "Мөнгө зээлүүлсэн чинь буцааж өгөхгүй байна",
    notNonLegal: true,
  },
  {
    id: 4,
    message: "Нөхөр хүүхдээ аваад явчихсан",
    notNonLegal: true,
  },
  {
    id: 5,
    message: "Би гэрээ хийсэн юм, нэг заалт нь ойлгомжгүй байна",
    notNonLegal: true,
  },
  {
    id: 6,
    message: "Зам дээр машин мөргөлдсөн",
    notNonLegal: true,
  },
  {
    id: 7,
    message: "Татварын асуудал гарчихлаа",
    notNonLegal: true,
  },
  {
    id: 8,
    message: "Манай компанийн нэрийг өөр хүн ашиглаад байна",
    notNonLegal: true,
  },
  {
    id: 9,
    message: "Замын хөдөлгөөний осолд орсон",
    notNonLegal: true,
  },
  {
    id: 10,
    message: "Машин зарсан чинь мөнгөө өгөхгүй байна",
    notNonLegal: true,
  },
] as const;

describe("launch legal-situation matrix", () => {
  const engine = createLegalRelevanceEngine();

  it.each(LAUNCH_PHRASES.filter((item) => "notNonLegal" in item))(
    "does not reject phrase $id merely because legal terminology is absent",
    async (item) => {
      const result = await engine.classify({ message: item.message });
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
    },
  );

  it("keeps a movie question NON_LEGAL", async () => {
    const result = await engine.classify({
      message: "Өнөөдөр ямар кино үзэх вэ?",
    });
    expect(result.relevance).toBe(LegalRelevance.NON_LEGAL);
  });

  it("keeps a statute/article question LEGAL", async () => {
    const result = await engine.classify({
      message: "Эрүүгийн хуулийн 17.1 дүгээр зүйл юу гэж заасан бэ?",
    });
    expect(result.relevance).toBe(LegalRelevance.LEGAL);
  });
});
