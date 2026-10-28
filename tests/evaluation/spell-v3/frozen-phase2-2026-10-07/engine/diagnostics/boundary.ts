import { nounSuffixSurfaces } from "../morphology/inventory";
import { normalizeToken } from "../tokenizer/normalize";
import type { DiagnosticModule, LanguageDiagnostic, ModuleContext } from "./types";

/**
 * Word-boundary diagnostics: extra spaces, space before punctuation, duplicated words, glued words, split suffixes.
 * Everything is advisory-or-better and NEVER auto-applied. Ambiguous cases are reported with status AMBIGUOUS or not at all.
 */

/** Legitimate Mongolian reduplications and emphatic repeats: never reported as duplicates. */
const REDUPLICATION_OK = new Set(["дахин", "бага", "их", "олон", "сайн", "ямар", "хэн", "хэзээ", "хаана", "аажим", "удаан", "зарим", "хэдэн", "бүр", "тэр", "энэ", "нэг", "хоёр", "гурав", "өдөр", "жил", "сар", "цаг", "хүн", "газар", "мөн", "ч", "л", "өөр", "аль", "ямар", "тийм", "ингэж", "тэгж", "үнэхээр"]);

export class BoundaryModule implements DiagnosticModule {
  readonly id = "boundary";
  readonly version = "2026.10.1";
  private suffixOnly: Set<string> | undefined;

  analyze({ text, tokens, engine }: ModuleContext): LanguageDiagnostic[] {
    const out: LanguageDiagnostic[] = [];
    let n = 0;
    const push = (d: Omit<LanguageDiagnostic, "id" | "source" | "suggestionStatus"> & { suggestionStatus?: LanguageDiagnostic["suggestionStatus"] }) =>
      out.push({ suggestionStatus: d.suggestions.length > 0 ? "CONFIDENT" : "NONE", ...d, id: `boundary-${n++}`, source: this.id });

    // 1. extra spaces / space before punctuation
    tokens.forEach((t, i) => {
      if (t.kind === "SPACE" && !t.text.includes("\n")) {
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        if (prev && next && prev.kind !== "SPACE") {
          if (t.text.length > 1 && next.kind !== "SPACE" && /^[\t ]+$/u.test(t.text)) {
            push({ type: "WORD_BOUNDARY", verdict: "ADVISORY", severity: "INFO", range: t.range, original: t.text, message: "Илүү зай байна.", reason: "EXTRA_SPACE", suggestions: [{ text: " ", confidence: 0.9, reason: "TYPO_PAIR", evidence: ["whitespace-run"], autoApplySafe: false }] });
          }
          if (next.kind === "PUNCT" && /^[,.;:!?]$/u.test(next.text) && t.text.length >= 1 && prev.kind !== "PUNCT") {
            push({ type: "WORD_BOUNDARY", verdict: "ADVISORY", severity: "INFO", range: t.range, original: t.text, message: "Зураасны өмнө зай орхихгүй.", reason: "SPACE_BEFORE_PUNCTUATION", suggestions: [{ text: "", confidence: 0.85, reason: "TYPO_PAIR", evidence: ["space-before-punctuation"], autoApplySafe: false }] });
          }
        }
      }
    });

    // 2. duplicated words: «байна байна», «хуралдаан хуралдаан»
    const words = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.kind === "WORD");
    for (let k = 1; k < words.length; k += 1) {
      const a = words[k - 1]!;
      const b = words[k]!;
      if (b.i - a.i !== 2 || tokens[a.i + 1]!.kind !== "SPACE" || tokens[a.i + 1]!.text.includes("\n")) continue;
      const ka = normalizeToken(a.t.text);
      if (ka.length < 3 || ka !== normalizeToken(b.t.text) || REDUPLICATION_OK.has(ka)) continue;
      push({ type: "WORD_BOUNDARY", verdict: "ADVISORY", severity: "INFO", range: { start: tokens[a.i + 1]!.range.start, end: b.t.range.end }, original: text.slice(tokens[a.i + 1]!.range.start, b.t.range.end), message: "Давтагдсан үг байж магадгүй.", reason: "DUPLICATE_WORD", suggestions: [{ text: "", confidence: 0.6, reason: "TYPO_PAIR", evidence: ["adjacent-identical-words"], autoApplySafe: false }], suggestionStatus: "AMBIGUOUS" });
    }

