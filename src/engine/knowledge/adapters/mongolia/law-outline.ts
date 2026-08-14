import {
  CanonicalUnitRole,
  type CanonicalOutlineUnit,
} from "../../canonical";

type ClassifiedLine =
  | {
      kind: "part";
      display: string;
      number: string;
      heading: string | null;
      original: string;
    }
  | {
      kind: "chapter";
      display: string;
      number: string;
      heading: string | null;
      original: string;
    }
  | {
      kind: "section";
      display: string;
      number: string;
      heading: string | null;
      original: string;
    }
  | {
      kind: "article";
      display: string;
      number: string;
      heading: string | null;
      original: string;
    }
  | {
      kind: "paragraph";
      display: string;
      article: string;
      paragraph: string;
      original: string;
    }
  | {
      kind: "subparagraph";
      display: string;
      article: string;
      paragraph: string;
      subparagraph: string;
      original: string;
    }
  | {
      kind: "item";
      display: string;
      article?: string;
      paragraph?: string;
      subparagraph?: string;
      item: string;
      original: string;
    }
  | { kind: "text"; original: string };

/**
 * Mongolian statute line classification (drafting conventions, not a website).
 */
export function mongolianLawOutline(lines: string[]): CanonicalOutlineUnit[] {
  const units: CanonicalOutlineUnit[] = [];
  for (const line of lines) {
    if (isBoilerplate(line) || isDocumentTitleLine(line)) {
      continue;
    }
    units.push(toUnit(classifyLine(line)));
  }
  return units;
}

export function inferMongolianLawTitle(lines: string[]): string | null {
  const named = lines.find(
    (line) => /ТУХАЙ\s*$/.test(line) && !isBoilerplate(line),
  );
  if (named) {
    return named;
  }
  return lines.find((line) => !isBoilerplate(line) && line.length > 8) ?? null;
}

export function inferMongolianInstrumentClass(
  title: string,
  lines: string[],
): "CONSTITUTION" | "CODE" | "STATUTE" | "AMENDMENT" | "OTHER" {
  const haystack = `${title}\n${lines.slice(0, 8).join("\n")}`;
  if (/үндсэн\s+хууль/i.test(haystack)) {
    return "CONSTITUTION";
  }
  if (/шинэчилсэн\s+найруулга/i.test(haystack) || /хууль/i.test(haystack)) {
    return "STATUTE";
  }
  return "OTHER";
}

function toUnit(classified: ClassifiedLine): CanonicalOutlineUnit {
  if (classified.kind === "text") {
    return {
      role: CanonicalUnitRole.TEXT,
      text: classified.original,
      display: classified.original,
      heading: null,
      number: null,
    };
  }
  if (classified.kind === "paragraph") {
    return {
      role: CanonicalUnitRole.PARAGRAPH,
      text: classified.original,
      display: classified.display,
      heading: null,
      number: classified.paragraph,
      article: classified.article,
      paragraph: classified.paragraph,
    };
  }
  if (classified.kind === "subparagraph") {
    return {
      role: CanonicalUnitRole.SUBPARAGRAPH,
      text: classified.original,
      display: classified.display,
      heading: null,
      number: classified.subparagraph,
      article: classified.article,
      paragraph: classified.paragraph,
      subparagraph: classified.subparagraph,
    };
  }
  if (classified.kind === "item") {
    return {
      role: CanonicalUnitRole.ITEM,
      text: classified.original,
      display: classified.display,
      heading: null,
      number: classified.item,
      article: classified.article,
      paragraph: classified.paragraph,
      subparagraph: classified.subparagraph,
      item: classified.item,
    };
  }
  if (classified.kind === "part") {
    return {
      role: CanonicalUnitRole.PART,
      text: classified.original,
      display: classified.display,
      heading: classified.heading,
      number: classified.number,
    };
  }
  if (classified.kind === "chapter") {
    return {
      role: CanonicalUnitRole.CHAPTER,
      text: classified.original,
      display: classified.display,
      heading: classified.heading,
      number: classified.number,
    };
  }
  if (classified.kind === "section") {
    return {
      role: CanonicalUnitRole.SECTION,
      text: classified.original,
      display: classified.display,
      heading: classified.heading,
      number: classified.number,
    };
  }
  return {
    role: CanonicalUnitRole.ARTICLE,
    text: classified.original,
    display: classified.display,
    heading: classified.heading,
    number: classified.number,
  };
}

