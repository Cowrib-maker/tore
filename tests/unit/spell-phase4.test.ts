import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSpellEngineV1 } from "@/spell-engine";
import { DesktopSpellSession, type DictionaryDoc } from "../../desktop/core/spell-session";
import { MemoryStore } from "../../desktop/core/store";

const engine = createSpellEngineV1();

describe("phase 4: protected content is never flagged (even with unknown reporting on)", () => {
  const PROTECTED = [
    "Хуулийн 12.3.4-д заасан", "№12/А тогтоол", "ХХК-ийн дүрэм", "Python болон iPhone", "2024 оны 10 дугаар сарын 7",
    "#хэштаг ба @user", "цаг 10:30-д", "50% буюу 100,000₮", "D:\\docs\\тайлан.docx", "www.tore.mn/spell?x=1",
    "ТТ-2024/15 дугаар", "ISO 9001:2015", "УИХ-ын гишүүн", "МУ-ын Үндсэн хууль", "a.b@c.mn", "Ж.Баяр, Б.Сараа",
    "COVID-19 вирус", "https://tore.mn/хууль", "A4 цаас", "3.5 сая", "1-р сар", "XVII зуун",
  ];
  for (const text of PROTECTED) {
    it(`«${text}»`, () => expect(engine.analyze(text, { reportUnknown: true }).issues).toEqual([]));
  }
});

describe("phase 4: Latin look-alikes inside Cyrillic words are corrected only when the repair is a real word", () => {
  for (const [typed, fixed] of [["сaйн", "сайн"], ["Mонгол", "Монгол"], ["оpон", "орон"], ["хуyль", "хууль"]] as const) {
    it(`${typed} → ${fixed}`, () => {
      const issue = engine.analyze(`Энэ ${typed} нь`).issues[0];
      expect(issue?.verdict).toBe("MISSPELLED");
      expect(issue?.suggestions[0]?.text).toBe(fixed);
      expect(issue?.autoApplySafe).toBe(false);
    });
  }
  it("a pure Latin identifier is left alone", () => expect(engine.analyze("Энэ xyzabc нь", { reportUnknown: true }).issues).toEqual([]));
});

describe("phase 4: document-scale checking", () => {
  const para = "Манай сургуулын захирал өнөөдөр хуралд оролцлоо. Хуулийн заалт байна, надэд хэлсэн.";
  const doc = Array.from({ length: 400 }, (_, i) => `${para} ${i}`).join("\n"); // ≈ 35k chars
  const mk = () => new DesktopSpellSession(createSpellEngineV1(), new MemoryStore<DictionaryDoc>(), { isEntitled: async () => true });

  it("a cached re-check equals the first check, and editing one paragraph changes only its own issues", async () => {
    const s = mk();
    const a = await s.check(doc);
    const b = await s.check(doc);
    if (a.locked || b.locked) throw new Error("locked");
    expect(b.issues).toEqual(a.issues);
    expect(a.issues.length).toBeGreaterThan(400);
    for (const i of a.issues) expect(doc.slice(i.range.start, i.range.end)).toBe(i.token);
    const lines = doc.split("\n");
    lines[200] = "Надад хэлсэн.";
    const c = await s.check(lines.join("\n"));
    if (c.locked) throw new Error("locked");
    expect(c.issues.length).toBeLessThan(a.issues.length);
  });

  it("a one-paragraph edit in a 35k-character document re-checks quickly (loose bound, not a benchmark)", async () => {
    const s = mk();
    await s.check(doc);
    const lines = doc.split("\n");
    const t0 = performance.now();
    lines[100] += " а";
    await s.check(lines.join("\n"));
    expect(performance.now() - t0).toBeLessThan(250);
  });

  it("personal dictionary words are respected, removable, and never override the system vocabulary", async () => {
    const s = mk();
    await s.check("Бүлжирэн.", { reportUnknown: true });
    s.addToDictionary("Бүлжирэн");
    const r1 = await s.check("Бүлжирэн.", { reportUnknown: true });
    if (r1.locked) throw new Error("locked");
    expect(r1.issues).toEqual([]);
    expect(s.removeFromDictionary("Бүлжирэн")).toBe(true);
    const r2 = await s.check("Бүлжирэн.", { reportUnknown: true });
    if (r2.locked) throw new Error("locked");
    expect(r2.issues.length).toBe(1);
    // a user word that equals a misspelling is allowed (it is the user's choice) but only changes THEIR verdicts
    expect(createSpellEngineV1().analyze("Энэ надэд нь").issues[0]?.verdict).toBe("MISSPELLED");
  });
});

describe("phase 4: desktop product identity and data survive updates", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../desktop/package.json"), "utf8"));
  it("keeps a stable application identity and never deletes user data on uninstall", () => {
    expect(pkg.build.appId).toBe("mn.tore.spell");
    expect(pkg.build.productName).toBe("TORE Spell");
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
  });
  it("the renderer cannot reach the network (CSP default-src none) and loads no remote script", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../desktop/app/renderer/index.html"), "utf8");
    expect(html).toMatch(/default-src 'none'/);
    expect(html).not.toMatch(/https?:\/\//);
  });
  it("the renderer inserts engine text with textContent only (no innerHTML / eval)", () => {
    const js = fs.readFileSync(path.resolve(__dirname, "../../desktop/app/renderer/renderer.js"), "utf8").replace(/\/\/.*$/gm, "");
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
  });
});
