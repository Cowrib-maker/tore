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

const MAX_IMAGE_PIXELS = 16_777_216;

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
