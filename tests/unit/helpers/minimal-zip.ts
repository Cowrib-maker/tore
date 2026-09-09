import { deflateRawSync } from "node:zlib";

/**
 * Minimal valid (real EOCD + central directory, not just a "PK" prefix)
 * in-memory ZIP builder for OOXML test fixtures. Every listed file is
 * DEFLATE-compressed, matching how real Office/LibreOffice writers save.
 */
export function buildMinimalZip(
  files: readonly { name: string; content: string }[],
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const contentBytes = new TextEncoder().encode(file.content);
    const compressed = deflateRawSync(contentBytes);
    const crc = crc32(contentBytes);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(contentBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, compressed);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(contentBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + compressed.byteLength;
  }

  const localSection = concat(localParts);
  const centralSection = concat(centralParts);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSection.byteLength),
    u32(localSection.byteLength),
    u16(0),
  ]);
  return concat([localSection, centralSection, eocd]);
}

// A real .docx fixture already exists in ./minimal-docx (mammoth-verified,
// reused by document-text-extractor.test.ts) — use that one instead of
// duplicating a second docx builder here.

/** A tiny but structurally real .xlsx: one sheet, one shared-string cell. */
export function buildMinimalXlsx(cellText = "Hello TORE"): Uint8Array {
  return buildMinimalZip([
    {
      name: "xl/workbook.xml",
      content:
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: "xl/sharedStrings.xml",
      content: `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>${cellText}</t></si></sst>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content:
        '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>',
    },
  ]);
}

/** A tiny but structurally real .pptx: just enough for ppt/presentation.xml to be found. */
export function buildMinimalPptx(): Uint8Array {
  return buildMinimalZip([
    {
      name: "ppt/presentation.xml",
      content:
        '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
    },
  ]);
}

function u16(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}

function u32(n: number): Uint8Array {
  return Uint8Array.of(
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