function classifyLine(line: string): ClassifiedLine {
  const part = line.match(/^([IVXLCDM]+)\s*ХЭСЭГ(?:\s+(.+))?$/i);
  if (part) {
    const number = String(romanToInt(part[1] ?? "I"));
    return {
      kind: "part",
      display: line,
      number,
      heading: emptyToNull(part[2]),
      original: line,
    };
  }

  const subsection = line.match(/^(.+?)\s+ДЭД\s+БҮЛЭГ(?:\s+(.+))?$/i);
  if (subsection) {
    const ordinal = subsection[1] ?? "";
    return {
      kind: "section",
      display: line,
      number: chapterOrdinalToNumber(ordinal) ?? ordinal,
      heading: emptyToNull(subsection[2]),
      original: line,
    };
  }

  const chapterOrdinal = line.match(/^(.+?)\s+БҮЛЭГ(?:\s+(.+))?$/i);
  if (chapterOrdinal && !/ДЭД/i.test(chapterOrdinal[1] ?? "")) {
    const ordinal = chapterOrdinal[1] ?? "";
    const numeric = ordinal.match(/^(\d+)$/);
    return {
      kind: "chapter",
      display: line,
      number: numeric?.[1] ?? chapterOrdinalToNumber(ordinal) ?? ordinal,
      heading: emptyToNull(chapterOrdinal[2]),
      original: line,
    };
  }

  const chapterNumeric = line.match(
    /^(\d+)\s*(?:дүгээр|дугаар)\s+бүлэг(?:\s*[.:,-]?\s*(.*))?$/i,
  );
  if (chapterNumeric) {
    return {
      kind: "chapter",
      display: line,
      number: chapterNumeric[1] ?? "1",
      heading: emptyToNull(chapterNumeric[2]),
      original: line,
    };
  }

  const article = line.match(
    /^(\d+)\s*(?:дүгээр|дугаар)\s+зүйл\s*\.?\s*(.*)$/i,
  );
  if (article) {
    const number = article[1] ?? "1";
    return {
      kind: "article",
      display: line,
      number,
      heading: emptyToNull(article[2]),
      original: line,
    };
  }

  const numbered = line.match(/^(\d+(?:\.\d+){1,3})\.(.*)$/);
  if (numbered && !looksLikeDate(numbered[1] ?? "")) {
    const parts = (numbered[1] ?? "").split(".");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        kind: "paragraph",
        display: numbered[1] ?? "",
        article: parts[0],
        paragraph: parts[1],
        original: line,
      };
    }
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      return {
        kind: "subparagraph",
        display: numbered[1] ?? "",
        article: parts[0],
        paragraph: parts[1],
        subparagraph: parts[2],
        original: line,
      };
    }
    if (parts.length === 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
      return {
        kind: "item",
        display: numbered[1] ?? "",
        article: parts[0],
        paragraph: parts[1],
        subparagraph: parts[2],
        item: parts[3],
        original: line,
      };
    }
  }

  const letter = line.match(/^(?:\/([а-яёөүэ])\/|([а-яёөүэ])\))\s*(.*)$/iu);
  if (letter) {
    const item = letter[1] ?? letter[2] ?? "";
    return {
      kind: "item",
      display: item,
      item,
      original: line,
    };
  }

  return { kind: "text", original: line };
}

function isBoilerplate(line: string): boolean {
  return (
    /^МОНГОЛ\s+УЛСЫН\s+ХУУЛЬ$/i.test(line) ||
    /^\/Шинэчилсэн найруулга\/$/i.test(line) ||
    /^Pdf$/i.test(line) ||
    /^Word$/i.test(line) ||
    /^Хэвлэх$/i.test(line) ||
    /^Нэмэлт өөрчлөлт/i.test(line)
  );
}

function isDocumentTitleLine(line: string): boolean {
  return /ТУХАЙ\s*$/.test(line);
}

function looksLikeDate(token: string): boolean {
  return /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(token);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function romanToInt(roman: string): number {
  const map: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  const chars = roman.toUpperCase().split("");
  let total = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const current = map[chars[index] ?? ""] ?? 0;
    const next = map[chars[index + 1] ?? ""] ?? 0;
    total += current < next ? -current : current;
  }
  return total || 1;
}

const CHAPTER_BASE_ORDINALS: [string, number][] = [
  ["АРВАН ЕС", 19],
  ["АРВАН НАЙМ", 18],
  ["АРВАН ДОЛОО", 17],
  ["АРВАН ДОЛ", 17],
  ["АРВАН ЗУРГАА", 16],
  ["АРВАН ТАВ", 15],
  ["АРВАН ДӨРӨВ", 14],
  ["АРВАН ГУРАВ", 13],
  ["АРВАН ХОЁР", 12],
  ["АРВАН НЭГ", 11],
  ["АРАВ", 10],
  ["ЕС", 9],
  ["НАЙМ", 8],
  ["ДОЛОО", 7],
  ["ДОЛ", 7],
  ["ЗУРГАА", 6],
  ["ТАВ", 5],
  ["ДӨРӨВ", 4],
  ["ГУРАВ", 3],
  ["ХОЁР", 2],
  ["НЭГ", 1],
];

function chapterOrdinalToNumber(raw: string): string | null {
  const compact = raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*(?:ДҮГЭЭР|ДУГААР)\s*$/u, "")
    .trim();
  for (const [token, value] of CHAPTER_BASE_ORDINALS) {
    if (compact === token) {
      return String(value);
    }
  }
  return null;
}
