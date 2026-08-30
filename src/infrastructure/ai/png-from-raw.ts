import { deflateSync } from "node:zlib";

/**
 * Encode raw grayscale/RGB/RGBA pixels as an uncompressed-filter PNG.
 * Used to feed unpdf extractImages output into OCR without native canvas/sharp.
 */
export function encodePngFromRaw(input: {
  data: Uint8Array;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
}): Uint8Array {
  const { width, height, channels } = input;
  if (width <= 0 || height <= 0 || width > 16_384 || height > 16_384) {
    throw new RangeError("Invalid PNG dimensions");
  }
  const expected = width * height * channels;
  if (input.data.byteLength < expected) {
    throw new RangeError("Raw image buffer is shorter than width*height*channels");
  }

  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    raw.set(
      input.data.subarray(y * stride, y * stride + stride),
      rowStart + 1,
    );
  }

  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const idat = deflateSync(raw);

  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const payload = concat([typeBytes, data]);
  const out = new Uint8Array(4 + payload.byteLength + 4);
  writeU32(out, 0, data.byteLength);
  out.set(payload, 4);
  writeU32(out, 4 + payload.byteLength, crc32(payload));
  return out;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function concat(parts: Uint8Array[]): Uint8Array {
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
