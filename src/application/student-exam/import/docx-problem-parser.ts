import { createHash } from "node:crypto";

import { defaultRubric } from "@/domain/student/exam/rubric";
import type {
  ExamArea,
  ExamCitation,
  ReviewFlag,
  ReviewStatus,
  Rubric,
  SourceLocator,
} from "@/domain/student/exam/types";

/**
 * Splits the plain text of one source DOCX (as produced by mammoth.extractRawText) into problems.
 *
 * Fidelity rules: statement, question and model-answer paragraphs are copied VERBATIM (only line breaks between paragraphs are
 * normalised). Nothing is corrected, modernised or reconciled. Whatever the parser is unsure about becomes a review flag, and a
 * problem whose structure is uncertain is held back from students (status NEEDS_REVIEW) rather than guessed.
 */

export type ParsedProblem = {
  area: ExamArea;
  sourceFile: string;
  sourceKey: string;
  ordinal: number;
  ordinalLabel: string;
  statement: string;
  questions: string[];
  modelAnswer: string | null;
  answerOutline: string[];
  legalProvisions: ExamCitation[];
  courtCitations: ExamCitation[];
  rubric: Rubric;
  flags: ReviewFlag[];
  reviewStatus: ReviewStatus;
  locator: SourceLocator;
  /** Hash of the statement only: detects the same problem appearing twice. */
  statementHash: string;
  /** Hash of everything source-derived: detects a changed source on re-import. */
  contentHash: string;
};

export type SkippedBlock = {
  heading: string;
  /** Only an exact duplicate (same statement, questions and answer) is ever left out of the import. */
  reason: "DUPLICATE_STATEMENT";
  line: number;
  excerpt: string;
  /** Ordinal of the problem this block duplicates, when known. */
  duplicateOf?: number;
};

export type ParseResult = {
  area: ExamArea;
  sourceFile: string;
  problems: ParsedProblem[];
  skipped: SkippedBlock[];
};

const HEADING = /^Бодлого[\s-]*(\d+)\s*[:.]?\s*$/i;
const ANSWER_MARKER =
  /^(?:Бодлого[\s-]*\d+[\s-]*(?:ийн|ын|ний|ны)?[\s-]*)?(?:жишиг|жишгэ)\s+(?:хариулт|харилт)\s*[:.]?\s*/i;
// The marker must be followed by ":" or "." (so a sentence that merely starts with the word "Асуулт" is not a marker).
const QUESTION_MARKER = /^(?:Асуулт|Бодлогын\s+асуулт|Шийдвэрлэх\s+асуудал)\s*\d*\s*[:.]/i;
const NUMBERED = /^\d+\s*[.)]\s/;
// JavaScript's \b only knows ASCII word characters, so Cyrillic word ends are checked with a Unicode lookahead instead.
const OUTLINE_HEADING =
  /^(?:Зорилт|Бодолтын\s+процесс|Бодолт|Тайлбар|Аргачлал|Хариулт\s*\d*|Нэг|Хоёр|Гурав|Дөрөв|Тав|Зургаа|Долоо|Найм|Ес|Арав)(?![\p{L}])[.:)]?|^[IVX]{1,4}\.\s|^\d+\)\s/iu;
const MIXED_SCRIPT_TOKEN = /(?=\S*[A-Za-z])(?=\S*[А-Яа-яЁёӨөҮү])\S+/;
const OLD_LAW_PATTERNS = [
  /(?<![\p{L}])ЭБШ(?![\p{L}])/u, // abbreviation of the criminal procedure law that has since been replaced
  /ЭХ-ийн/, // abbreviation used with the previous Criminal Code numbering
  /Эрүүгийн\s+хууль\.?\s*(?:19\d\d|200\d|2002)/,
];
const SHORT_ANSWER_CHARS = 300;

/** Markers are matched on NFC-normalised text (some sources store "й" as "и" + a combining mark); stored text stays verbatim. */
const nfc = (s: string) => s.normalize("NFC");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

