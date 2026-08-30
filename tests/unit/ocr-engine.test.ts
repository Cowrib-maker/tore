import { describe, expect, it, vi } from "vitest";

import { OCR_TIMEOUT_MS } from "@/application/ai/legal-ai-document.constants";
import {
  assertOcrBytes,
  OcrTimeoutError,
  withOcrTimeout,
} from "@/infrastructure/ai/ocr-engine";
import { encodePngFromRaw } from "@/infrastructure/ai/png-from-raw";
import { TesseractOcrEngine } from "@/infrastructure/ai/tesseract-ocr-engine";

describe("OCR engine contract", () => {
  it("rejects non-byte inputs so remote URLs cannot be passed through", () => {
    expect(() =>
      assertOcrBytes({ bytes: undefined as unknown as Uint8Array }),
    ).toThrow(/Uint8Array/);
    expect(() => assertOcrBytes({ bytes: new Uint8Array() })).toThrow(/Uint8Array/);
  });

  it("marks timeout separately from a generic failure", async () => {
    await expect(
      withOcrTimeout(new Promise(() => undefined), 5),
    ).rejects.toBeInstanceOf(OcrTimeoutError);
  });
});

describe("TesseractOcrEngine", () => {
  it("returns OK text from a worker and does not put confidence into the text", async () => {
    const recognize = vi.fn(async (_image: Buffer) => ({
      data: { text: "Гэрээний 1-р зүйл\n\nSecond line", confidence: 91 },
    }));
    const engine = new TesseractOcrEngine(async () => ({
      recognize,
      terminate: vi.fn(async () => undefined),
    }));
    const result = await engine.recognize({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    expect(result.status).toBe("OK");
    expect(result.text).toContain("Гэрээний 1-р зүйл");
    expect(result.text).toContain("Second line");
    expect(result.text).not.toContain("91");
    expect(result.confidence).toBe(91);
    expect(recognize).toHaveBeenCalledWith(expect.any(Buffer));
    const passed = recognize.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(passed)).toBe(true);
    expect(Buffer.isBuffer(passed) && passed.toString("utf8")).not.toMatch(/^https?:\/\//);
  });

  it("returns EMPTY when the worker yields no text", async () => {
    const engine = new TesseractOcrEngine(async () => ({
      recognize: async () => ({ data: { text: "   ", confidence: 5 } }),
      terminate: async () => undefined,
    }));
    const result = await engine.recognize({ bytes: new Uint8Array([1, 2, 3]) });
    expect(result).toMatchObject({ status: "EMPTY", text: "" });
  });

  it("returns FAILED when the worker throws", async () => {
    const engine = new TesseractOcrEngine(async () => ({
      recognize: async () => {
        throw new Error("wasm boom");
      },
      terminate: async () => undefined,
    }));
    const result = await engine.recognize({ bytes: new Uint8Array([1, 2, 3]) });
    expect(result).toEqual({ status: "FAILED", text: "", confidence: null });
  });

  it("returns FAILED with timedOut when recognize exceeds the budget", async () => {
    const engine = new TesseractOcrEngine(
      async () => ({
        recognize: () => new Promise(() => undefined),
        terminate: async () => undefined,
      }),
      20,
    );
    const result = await engine.recognize({ bytes: new Uint8Array([1, 2, 3]) });
    expect(result.status).toBe("FAILED");
    expect(result.timedOut).toBe(true);
    expect(result.text).toBe("");
    expect(OCR_TIMEOUT_MS).toBe(25_000);
  });
});

describe("encodePngFromRaw", () => {
  it("writes a PNG signature for RGB pixels", () => {
    const png = encodePngFromRaw({
      data: Uint8Array.of(255, 0, 0),
      width: 1,
      height: 1,
      channels: 3,
    });
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
