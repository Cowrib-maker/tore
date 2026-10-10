import { describe, expect, it } from "vitest";
import { lex } from "../../src/spell-engine/tokenizer/lexer";
import { lex as lexPhase2 } from "../evaluation/spell-v3/frozen-phase2-2026-10-07/engine/tokenizer/lexer";
import { PASSAGES } from "../evaluation/spell-v3/authoring/passages";
import { loadCleanLines } from "../evaluation/spell-v1/run-benchmark";

/** The Phase-3 lexer fast paths must be behaviour-identical to the frozen Phase-2 lexer (offset-exact, same kinds, same case shapes). */
describe("lexer: performance fast paths are behaviour-identical to Phase 2", () => {
  const corpus = [
    ...PASSAGES.flatMap((p) => p.sentences),
    ...loadCleanLines(),
    "Б.Болд, Ч.Ж.Дорж болон УИХ-ын гишүүн 2026.10.05-нд https://tore.mn/хууль?x=1 хаягаар info@tore.mn руу бичив.",
    "«хурим»-ыг, 2012-д, №12-ыг, +976 9911 2233, #хууль @болд `код` C:\\Users\\a\\b.txt ~/x/y/z",
    "т ө р ө л, х ү м үү с, Apple-ийн iPhone15 WiFi 5G, ёс-заншил, Нью-Йорк, 3,5 12:30 😀 x",
    "ГАЗАР газар Газар гАзАр А я Я ӨӨ өө Үү ү",
  ];
  it("on every authored / committed sample", () => {
    for (const t of corpus) expect(lex(t), t).toEqual(lexPhase2(t));
  });
  it("on 3,000 seeded random strings mixing scripts, digits, punctuation, symbols", () => {
    let seed = 20261008;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const alphabet = "абвгдеёжзийклмнопрстуфхцчшщъыьэюяөүАБВГДӨҮЯ abcXYZ0123456789 .,;:!?-—'’\"«»()[]/\\@#№+%_~`\n\t…😀";
    for (let k = 0; k < 3000; k += 1) {
      let s = "";
      const len = 1 + Math.floor(rnd() * 60);
      for (let j = 0; j < len; j += 1) s += Array.from(alphabet)[Math.floor(rnd() * Array.from(alphabet).length)]!;
      const a = lex(s);
      expect(a, JSON.stringify(s)).toEqual(lexPhase2(s));
      expect(a.map((x) => x.text).join("")).toBe(s);
    }
  });
});