function paragraphsOf(text: string): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (t) out.push({ text: t, line: i + 1 });
  });
  return out;
}

function extractProvisions(text: string): ExamCitation[] {
  const re =
    /(?:[\p{Lu}][\p{L}\-]*\s+)(?:[\p{L}\-]+\s+){0,2}?хуулийн(?:\s+тусгай\s+ангийн)?\s+\d+(?:\.\d+)*(?:-р)?(?:\s*(?:дугаар|дүгээр|дүгэр))?\s*зүйл|ЭХ-ийн\s+\d+(?:\.\d+)*\s*(?:дугаар|дүгээр|дүгэр)?\s*зүйл/gu;
  const seen = new Set<string>();
  const out: ExamCitation[] = [];
  for (const m of text.matchAll(re)) {
    const t = normalize(m[0]);
    if (!seen.has(t)) {
      seen.add(t);
      out.push({ text: t, origin: "SOURCE_PATTERN" });
    }
  }
  return out;
}

function extractCourtCitations(text: string): ExamCitation[] {
  const re = /(?:УДШ-ийн\s+тогтоол|Улсын\s+дээд\s+шүүхийн\s+(?:тогтоол|тайлбар|2\d{3}\s+оны))[^\n;]{0,160}/gu;
  const seen = new Set<string>();
  const out: ExamCitation[] = [];
  for (const m of text.matchAll(re)) {
    const t = normalize(m[0]);
    if (!seen.has(t)) {
      seen.add(t);
      out.push({ text: t, origin: "SOURCE_PATTERN" });
    }
  }
  return out;
}

