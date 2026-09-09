import { extractImages, getDocumentProxy } from "unpdf";

import {
  OCR_MAX_IMAGES_PER_PAGE,
  OCR_MAX_PDF_PAGES,
  OCR_MIN_IMAGE_EDGE_PX,
} from "@/application/ai/legal-ai-document.constants";
import { encodePngFromRaw } from "@/infrastructure/ai/png-from-raw";

export type PdfPageOcrImage = {
  pageNumber: number;
  bytes: Uint8Array;
};

export type PdfEmbeddedImageExtractor = {
  extract(body: Uint8Array): Promise<{
    pageCount: number;
    images: PdfPageOcrImage[];
  }>;
};

/**
 * pdf.js's maxImageSize silently drops any embedded image over this pixel
 * count (a console.warn, no error, no signal in the returned data — see
 * https://github.com/mozilla/pdf.js/issues/14626) instead of throwing or
 * downscaling it. 16_777_216 (4096x4096) was too tight: a routine 600 DPI
 * scan of an A4 page is ~4960x7016 (~34.8M px) and would be dropped
 * outright, silently producing NEEDS_OCR for a perfectly normal scan.
 * 25_000_000 (~5000x5000) covers scans up to roughly 500 DPI on A4/Letter
 * while keeping a single decoded RGB buffer under ~75MB, comfortably
 * inside typical serverless function memory. If production telemetry
 * shows real scans still getting dropped above this, downsampling the
 * decoded image before OCR (rather than raising this further) is the
 * safer way to support very high DPI scans.
 */
const MAX_IMAGE_PIXELS = 25_000_000;

/**
 * Pulls already-encoded page bitmaps out of a PDF via unpdf extractImages.
 * Does not rasterize pages (renderPageAsImage needs @napi-rs/canvas, which
 * this runtime does not ship).
 */
export class UnpdfEmbeddedImageExtractor implements PdfEmbeddedImageExtractor {
  async extract(body: Uint8Array): Promise<{
    pageCount: number;
    images: PdfPageOcrImage[];
  }> {
    const pdf = await getDocumentProxy(body, { maxImageSize: MAX_IMAGE_PIXELS });
    const pageCount = pdf.numPages ?? 0;
    const limit = Math.min(pageCount, OCR_MAX_PDF_PAGES);
    const images: PdfPageOcrImage[] = [];

    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const extracted = await extractImages(pdf, pageNumber);
      let kept = 0;
      for (const image of extracted) {
        if (kept >= OCR_MAX_IMAGES_PER_PAGE) {
          break;
        }
        if (
          image.width < OCR_MIN_IMAGE_EDGE_PX ||
          image.height < OCR_MIN_IMAGE_EDGE_PX
        ) {
          continue;
        }
        const channels = image.channels;
        if (channels !== 1 && channels !== 3 && channels !== 4) {
          continue;
        }
        images.push({
          pageNumber,
          bytes: encodePngFromRaw({
            data: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
            width: image.width,
            height: image.height,
            channels,
          }),
        });
        kept += 1;
      }
    }

    return { pageCount, images };
  }
}

let singleton: PdfEmbeddedImageExtractor | undefined;

export function getPdfEmbeddedImageExtractor(): PdfEmbeddedImageExtractor {
  singleton ??= new UnpdfEmbeddedImageExtractor();
  return singleton;
}
