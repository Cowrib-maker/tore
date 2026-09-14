import type { ActorContext } from "@/application/common/actor-context";
import { assertValidCaseEvidenceUpload } from "@/application/ai/case-evidence-upload-validation";
import { CaseEvidenceType } from "@/domain/entities/case-file";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

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
};

export function defaultAttachCasePdfDeps(): AttachCasePdfDeps {
  const { getFileStorage } =
    require("@/infrastructure/storage") as typeof import("@/infrastructure/storage");
  return {
    ...defaultCaseFileDeps(),
    fileStorage: getFileStorage(),
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
 * FileStorage. Does not run OCR, OpenAI, or document intelligence — a
 * photo is stored exactly as-is, the same "store, don't analyze"
 * behavior a PDF already had (name kept for backward compatibility with
 * existing call sites/tests; it now covers photos too, not just PDFs).
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
      },
      deps,
    );
  } catch (error) {
    await deps.fileStorage.delete(stored.key).catch(() => undefined);
    throw error;
  }
}