export function parseProblemDocument(rawText: string, area: ExamArea, sourceFile: string): ParseResult {
  const paras = paragraphsOf(rawText);
  const headingIdx: number[] = [];
  paras.forEach((p, i) => {
    if (HEADING.test(nfc(p.text))) headingIdx.push(i);
  });

  const problems: ParsedProblem[] = [];
  const skipped: SkippedBlock[] = [];
  const ordinalSeen = new Map<number, number>();
  const statementSeen = new Map<string, { ordinal: number; hashes: Set<string> }>();

  headingIdx.forEach((start, h) => {
    const end = h + 1 < headingIdx.length ? headingIdx[h + 1]! : paras.length;
    const heading = paras[start]!.text;
    const ordinal = Number(HEADING.exec(nfc(heading))![1]);
    const body = paras.slice(start + 1, end);
    const flags = new Set<ReviewFlag>();

    const occurrence = (ordinalSeen.get(ordinal) ?? 0) + 1;
    ordinalSeen.set(ordinal, occurrence);
    if (occurrence > 1) flags.add("DUPLICATE_ORDINAL");

    const answerIdx = body.findIndex((p) => ANSWER_MARKER.test(nfc(p.text).slice(0, 90)) && /жишиг|жишгэ/i.test(nfc(p.text).slice(0, 40)));
    const questionIdx = body.findIndex((p, i) => QUESTION_MARKER.test(nfc(p.text)) && (answerIdx < 0 || i < answerIdx));

    // A repeated heading whose block has neither a question nor an answer (e.g. a stray note) is NOT dropped: it is imported as
    // its own record, flagged DUPLICATE_ORDINAL + missing markers, and held back from students until a reviewer decides.

    let statementParas: typeof body;
    let questionParas: typeof body = [];
    let answerParas: typeof body = [];

    if (answerIdx >= 0) {
      const beforeAnswer = body.slice(0, answerIdx);
      if (questionIdx >= 0) {
        statementParas = beforeAnswer.slice(0, questionIdx);
        questionParas = beforeAnswer.slice(questionIdx);
      } else {
        flags.add("NO_QUESTION_MARKER");
        statementParas = beforeAnswer;
      }
      const marker = ANSWER_MARKER.exec(nfc(body[answerIdx]!.text))!;
      const firstAnswer = { ...body[answerIdx]!, text: body[answerIdx]!.text.slice(marker[0].length).trim() };
      answerParas = [...(firstAnswer.text ? [firstAnswer] : []), ...body.slice(answerIdx + 1)];
      if (answerParas.length === 0) flags.add("EMPTY_MODEL_ANSWER");
    } else {
      flags.add("NO_ANSWER_MARKER");
      if (questionIdx >= 0) {
        statementParas = body.slice(0, questionIdx);
        let q = questionIdx + 1;
        while (q < body.length && NUMBERED.test(body[q]!.text)) q++;
        questionParas = body.slice(questionIdx, q);
        answerParas = body.slice(q); // boundary uncertain: kept for the reviewer, never shown to students
      } else {
        flags.add("NO_QUESTION_MARKER");
        statementParas = body;
      }
    }

    const statement = statementParas.map((p) => p.text).join("\n\n");
    const questions = questionParas.map((p) => p.text);
    const modelAnswer = answerParas.length > 0 ? answerParas.map((p) => p.text).join("\n\n") : null;
    if (!statement) flags.add("EMPTY_STATEMENT");
    if (modelAnswer !== null && modelAnswer.length < SHORT_ANSWER_CHARS) flags.add("MODEL_ANSWER_TRUNCATED_OR_SHORT");

    const everything = [statement, ...questions, modelAnswer ?? ""].join("\n");
    if (MIXED_SCRIPT_TOKEN.test(everything)) flags.add("OCR_NOISE_SUSPECTED");
    if (OLD_LAW_PATTERNS.some((re) => re.test(everything))) flags.add("POSSIBLY_OUTDATED_LAW");

    const statementHash = sha(normalize(statement));
    const contentHash = sha(JSON.stringify([statement, questions, modelAnswer]));
    const seen = statement ? statementSeen.get(statementHash) : undefined;
    if (seen && seen.hashes.has(contentHash)) {
      // Byte-for-byte the same statement, questions and answer as an earlier problem: nothing is lost by not importing it twice.
      skipped.push({
        heading,
        reason: "DUPLICATE_STATEMENT",
        line: paras[start]!.line,
        excerpt: normalize(statement).slice(0, 200),
        duplicateOf: seen.ordinal,
      });
      return;
    }
    // Same statement but different questions/answer: both are kept and the later one is flagged for a reviewer.
    if (seen) flags.add("DUPLICATE_STATEMENT");
    if (statement) {
      if (seen) seen.hashes.add(contentHash);
      else statementSeen.set(statementHash, { ordinal, hashes: new Set([contentHash]) });
    }

    const hardFlags: ReviewFlag[] = ["NO_ANSWER_MARKER", "NO_QUESTION_MARKER", "EMPTY_STATEMENT", "DUPLICATE_ORDINAL", "EMPTY_MODEL_ANSWER", "DUPLICATE_STATEMENT"];
    const reviewStatus: ReviewStatus = hardFlags.some((f) => flags.has(f)) ? "NEEDS_REVIEW" : "IMPORTED";

    const answerText = modelAnswer ?? "";
    const outline = answerParas
      .map((p) => p.text)
      .filter((t) => t.length <= 90 && OUTLINE_HEADING.test(nfc(t)));

    const sourceKey = sha(`${sourceFile}|${area}|${ordinal}|${occurrence}`).slice(0, 32);
    problems.push({
      area,
      sourceFile,
      sourceKey,
      ordinal,
      ordinalLabel: heading,
      statement,
      questions,
      modelAnswer,
      answerOutline: outline,
      legalProvisions: extractProvisions(answerText),
      courtCitations: extractCourtCitations(answerText),
      rubric: defaultRubric(),
      flags: [...flags],
      reviewStatus,
      locator: {
        heading,
        page: null,
        paragraphStart: paras[start]!.line,
        paragraphEnd: (end > start + 1 ? paras[end - 1]! : paras[start]!).line,
      },
      statementHash,
      contentHash,
    });
  });

  return { area, sourceFile, problems, skipped };
}
