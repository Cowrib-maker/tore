import { describe, expect, it } from "vitest";

import { createSpellEngineV1 } from "@/spell-engine";
import { isProtectedAppRoute } from "@/domain/services/rbac";
import { en } from "@/i18n/dictionaries/en";
import { ko } from "@/i18n/dictionaries/ko";
import { mn } from "@/i18n/dictionaries/mn";
import { zh } from "@/i18n/dictionaries/zh";

describe("TORE Spell public product copy", () => {
  it("every locale carries the same short structure (ko/zh fall back to English explicitly)", () => {
    for (const d of [mn, en, ko, zh]) {
      expect(d.spell.features.items).toHaveLength(4);
      expect(d.spell.steps.items).toHaveLength(4);
      expect(d.spell.home.name).toBe("TORE Spell");
      expect(d.spell.pricing.durations).toHaveLength(4);
    }
  });

  it("uses the mandated Mongolian positioning and the four core benefits", () => {
    expect(mn.spell.meta.title).toBe("TORE Spell — Монгол хэлний зөв бичгийн алдаа шалгагч");
    expect(mn.spell.hero.title).toBe("Монгол хэлний зөв бичгийн алдаа шалгагч");
    expect(mn.spell.hero.support).toBe("Бичиж байх үедээ алдааг таньж, зөв хувилбар санал болгоно.");
    expect(mn.spell.features.items.map((i) => i.title)).toEqual([
      "Зөв бичгийн алдаа шалгана",
      "Зөв хувилбар санал болгоно",
      "Хувийн толь",
      "Компьютер дээр ажиллана",
    ]);
    expect(mn.spell.steps.items.map((i) => i.title)).toEqual(["Худалдан авах", "Суулгах", "Код оруулах", "Ашиглах"]);
    expect(mn.spell.pricing.durations).toEqual(["1 сар", "3 сар", "6 сар", "1 жил"]);
  });

  it("keeps benefit descriptions to one short sentence", () => {
    for (const d of [mn, en]) for (const i of d.spell.features.items) expect(i.description.length).toBeLessThanOrEqual(80);
  });

  it("removed engineering / defensive wording from the public page", () => {
    const text = JSON.stringify([mn.spell, en.spell]);
    expect(text).not.toMatch(/Тодорхойгүй|Бидний амлалт|UNKNOWN|Unknown|найруулгын/);
    expect(text).not.toMatch(/\bAI\b|хиймэл оюун|революц|next-generation|cutting-edge|seamless/i);
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/Microsoft|MS Word|Google Docs|системийн хэмжээнд|system-wide/);
    // Prices are server configuration, never copy.
    expect(text).not.toMatch(/\d[\d\s,.]*\s?(₮|төгрөг|MNT|USD|EUR)|\$\s?\d/i);
  });

  it("the example on the page is real: the shipped engine flags the shown word and suggests the shown fix", () => {
    for (const d of [mn, en]) {
      const { mockText, mockWrong, mockRight } = d.spell.hero;
      const r = createSpellEngineV1().analyze(mockText);
      const issue = r.issues.find((i) => i.token === mockWrong);
      expect(issue?.verdict).toBe("MISSPELLED");
      expect(issue?.suggestionStatus).toBe("CONFIDENT");
      expect(issue?.suggestions[0]?.text).toBe(mockRight);
    }
  });

  it("/spell is a public route (not behind login)", () => {
    expect(isProtectedAppRoute("/spell")).toBe(false);
  });
});
