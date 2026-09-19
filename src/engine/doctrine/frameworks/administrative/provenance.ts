/**
 * Shared provenance helper for the administrative-doctrine module.
 *
 * Single source: "Эрх зvйн тохиолдол шийдвэрлэх аргачлал" (methodology
 * handbook). All locators are page numbers from that book, as photographed
 * and transcribed. sourceKind is DOCTRINE — this is a bar-exam methodology
 * text, not positive law itself (positive-law citations appear inside the
 * `citation` string where the book quotes a statute).
 */
import { LegalAuthorityKind } from "../../types";
import type { DoctrineProvenance } from "../../provenance";

export const METHODOLOGY_SOURCE_ID =
  "erkh-zuin-tokhioldol-shiidverlekh-argachlal";

export function methodologyProvenance(
  locator: string,
  citation: string,
): DoctrineProvenance {
  return {
    sourceId: METHODOLOGY_SOURCE_ID,
    sourceKind: LegalAuthorityKind.DOCTRINE,
    citation,
    locator,
  };
}
