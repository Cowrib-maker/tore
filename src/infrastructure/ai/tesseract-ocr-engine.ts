import {
  OCR_LANGUAGES,
  OCR_TIMEOUT_MS,
} from "@/application/ai/legal-ai-document.constants";
import { boundExtractedStructuredText } from "@/infrastructure/ai/docx-text-extractor";
import {
  assertOcrBytes,
  OcrTimeoutError,
  withOcrTimeout,
  type OcrEngine,
  type OcrRecognizeInput,
  type OcrRecognizeResult,
} from "@/infrastructure/ai/ocr-engine";

type TesseractWorkerLike = {
  recognize(image: Buffer): Promise<{
    data: { text?: string; confidence?: number };
  }>;
  terminate(): Promise<unknown>;
};

export type TesseractWorkerFactory = () => Promise<TesseractWorkerLike>;

/**
 * Real OCR via Tesseract WASM. No native binaries. No remote image URLs.
 * Traineddata `eng+mon` (Mongolian Cyrillic pack is genuine Tesseract `mon`).
 */
export class TesseractOcrEngine implements OcrEngine {
  private workerPromise: Promise<TesseractWorkerLike> | null = null;

  constructor(
    private readonly create: TesseractWorkerFactory = defaultCreateWorker,
    private readonly timeoutMs: number = OCR_TIMEOUT_MS,
  ) {}

  async recognize(input: OcrRecognizeInput): Promise<OcrRecognizeResult> {
    const bytes = assertOcrBytes(input);
    try {
      const worker = await this.ensureWorker();
      const recognized = await withOcrTimeout(
        worker.recognize(Buffer.from(bytes)),
        this.timeoutMs,
      );
      const text = boundExtractedStructuredText(recognized.data.text ?? "");
      const confidence =
        typeof recognized.data.confidence === "number"
          ? recognized.data.confidence
          : null;
      if (!text) {
        return { status: "EMPTY", text: "", confidence };
      }
      return { status: "OK", text, confidence };
    } catch (error) {
      if (error instanceof OcrTimeoutError) {
        await this.resetWorker();
        return { status: "FAILED", text: "", confidence: null, timedOut: true };
      }
      await this.resetWorker();
      return { status: "FAILED", text: "", confidence: null };
    }
  }

  private ensureWorker(): Promise<TesseractWorkerLike> {
    this.workerPromise ??= this.create();
    return this.workerPromise;
  }

  private async resetWorker(): Promise<void> {
    const pending = this.workerPromise;
    this.workerPromise = null;
    if (!pending) {
      return;
    }
    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // Worker may already be dead after a timeout/crash.
    }
  }
}

async function defaultCreateWorker(): Promise<TesseractWorkerLike> {
  const loaded = await import("tesseract.js");
  const createWorker =
    (loaded as { createWorker?: (langs?: string) => Promise<TesseractWorkerLike> })
      .createWorker ??
    (loaded as { default?: { createWorker: (langs?: string) => Promise<TesseractWorkerLike> } })
      .default?.createWorker;
  if (!createWorker) {
    throw new Error("tesseract.js createWorker is unavailable");
  }
  return createWorker(OCR_LANGUAGES);
}

let singleton: OcrEngine | undefined;

export function getOcrEngine(): OcrEngine {
  singleton ??= new TesseractOcrEngine();
  return singleton;
}
