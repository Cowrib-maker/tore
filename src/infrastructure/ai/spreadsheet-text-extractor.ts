import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";
import {
  listZipEntries,
  readZipTextEntry,
  ZipReadError,
} from "@/domain/documents/zip-reader";

export type SpreadsheetExtractStatus = "OK" | "EMPTY" | "FAILED";

export type SpreadsheetExtractResult = {
  status: SpreadsheetExtractStatus;
  text: string;
  pageCount: null;
};

export type SpreadsheetTextExtractor = {
  extract(body: Uint8Array): Promise<SpreadsheetExtractResult>;
};

/**
 * Native .xlsx text extractor. XLSX is a ZIP of OOXML "SpreadsheetML" parts —
 * this reads xl/workbook.xml (sheet names + order), xl/_rels/workbook.xml.rels
 * (sheet name -> worksheet part), xl/sharedStrings.xml (shared string table),
 * and each xl/worksheets/sheetN.xml (row/cell values), and renders every
 * sheet as a "|"-delimited text table. No spreadsheet library dependency —
 * built on the shared hand-rolled zip-reader (also used to tell .docx/.xlsx/.pptx
 * apart at upload time), and on
 * regex extraction of a small, fixed, machine-generated XML shape (OOXML
 * writers never hand-author this XML, so it is reliably well-formed).
 *
 * Deliberately does not resolve number formats (dates/currency render as
 * the raw stored number, not a formatted string) or formulas (only their
 * last calculated value, when Excel wrote one) — good enough for an AI
 * reading the data, not a spreadsheet engine.
 */
export class OoxmlSpreadsheetTextExtractor implements SpreadsheetTextExtractor {
  async extract(body: Uint8Array): Promise<SpreadsheetExtractResult> {
    try {
      const entries = listZipEntries(body);
      const workbookXml = readZipTextEntry(body, entries, "xl/workbook.xml");
      if (!workbookXml) {
        return { status: "FAILED", text: "", pageCount: null };
      }
      const relsXml = readZipTextEntry(
        body,
        entries,
        "xl/_rels/workbook.xml.rels",
      );
      const sharedStringsXml = readZipTextEntry(
        body,
        entries,
        "xl/sharedStrings.xml",
      );
      const sharedStrings = sharedStringsXml
        ? parseSharedStrings(sharedStringsXml)
        : [];

      const sheets = resolveSheets(workbookXml, relsXml, entries.map((e) => e.name));
      if (sheets.length === 0) {
        return { status: "EMPTY", text: "", pageCount: null };
      }

      const blocks: string[] = [];
      for (const sheet of sheets) {
        const sheetXml = readZipTextEntry(body, entries, sheet.path);
        if (!sheetXml) continue;
        const table = renderSheetTable(sheetXml, sharedStrings);
        if (!table) continue;
        blocks.push(`### Хуудас: ${sheet.name}\n${table}`);
      }

      const combined = blocks.join("\n\n").trim();
      if (!combined) {
        return { status: "EMPTY", text: "", pageCount: null };
      }
      return {
        status: "OK",
        text: combined.slice(0, MAX_DOCUMENT_EXTRACT_CHARS),
        pageCount: null,
      };
    } catch (error) {
      if (error instanceof ZipReadError) {
        return { status: "FAILED", text: "", pageCount: null };
      }
      return { status: "FAILED", text: "", pageCount: null };
    }
  }
}

type ResolvedSheet = { name: string; path: string };

