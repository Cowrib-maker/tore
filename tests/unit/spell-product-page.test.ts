import { describe, expect, it } from "vitest";

import { isProtectedAppRoute } from "@/domain/services/rbac";
import { en } from "@/i18n/dictionaries/en";
import { ko } from "@/i18n/dictionaries/ko";
import { mn } from "@/i18n/dictionaries/mn";
import { zh } from "@/i18n/dictionaries/zh";

describe("TORE Spell public product copy", () => {
  it("every locale carries the full copy (ko/zh fall back to English explicitly)", () => {
    for (const d of [mn, en, ko, zh]) {
      expect(d.spell.features.items).toHaveLength(6);
      expect(d.spell.home.name).toBe("TORE Spell");
      expect(d.spell.pricing.durations).toHaveLength(4);
    }
  });

  it("uses the mandated Mongolian positioning, support line and relationship statement", () => {
    expect(mn.spell.meta.title).toBe("TORE Spell — Монгол хэлний зөв бичих болон найруулгын алдаа шалгагч");
    expect(mn.spell.hero.title).toBe("Монгол хэлний зөв бичих болон найруулгын алдаа шалгагч");
    expect(mn.spell.hero.support).toBe("Бичих явцад алдааг таньж, зөв хувилбар санал болгоно.");
    expect(mn.spell.relation.statement).toBe(
      "TORE Spell нь TORE.MN-ийн хууль зүйн платформоос тусдаа бүтээгдэхүүн бөгөөд Монгол хэлээр ажиллахад зориулсан desktop алдаа шалгагч юм.",
    );
    expect(mn.spell.pricing.title).toBe("Үнэ удахгүй");
    expect(mn.spell.hero.primaryCta).toBe("Бета хувилбарыг үзэх");
  });

  it("makes no claim the beta cannot back (no accuracy numbers, no integrations, no prices, no AI rewriting)", () => {
    const text = JSON.stringify([mn.spell, en.spell]);
    expect(text).not.toMatch(/100\s*%|\d+\s*%/);
    expect(text).not.toMatch(/Microsoft|MS Word|Word-|Google Docs|системийн хэмжээнд|system-wide/);
    expect(text).not.toMatch(/₮|төгрөг|MNT|\$\s?\d|\d\s?(USD|EUR)/i);
    expect(text).not.toMatch(/AI-?аар|AI rewrit|rewrit|хиймэл оюун/i);
    expect(text).not.toMatch(/авах\b.*checkout|худалдан авах бол/i);
  });

  it("states the beta limits and that stylistic checking and macOS are NOT available yet", () => {
    const roadmap = mn.spell.roadmap.items.map((i) => i.description).join(" ");
    expect(roadmap).toMatch(/ороогүй/);
    expect(roadmap).toMatch(/зөвхөн Windows/);
    expect(mn.spell.beta.points.join(" ")).toMatch(/дижитал гарын үсэггүй/);
  });

  it("/spell is a public route (not behind login)", () => {
    expect(isProtectedAppRoute("/spell")).toBe(false);
  });
});
