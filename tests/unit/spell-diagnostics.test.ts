import { describe, expect, it } from "vitest";
import { BoundaryModule, CapitalizationModule, DiagnosticPipeline, createSpellEngineV1, scoreCandidate, publicReason, type LanguageDiagnostic } from "@/spell-engine";

const engine = createSpellEngineV1();
const pipe = new DiagnosticPipeline(engine, [new BoundaryModule(), new CapitalizationModule()]);
const byReason = (ds: LanguageDiagnostic[], r: string) => ds.filter((d) => d.reason === r);

describe("diagnostics pipeline: unified, offset-exact, pluggable", () => {
  it("every diagnostic range points at its original text", () => {
    const text = "Хуулын  заалт байна байна. номынсан .  хууль ийн тухай. бат ирлээ";
    for (const d of pipe.diagnose(text, { reportUnknown: true })) expect(text.slice(d.range.start, d.range.end), d.reason).toBe(d.original);
  });
  it("spelling findings carry type, public reason, evidence and explainable scores; nothing is auto-applied", () => {
    const [d] = pipe.diagnose("Хуулын заалт.");
    expect(d).toMatchObject({ type: "MORPHOLOGY", verdict: "MISSPELLED", reason: "INVALID_SUFFIX", source: "spell" });
    const s = d!.suggestions[0]!;
    expect(s.text).toBe("Хуулийн");
    expect(s.autoApplySafe).toBe(false);
    expect(s.evidence).toContain("repair-is-valid-word");
    expect(s.scores!.combined).toBeGreaterThan(0.5);
    expect(s.scores!.context).toBeNull(); // no context model loaded: reported as absent, not invented
  });
  it("public reason codes are the documented vocabulary", () => {
    expect(publicReason("LEXICON", "VALID", "GENERAL")).toBe("KNOWN_VALID");
    expect(publicReason("LEXICON", "VALID", "LEGAL")).toBe("VALID_DOMAIN_TERM");
    expect(publicReason("MORPHOLOGY", "VALID", "GENERAL")).toBe("VALID_MORPHOLOGY");
    expect(publicReason("PROTECTED_PROPER_NOUN", "VALID")).toBe("KNOWN_PROPER_NOUN");
    expect(publicReason("HARMONY_SUFFIX", "MISSPELLED")).toBe("INVALID_HARMONY");
    expect(publicReason("NOT_IN_LEXICON", "UNKNOWN")).toBe("UNKNOWN_WORD");
  });
  it("score breakdown components are 0..1 or null, deterministic", () => {
    const a = scoreCandidate(engine, "хууын", "хууль");
    const b = scoreCandidate(engine, "хууын", "хууль");
    expect(a).toEqual(b);
    for (const v of Object.values(a)) if (v !== null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });
});

describe("boundary module", () => {
  it("reports extra spaces and space before punctuation, never touching newlines/indentation", () => {
    const ds = pipe.diagnose("Хууль  тогтоох , байгууллага.\n    Дараагийн мөр");
    expect(byReason(ds, "EXTRA_SPACE")).toHaveLength(1);
    expect(byReason(ds, "SPACE_BEFORE_PUNCTUATION")).toHaveLength(1);
  });
  it("duplicated words are advisory; legitimate reduplication is not reported", () => {
    expect(byReason(pipe.diagnose("Хурал эхэллээ эхэллээ маш"), "DUPLICATE_WORD")).toHaveLength(1);
    expect(byReason(pipe.diagnose("Дахин дахин ярилаа. Олон олон хүн."), "DUPLICATE_WORD")).toHaveLength(0);
    expect(byReason(pipe.diagnose("байна\nбайна"), "DUPLICATE_WORD")).toHaveLength(0); // across a line break: not adjacent text
  });
  it("a glued word with exactly one valid split is offered as AMBIGUOUS, never confident", () => {
    const ds = byReason(pipe.diagnose("Манай номынсан нээгдлээ."), "GLUED_WORDS");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.suggestions[0]!.text).toBe("номын сан");
    expect(ds[0]!.suggestionStatus).toBe("AMBIGUOUS");
    expect(ds[0]!.suggestions[0]!.autoApplySafe).toBe(false);
  });
  it("valid words are never reported as glued", () => {
    expect(byReason(pipe.diagnose("Хуулийн хэрэгжилтийн тухай"), "GLUED_WORDS")).toHaveLength(0);
  });
  it("a suffix written apart from its word is offered as a join", () => {
    const ds = byReason(pipe.diagnose("Энэ хууль ийн заалт."), "SPLIT_SUFFIX");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.suggestions[0]!.text).toBe("хуулийн");
    expect(byReason(pipe.diagnose("Би гэр рүү явна."), "SPLIT_SUFFIX")).toHaveLength(0);
  });
});

describe("capitalization module", () => {
  it("flags a lower-case sentence start after a real sentence end", () => {
    const ds = byReason(pipe.diagnose("Хурал дууслаа. маргааш үргэлжилнэ."), "SENTENCE_START_LOWERCASE");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.type).toBe("CAPITALIZATION");
    expect(ds[0]!.suggestions[0]!.text).toBe("Маргааш");
  });
  it("does not treat abbreviations, initials, decimals or list lines as sentence ends", () => {
    for (const t of ["Албан бичиг, г.м. мөн", "Д. сүхбаатар ирлээ", "Үнэ 3. сайн гэсэн", "жагсаалт:\nхууль\nшүүх"]) {
      expect(byReason(pipe.diagnose(t), "SENTENCE_START_LOWERCASE"), t).toHaveLength(0);
    }
  });
  it("a known proper name in lower case is advisory with the proper form; ordinary words are untouched", () => {
    const ds = byReason(pipe.diagnose("Бид улаанбаатар хотод байна."), "PROPER_NOUN_LOWERCASE");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.suggestions[0]!.text).toBe("Улаанбаатар");
    expect(byReason(pipe.diagnose("Хууль тогтоох байгууллага."), "PROPER_NOUN_LOWERCASE")).toHaveLength(0);
  });
  it("ALL-CAPS and mixed-case text is never rewritten", () => {
    expect(pipe.diagnose("ХУРАЛ ДУУСЛАА. УИХ-ын тогтоол iPhone").filter((d) => d.type === "CAPITALIZATION")).toHaveLength(0);
  });
});

describe("pluggability (grammar / punctuation / style can be added without touching the core)", () => {
  it("a custom module's diagnostics are merged, sorted and range-checked with the spelling ones", () => {
    const custom = {
      id: "style-demo",
      version: "0",
      analyze: ({ text }: { text: string }): LanguageDiagnostic[] => {
        const i = text.indexOf("маш");
        return i < 0 ? [] : [{ id: "s0", type: "STYLE", verdict: "ADVISORY", severity: "INFO", range: { start: i, end: i + 3 }, original: "маш", message: "demo", reason: "CONTEXTUAL_ANOMALY", suggestions: [], suggestionStatus: "NONE", source: "style-demo" }];
      },
    };
    const p = new DiagnosticPipeline(engine, [custom as never]);
    const ds = p.diagnose("Хуулын маш чухал.");
    expect(ds.map((d) => d.source)).toEqual(["spell", "style-demo"]);
    expect(p.moduleVersions).toEqual({ "style-demo": "0" });
  });
});