/** Sheet tab order + display name from workbook.xml, mapped to their worksheet part via rels. */
function resolveSheets(
  workbookXml: string,
  relsXml: string | null,
  zipEntryNames: readonly string[],
): ResolvedSheet[] {
  const relTargetById = new Map<string, string>();
  if (relsXml) {
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
      const tag = match[0];
      const id = attr(tag, "Id");
      const target = attr(tag, "Target");
      if (id && target) {
        relTargetById.set(id, target.replace(/^\/?xl\//, ""));
      }
    }
  }

  const worksheetFiles = zipEntryNames
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  const declared: ResolvedSheet[] = [];
  let index = 0;
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/gi)) {
    const tag = match[0];
    const name = decodeXmlEntities(attr(tag, "name") ?? `Хуудас ${index + 1}`);
    const rId = attr(tag, "r:id") ?? attr(tag, "id");
    const targetFromRels = rId ? relTargetById.get(rId) : undefined;
    const path = targetFromRels
      ? `xl/${targetFromRels}`
      : worksheetFiles[index];
    if (path) {
      declared.push({ name, path });
    }
    index += 1;
  }

  if (declared.length > 0) {
    return declared;
  }
  // No <sheet> declarations resolved (unexpected workbook.xml shape) — fall
  // back to worksheet files in numeric order with generic names.
  return worksheetFiles.map((path, i) => ({
    name: `Хуудас ${i + 1}`,
    path,
  }));
}

function parseSharedStrings(xml: string): string[] {
  const values: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) {
    const inner = match[1] ?? "";
    let text = "";
    for (const t of inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)) {
      text += t[1] ?? "";
    }
    values.push(decodeXmlEntities(text));
  }
  return values;
}

/** Base-26 column letters ("A", "Z", "AA", ...) -> zero-based column index. */
function columnIndexFromCellRef(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/i)?.[0] ?? "";
  let index = 0;
  for (const ch of letters.toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
}

function renderSheetTable(sheetXml: string, sharedStrings: string[]): string {
  const sheetDataMatch = sheetXml.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/i);
  const sheetData = sheetDataMatch?.[1] ?? "";
  const lines: string[] = [];

  for (const rowMatch of sheetData.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const rowXml = rowMatch[1] ?? "";
    const cells = new Map<number, string>();
    let maxCol = -1;

    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
      const attrs = cellMatch[1] ?? "";
      const cellInner = cellMatch[2] ?? "";
      const cellRef = attr(`<c ${attrs}>`, "r");
      const type = attr(`<c ${attrs}>`, "t");
      const col = cellRef ? columnIndexFromCellRef(cellRef) : maxCol + 1;
      const value = cellValue(type, cellInner, sharedStrings);
      if (value !== "") {
        cells.set(col, value);
      }
      if (col > maxCol) maxCol = col;
    }

    if (cells.size === 0) continue;
    const rowCells: string[] = [];
    for (let c = 0; c <= maxCol; c += 1) {
      rowCells.push(cells.get(c) ?? "");
    }
    while (rowCells.length > 0 && rowCells[rowCells.length - 1] === "") {
      rowCells.pop();
    }
    if (rowCells.length > 0) {
      lines.push(rowCells.join(" | "));
    }
  }

  return lines.join("\n");
}

function cellValue(
  type: string | null,
  cellInner: string,
  sharedStrings: string[],
): string {
  if (type === "inlineStr") {
    const t = cellInner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
    return decodeXmlEntities(t?.[1] ?? "");
  }
  const v = cellInner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
  if (!v) return "";
  if (type === "s") {
    // Shared-string table entries are decoded once, in parseSharedStrings.
    const index = Number(v);
    return sharedStrings[index] ?? "";
  }
  if (type === "b") {
    return v === "1" ? "TRUE" : "FALSE";
  }
  // "str" (formula string result), "n"/untyped (number), or anything else:
  // the <v> text itself is already the display-ready value.
  return decodeXmlEntities(v);
}

/** Read one double-quoted XML attribute value from a raw start-tag string. */
function attr(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`${escaped}="([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&amp;/g, "&");
}

let singleton: SpreadsheetTextExtractor | undefined;

export function getSpreadsheetTextExtractor(): SpreadsheetTextExtractor {
  singleton ??= new OoxmlSpreadsheetTextExtractor();
  return singleton;
}
