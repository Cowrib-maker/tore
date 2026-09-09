import { inflateRawSync } from "node:zlib";

/**
 * Minimal read-only ZIP archive reader (central-directory + local-header
 * parsing, DEFLATE/store decompression via Node's built-in zlib). No new
 * dependency: OOXML files (.docx/.xlsx/.pptx) are all ZIP archives, and this
 * is enough to pull named entries (e.g. "xl/worksheets/sheet1.xml") out of
 * one without a general-purpose archive library.
 *
 * Not a general ZIP implementation: no zip64, no encryption, no streaming.
 * Sufficient for OOXML parts, which are always small, unencrypted, and use
 * plain DEFLATE or store.
 */

export type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export class ZipReadError extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_FIXED_SIZE = 22;
const MAX_COMMENT_SIZE = 65_535;

function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  );
}

function findEndOfCentralDirectory(buf: Uint8Array): number {
  if (buf.byteLength < EOCD_FIXED_SIZE) {
    throw new ZipReadError("File too small to be a zip archive");
  }
  const searchStart = Math.max(
    0,
    buf.byteLength - EOCD_FIXED_SIZE - MAX_COMMENT_SIZE,
  );
  for (let i = buf.byteLength - EOCD_FIXED_SIZE; i >= searchStart; i -= 1) {
    if (readU32LE(buf, i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new ZipReadError("End-of-central-directory record not found");
}

/** List every entry in the archive's central directory. */
export function listZipEntries(buf: Uint8Array): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const entryCount = readU16LE(buf, eocdOffset + 10);
  const centralDirOffset = readU32LE(buf, eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (
      offset + 46 > buf.byteLength ||
      readU32LE(buf, offset) !== CENTRAL_DIR_SIGNATURE
    ) {
      throw new ZipReadError("Malformed central directory entry");
    }
    const compressionMethod = readU16LE(buf, offset + 10);
    const compressedSize = readU32LE(buf, offset + 20);
    const uncompressedSize = readU32LE(buf, offset + 24);
    const nameLength = readU16LE(buf, offset + 28);
    const extraLength = readU16LE(buf, offset + 30);
    const commentLength = readU16LE(buf, offset + 32);
    const localHeaderOffset = readU32LE(buf, offset + 42);
    const nameBytes = buf.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Decompress one entry's data by walking to its local file header. */
export function readZipEntryData(buf: Uint8Array, entry: ZipEntry): Uint8Array {
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > buf.byteLength ||
    readU32LE(buf, offset) !== LOCAL_HEADER_SIGNATURE
  ) {
    throw new ZipReadError("Malformed local file header");
  }
  const nameLength = readU16LE(buf, offset + 26);
  const extraLength = readU16LE(buf, offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return new Uint8Array(inflateRawSync(compressed));
  }
  throw new ZipReadError(
    `Unsupported zip compression method ${entry.compressionMethod}`,
  );
}

/** Convenience: find one entry by exact archive-internal path and decode it as UTF-8 text. */
export function readZipTextEntry(
  buf: Uint8Array,
  entries: readonly ZipEntry[],
  name: string,
): string | null {
  const entry = entries.find((item) => item.name === name);
  if (!entry) {
    return null;
  }
  return new TextDecoder("utf-8").decode(readZipEntryData(buf, entry));
}
