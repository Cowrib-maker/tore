/**
 * Server-side OCR port. Implementations MUST accept only in-memory bytes
 * (never a remote URL, filesystem path, or client storage key).
 */

export type OcrRecognizeStatus = "OK" | "EMPTY" | "FAILED";

export type OcrRecognizeInput = {
  bytes: Uint8Array;
};

export type OcrRecognizeResult = {
  status: OcrRecognizeStatus;
  text: string;
  /** 0–100 when the engine exposes it. Never written into extracted text. */
  confidence: number | null;
  timedOut?: boolean;
};

export type OcrEngine = {
  recognize(input: OcrRecognizeInput): Promise<OcrRecognizeResult>;
};

export class OcrTimeoutError extends Error {
  constructor(message = "OCR timed out") {
    super(message);
    this.name = "OcrTimeoutError";
  }
}

export function assertOcrBytes(input: OcrRecognizeInput): Uint8Array {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new TypeError("OCR input must be a non-empty Uint8Array");
  }
  return input.bytes;
}

export async function withOcrTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new OcrTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