    // 3. glued words: an UNKNOWN token that splits into two valid words in exactly one way
    for (const { t } of words) {
      const key = normalizeToken(t.text);
      if (key.length < 7 || t.caseShape === "UPPER") continue;
      const a = engine.analyzeToken(t);
      if (a.verdict !== "UNKNOWN") continue;
      const splits: [string, string][] = [];
      for (let i = 3; i <= key.length - 3; i += 1) {
        const l = key.slice(0, i);
        const r = key.slice(i);
        // both halves must be real HEADWORDS (not merely analyzable fragments such as a verb stem), or нээгдэнэ would «split» into нээгд + энэ
        const head = (w: string) => engine.lexicon.lookup(w).some((e) => e.conf !== "LOW" && e.layer !== "ABBREVIATION" && e.layer !== "PROPER_NOUN");
        if (head(l) && head(r)) splits.push([l, r]);
      }
      if (splits.length === 1) {
        const [l, r] = splits[0]!;
        const cased = t.caseShape === "TITLE" ? `${l.charAt(0).toUpperCase()}${l.slice(1)}` : l;
        push({ type: "WORD_BOUNDARY", verdict: "ADVISORY", severity: "INFO", range: t.range, original: t.text, message: "Хоёр үг залгагдсан байж магадгүй.", reason: "GLUED_WORDS", suggestions: [{ text: `${cased} ${r}`, confidence: 0.55, reason: "TYPO_PAIR", evidence: ["unique-valid-split"], autoApplySafe: false }], suggestionStatus: "AMBIGUOUS" });
      }
    }

    // 4. split suffix: «хууль ийн» → «хуулийн»
    this.suffixOnly ??= new Set(nounSuffixSurfaces().filter((s) => s.length >= 2));
    for (let k = 1; k < words.length; k += 1) {
      const a = words[k - 1]!;
      const b = words[k]!;
      if (b.i - a.i !== 2 || tokens[a.i + 1]!.text !== " ") continue;
      const suf = normalizeToken(b.t.text);
      if (!this.suffixOnly.has(suf) || b.t.caseShape !== "LOWER" || engine.isValid(suf)) continue;
      const stem = normalizeToken(a.t.text);
      if (a.t.caseShape === "UPPER" || !engine.isValid(stem)) continue;
      // join with the stem alternation the suffix needs: хууль+ийн → хуулийн (ь drops), ажил+ын → ажлын (vowel elides)
      const forms = new Set([stem + suf]);
      if (stem.endsWith("ь") && suf.startsWith("и")) forms.add(stem.slice(0, -1) + suf);
      const elided = stem.replace(/([бвгджзклмнпрстфхцчшщ])[аэиоуөү]([бвгджзклмнпрстфхцчшщ])$/u, "$1$2");
      if (elided !== stem && /^[аэиоуөүяеёю]/u.test(suf)) forms.add(elided + suf);
      const valid = [...forms].filter((f) => engine.isValid(f));
      if (valid.length !== 1) continue; // none, or ambiguous: say nothing
      const cased = a.t.caseShape === "TITLE" ? valid[0]!.charAt(0).toUpperCase() + valid[0]!.slice(1) : valid[0]!;
      push({ type: "WORD_BOUNDARY", verdict: "ADVISORY", severity: "INFO", range: { start: a.t.range.start, end: b.t.range.end }, original: text.slice(a.t.range.start, b.t.range.end), message: "Нөхцөл үгээсээ тусдаа бичигдсэн байна.", reason: "SPLIT_SUFFIX", suggestions: [{ text: cased, confidence: 0.7, reason: "TYPO_PAIR", evidence: ["suffix-only-token", "joined-form-valid"], autoApplySafe: false }] });
    }
    return out;
  }
}
