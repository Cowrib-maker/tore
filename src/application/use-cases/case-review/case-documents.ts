import type { ActorContext } from "@/application/common/actor-context";
import { assertValidCaseEvidenceUpload } from "@/application/ai/case-evidence-upload-validation";
import { CaseEvidenceType } from "@/domain/entities/case-file";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";
import type { LegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";
import { logCaseAiEvent, withCaseAiLatency } from "@/infrastructure/observability/case-ai-metrics";

import { requireOwnedCaseFile } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import { createCaseEvidenceForLawyer } from "./intake";

export type AttachCasePdfInput = {
  caseId: string;
  expectedVersion: number;
  fileName: string;
  contentType: string;
  body: Uint8Array;
};

export type AttachCasePdfDeps = CaseFileDeps & {
  fileStorage: FileStorage;
  extractor: LegalAiDocumentExtractor;
};

export function defaultAttachCasePdfDeps(): AttachCasePdfDeps {
  const { getFileStorage } =
    require("@/infrastructure/storage") as typeof import("@/infrastructure/storage");
  const { getLegalAiDocumentExtractor } =
    require("@/infrastructure/ai/document-text-extractor") as typeof import("@/infrastructure/ai/document-text-extractor");
  return {
    ...defaultCaseFileDeps(),
    fileStorage: getFileStorage(),
    extractor: getLegalAiDocumentExtractor(),
  };
}

export function formatPdfSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round((sizeBytes / 1024) * 10) / 10} KB`;
  }
  return `${Math.round((sizeBytes / (1024 * 1024)) * 10) / 10} MB`;
}

const EVIDENCE_LABEL_BY_FORMAT: Record<string, string> = {
  pdf: "PDF",
  jpeg: "Зураг",
  png: "Зураг",
  webp: "Зураг",
};

/**
 * Store a case-evidence file (PDF or photo — see
 * case-evidence-upload-validation.ts) on an owned CaseFile using
 * FileStorage, then run the same LegalAiDocumentExtractor/OcrEngine stack
 * the Legal AI conversation-document pipeline already uses (Sprint 13
 * Phase 2) to populate extractedText/extractStatus/pageCount.
 *
 * Unlike attachConversationDocumentUseCase, a failed/unreadable extraction
 * never blocks the upload: case evidence is a record-keeping surface first
 * (a lawyer may legitimately want to keep a low-quality scan on file even
 * if nothing can be read from it), so the evidence row is always created —
 * only extractStatus reflects the outcome. Downstream consumers (case
 * document retrieval, grounded analysis, timeline) only ever read OK
 * extracts, exactly like wrapUntrustedDocumentAttachments already treats
 * non-OK statuses for Legal AI documents.
 */
export async function attachCasePdfForLawyer(
  actor: ActorContext,
  input: AttachCasePdfInput,
  deps: AttachCasePdfDeps = defaultAttachCasePdfDeps(),
): Promise<CaseReviewWorkspacePayload> {
  await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  const validated = assertValidCaseEvidenceUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    body: input.body,
  });

  const stored = await deps.fileStorage.upload({
    purpose: "evidence",
    ownerId: actor.userId,
    fileName: input.fileName,
    contentType: validated.mimeType,
    body: input.body,
  });

  try {
    const { result: extracted, latencyMs } = await withCaseAiLatency(() =>
      deps.extractor
        .extract({ format: validated.format, body: input.body })
        .catch((error: unknown) => {
          console.error("[case-evidence] extraction threw, storing without text", {
            caseId: input.caseId,
            format: validated.format,
          });
          void error;
          return { status: "FAILED" as const, text: "", pageCount: null };
        }),
    );
    logCaseAiEvent({
      operation: "documentExtraction",
      outcome:
        extracted.status === "OK"
          ? "ok"
          : extracted.status === "NEEDS_OCR"
            ? "needs_ocr"
            : extracted.status === "EMPTY"
              ? "empty"
              : "failed",
      latencyMs,
    });

    return await createCaseEvidenceForLawyer(
      actor,
      {
        caseId: input.caseId,
        expectedVersion: input.expectedVersion,
        title: stored.originalFileName || input.fileName,
        description: `${EVIDENCE_LABEL_BY_FORMAT[validated.format]} · ${formatPdfSize(stored.sizeBytes)}`,
        evidenceType:
          validated.format === "pdf" ? CaseEvidenceType.DOCUMENT : CaseEvidenceType.PHOTO,
        fileReference: stored.key,
        sourceReference: stored.originalFileName || input.fileName,
        extraction: {
          extractedText: extracted.status === "OK" ? extracted.text : "",
          extractStatus: extracted.status,
          pageCount: extracted.pageCount,
        },
      },
      deps,
    );
  } catch (error) {
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}
