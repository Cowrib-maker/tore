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
export function mongolianLawOutline(
  lines: string[],
): CanonicalOutlineUnit[] {
  const units: CanonicalOutlineUnit[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index]?.trim() ?? "";

    if (!normalized) {
      continue;
    }

    // LegalInfo UI / page chrome
    if (isBoilerplate(normalized)) {
      continue;
    }

    // Document title
    if (isDocumentTitleLine(normalized)) {
      continue;
    }

    // Date / location / enactment header
    if (isDocumentHeaderLine(normalized)) {
      continue;
    }

    // Signing authorities at the end of the document
    if (isSignatureLine(normalized)) {
      continue;
    }

    units.push(toUnit(classifyLine(normalized)));
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
  const normalized = line.trim();

  // ─────────────────────────────────────────────
  // PART
  // Example:
  // I ХЭСЭГ
  // II ХЭСЭГ ЕРӨНХИЙ ҮНДЭСЛЭЛ
  // ─────────────────────────────────────────────
  const part = normalized.match(
    /^([IVXLCDM]+)\s+ХЭСЭГ(?:\s+(.+))?$/iu,
  );

  if (part) {
    const number = String(romanToInt(part[1] ?? "I"));

    return {
      kind: "part",
      display: normalized,
      number,
      heading: emptyToNull(part[2]),
      original: normalized,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION
  // Example:
  // НЭГДҮГЭЭР ДЭД БҮЛЭГ
  // ─────────────────────────────────────────────
  const subsection = normalized.match(
    /^(.+?)\s+ДЭД\s+БҮЛЭГ(?:\s+(.+))?$/iu,
  );

  if (subsection) {
    const ordinal = subsection[1] ?? "";

    return {
      kind: "section",
      display: normalized,
      number: mongolianOrdinalToNumber(ordinal) ?? ordinal,
      heading: emptyToNull(subsection[2]),
      original: normalized,
    };
  }

  // ─────────────────────────────────────────────
  // CHAPTER
  // Example:
  // НЭГДҮГЭЭР БҮЛЭГ
  // 1 БҮЛЭГ
  // ─────────────────────────────────────────────
  const chapterOrdinal = normalized.match(
    /^(.+?)\s+БҮЛЭГ(?:\s+(.+))?$/iu,
  );

  if (
    chapterOrdinal &&
    !/ДЭД/iu.test(chapterOrdinal[1] ?? "")
  ) {
    const ordinal = chapterOrdinal[1] ?? "";
    const numeric = ordinal.match(/^(\d+)$/);

    return {
      kind: "chapter",
      display: normalized,
      number:
        numeric?.[1] ??
        mongolianOrdinalToNumber(ordinal) ??
        ordinal,
      heading: emptyToNull(chapterOrdinal[2]),
      original: normalized,
    };
  }

  const chapterNumeric = normalized.match(
    /^(\d+)\s*(?:дүгээр|дугаар)\s+бүлэг(?:\s*[.:,-]?\s*(.*))?$/iu,
  );

  if (chapterNumeric) {
    return {
      kind: "chapter",
      display: normalized,
      number: chapterNumeric[1] ?? "1",
      heading: emptyToNull(chapterNumeric[2]),
      original: normalized,
    };
  }

  // ─────────────────────────────────────────────
  // ARTICLE
  //
  // 17 дугаар зүйл.
  // 17.1 дүгээр зүйл.
  // ─────────────────────────────────────────────
  const articleDotted = normalized.match(
    /^(\d+)\.(\d+)\s*(?:дүгээр|дугаар)\s+зүйл\s*\.?\s*(.*)$/iu,
  );

  if (articleDotted) {
    const number = `${articleDotted[1]}.${articleDotted[2]}`;

    return {
      kind: "article",
      display: normalized,
      number,
      heading: emptyToNull(articleDotted[3]),
      original: normalized,
    };
  }

  const articleNumeric = normalized.match(
    /^(\d+)\s*(?:дүгээр|дугаар)\s+зүйл\s*\.?\s*(.*)$/iu,
  );

  if (articleNumeric) {
    return {
      kind: "article",
      display: normalized,
      number: articleNumeric[1] ?? "1",
      heading: emptyToNull(articleNumeric[2]),
      original: normalized,
    };
  }

  // ─────────────────────────────────────────────
  // ARTICLE BY ORDINAL WORD
  // Example:
  // Нэгдүгээр зүйл.
  // Хорьдугаар зүйл.
  // ─────────────────────────────────────────────
  const articleOrdinal = normalized.match(
    /^(.+?)\s+зүйл\s*\.?\s*(.*)$/iu,
  );

  if (articleOrdinal) {
    const number = mongolianOrdinalToNumber(articleOrdinal[1] ?? "");

    if (number) {
      return {
        kind: "article",
        display: normalized,
        number,
        heading: emptyToNull(articleOrdinal[2]),
        original: normalized,
      };
    }
  }

  // ─────────────────────────────────────────────
  // NUMERIC LEGALINFO FORMAT
  //
  // 1. ...
  // 1.1. ...
  // 1.1.1. ...
  // 1.1.1.1. ...
  //
  // IMPORTANT:
  // LegalInfo дээр "1." нь ARTICLE,
  // "1.1." нь PARAGRAPH,
  // "1.1.1." нь SUBPARAGRAPH,
  // "1.1.1.1." нь ITEM.
  // ─────────────────────────────────────────────
  const numbered = normalized.match(
  /^(\d+(?:\.\d+){0,3})\s*(?:\.\s*|[\/)]\s*)(.*)$/,
);
  if (
    numbered &&
    !looksLikeDate(numbered[1] ?? "")
  ) {
    const number = numbered[1] ?? "";
    const original = normalized;
    const parts = number.split(".");

    // 1. text
    if (
      parts.length === 1 &&
      parts[0]
    ) {
      return {
        kind: "article",
        display: number,
        number: parts[0],
        heading: null,
        original,
      };
    }

    // 1.1. text
    if (
      parts.length === 2 &&
      parts[0] &&
      parts[1]
    ) {
      return {
        kind: "paragraph",
        display: number,
        article: parts[0],
        paragraph: parts[1],
        original,
      };
    }

    // 1.1.1. text
    if (
      parts.length === 3 &&
      parts[0] &&
      parts[1] &&
      parts[2]
    ) {
      return {
        kind: "subparagraph",
        display: number,
        article: parts[0],
        paragraph: parts[1],
        subparagraph: parts[2],
        original,
      };
    }

    // 1.1.1.1. text
    if (
      parts.length === 4 &&
      parts[0] &&
      parts[1] &&
      parts[2] &&
      parts[3]
    ) {
      return {
        kind: "item",
        display: number,
        article: parts[0],
        paragraph: parts[1],
        subparagraph: parts[2],
        item: parts[3],
        original,
      };
    }
  }

  // ─────────────────────────────────────────────
  // LETTER ITEMS
  //
  // а/ ...
  // б/ ...
  // в/ ...
  // г/ ...
  // д/ ...
  //
  // мөн:
  // а) ...
  // б) ...
  // ─────────────────────────────────────────────
  const letter = normalized.match(
    /^([а-яёөүғқһ])\s*[\/)]\s*(.*)$/iu,
  );

  if (letter) {
    const item = letter[1] ?? "";

    return {
      kind: "item",
      display: item,
      item,
      original: normalized,
    };
  }

  return {
    kind: "text",
    original: normalized,
  };
}
function isBoilerplate(line: string): boolean {
  const normalized = line.trim();

  return (
    // LegalInfo page chrome
    /^Хуваалцах$/iu.test(normalized) ||
    /^Хэвлэх$/iu.test(normalized) ||
    /^Pdf$/iu.test(normalized) ||
    /^Word$/iu.test(normalized) ||

    // Generic LegalInfo labels
    /^МОНГОЛ\s+УЛСЫН\s+ХУУЛЬ$/iu.test(normalized) ||
    /^\/Шинэчилсэн\s+найруулга\/$/iu.test(normalized) ||
    /^Нэмэлт\s+өөрчлөлт/iu.test(normalized)
  );
}
function isDocumentHeaderLine(line: string): boolean {
  const normalized = line.trim();

  if (/^Улаанбаатар\s+хот$/iu.test(normalized)) {
    return true;
  }

  if (
    /^\d{4}\s+оны?\s+\d{1,2}\s+(?:дүгээр|дугаар)\s+сарын\s+\d{1,2}(?:-ны|-ний)?\s+өдөр$/iu.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /^БҮГД\s+НАЙРАМДАХ\s+МОНГОЛ\s+АРД\s+УЛСЫН\s+ХУУЛЬ$/iu.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}
function isSignatureLine(line: string): boolean {
  const normalized = line.trim();

  return (
    /^(?:МОНГОЛ\s+УЛСЫН|БНМАУ-ЫН)\s+(?:ИХ|БАГА)\s+ХУРЛЫН\s+.*\bДАРГА\b/iu.test(
      normalized,
    ) ||
    /^(?:МОНГОЛ\s+УЛСЫН|БНМАУ-ЫН)\s+ИХ\s+ХУРЛЫН\s+ТАМГЫН\s+ГАЗРЫН\s+.*ДАРГА/iu.test(
      normalized,
    )
  );
}
function isDocumentTitleLine(line: string): boolean {
  const normalized = line.trim();

  return (
    /ТУХАЙ\s*$/iu.test(normalized) ||
    /ТУХАЙ\s+ХУУЛЬ\s*$/iu.test(normalized)
  );
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

const ONES: Record<string, number> = {
  НЭГ: 1,
  ХОЁР: 2,
  ГУРАВ: 3,
  ДӨРӨВ: 4,
  ТАВ: 5,
  ЗУРГАА: 6,
  ЗУРГА: 6,
  ДОЛОО: 7,
  ДОЛ: 7,
  НАЙМ: 8,
  ЕС: 9,
};

const TENS_STANDALONE: Record<string, number> = {
  АРАВ: 10,
  ХОРЬ: 20,
  ГУЧ: 30,
  ДӨЧ: 40,
  ТАВЬ: 50,
  ЖАР: 60,
  ДАЛ: 70,
  НАЯ: 80,
  ЕР: 90,
};

const TENS_PREFIX: [string, number][] = [
  ["АРВАН", 10],
  ["ХОРИН", 20],
  ["ГУЧИН", 30],
  ["ДӨЧИН", 40],
  ["ТАВИН", 50],
  ["ЖАРАН", 60],
  ["ДАЛАН", 70],
  ["НАЯН", 80],
  ["ЕРЭН", 90],
];

/**
 * Mongolian word ordinals used in chapter/article headings
 * ("Нэгдүгээр", "Арван хоёрдугаар", "Хорьдугаар", …).
 */
function mongolianOrdinalToNumber(raw: string): string | null {
  let compact = raw
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  // LegalInfo occasionally emits noise like "Арван ес 1 дүгээр".
  compact = compact.replace(/\s+\d+(?:\s*(?:ДҮГЭЭР|ДУГААР))?$/u, "").trim();
  compact = compact.replace(/\s*(?:ДҮГЭЭР|ДУГААР)\s*$/u, "").trim();
  if (!compact) {
    return null;
  }

  const tensAlone = TENS_STANDALONE[compact];
  if (tensAlone != null) {
    return String(tensAlone);
  }
  const oneAlone = ONES[compact];
  if (oneAlone != null) {
    return String(oneAlone);
  }

  for (const [prefix, tens] of TENS_PREFIX) {
    if (compact === prefix) {
      return String(tens);
    }
    if (compact.startsWith(`${prefix} `)) {
      const rest = compact.slice(prefix.length + 1).trim();
      const one = ONES[rest];
      if (one != null) {
        return String(tens + one);
      }
    }
  }
  return null;
}
