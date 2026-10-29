import mammoth from "mammoth";

import { MAX_DOCUMENT_EXTRACT_CHARS } from "@/application/ai/legal-ai-document.constants";

export type DocxExtractStatus = "OK" | "EMPTY" | "FAILED";

export type DocxExtractResult = {
  status: DocxExtractStatus;
  text: string;
  pageCount: null;
  timedOut?: boolean;
};

export type DocxTextExtractor = {
  extract(body: Uint8Array): Promise<DocxExtractResult>;
};

/** Bounded so a slow/pathological real-world DOCX fails fast and
 * recoverably instead of leaving the attachment tile spinning until the
 * platform's own function timeout (up to 300s) eventually kills the
 * request — see MammothDocxTextExtractor's doc comment. */
export const DOCX_EXTRACT_TIMEOUT_MS = 20_000;

export class DocxExtractTimeoutError extends Error {
  constructor(message = "DOCX extraction timed out") {
    super(message);
    this.name = "DocxExtractTimeoutError";
  }
}

async function withDocxTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new DocxExtractTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * mammoth's default `convertImage` reads every embedded image and inlines
 * it as a base64 data URI in the output HTML. htmlToStructuredText's own
 * tag-stripping regex (`<[^>]+>`) discards every `<img>` element anyway —
 * extracted text never needs image bytes — so the default behavior is pure
 * wasted work: real-world DOCX files (unlike this module's own synthetic
 * test fixtures) routinely embed a letterhead, signature scan, or photo
 * exhibit, and reading + base64-encoding those bytes measurably slows a
 * conversion that never uses the result. Returning an empty src here skips
 * reading the image entirely (the converter function never calls any of
 * `image.read()`/`readAsBuffer()`/`readAsBase64String()`).
 */
const SKIP_IMAGES = mammoth.images.imgElement(() => Promise.resolve({ src: "" }));

/**
 * Native DOCX text extractor via mammoth HTML conversion.
 * Preserves paragraph breaks and list numbering where mammoth exposes them.
 * Does not parse legacy .doc. Does not run OCR or a completion API.
 *
 * Bounded by DOCX_EXTRACT_TIMEOUT_MS and never reads embedded images (see
 * SKIP_IMAGES above) — both added after a real-world DOCX attachment left
 * the upload UI stuck on its loading spinner indefinitely: mammoth's
 * default image handling and the complete absence of any timeout anywhere
 * in this path (client fetch included — see fetchWithUploadTimeout) meant a
 * slow conversion had no way to ever surface as a recoverable error.
 */
export class MammothDocxTextExtractor implements DocxTextExtractor {
  constructor(private readonly timeoutMs: number = DOCX_EXTRACT_TIMEOUT_MS) {}

  async extract(body: Uint8Array): Promise<DocxExtractResult> {
    try {
      const result = await withDocxTimeout(
        mammoth.convertToHtml({ buffer: Buffer.from(body) }, { convertImage: SKIP_IMAGES }),
        this.timeoutMs,
      );
      const text = htmlToStructuredText(result.value);
      if (!text) {
        return { status: "EMPTY", text: "", pageCount: null };
      }
      return { status: "OK", text, pageCount: null };
    } catch (error) {
      if (error instanceof DocxExtractTimeoutError) {
        return { status: "FAILED", text: "", pageCount: null, timedOut: true };
      }
      return { status: "FAILED", text: "", pageCount: null };
    }
  }
}

export function htmlToStructuredText(html: string): string {
  const withLists = html
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
      let index = 0;
      const items = inner.replace(/<li\b[^>]*>/gi, () => {
        index += 1;
        return `${index}. `;
      });
      return `\n${items}\n`;
    })
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
      return `\n${inner.replace(/<li\b[^>]*>/gi, "• ")}\n`;
    })
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return boundExtractedStructuredText(withLists);
}

export function boundExtractedStructuredText(text: string): string {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= MAX_DOCUMENT_EXTRACT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_DOCUMENT_EXTRACT_CHARS);
}

let singleton: DocxTextExtractor | undefined;

export function getDocxTextExtractor(): DocxTextExtractor {
  singleton ??= new MammothDocxTextExtractor();
  return singleton;
}
