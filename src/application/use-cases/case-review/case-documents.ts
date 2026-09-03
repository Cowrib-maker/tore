import type { ActorContext } from "@/application/common/actor-context";
import { assertValidPdfUpload } from "@/application/ai/pdf-upload-validation";
import { CaseEvidenceType } from "@/domain/entities/case-file";
import type { FileStorage } from "@/domain/ports/file-storage";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";
import { getFileStorage } from "@/infrastructure/storage";
import { LEGAL_AI_DOCUMENT_MIME } from "@/application/ai/legal-ai-document.constants";

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

/**
 * Store a native-text PDF on an owned CaseFile using FileStorage.
 * Does not run OCR, OpenAI, or document intelligence.
 */
export async function attachCasePdfForLawyer(
  actor: ActorContext,
  input: AttachCasePdfInput,
  deps: AttachCasePdfDeps = defaultAttachCasePdfDeps(),
): Promise<CaseReviewWorkspacePayload> {
  await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  assertValidPdfUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    body: input.body,
  });

  const stored = await deps.fileStorage.upload({
    purpose: "evidence",
    ownerId: actor.userId,
    fileName: input.fileName,
    contentType: LEGAL_AI_DOCUMENT_MIME,
    body: input.body,
  });

  try {
    return await createCaseEvidenceForLawyer(
      actor,
      {
        caseId: input.caseId,
        expectedVersion: input.expectedVersion,
        title: stored.originalFileName || input.fileName,
        description: `PDF · ${formatPdfSize(stored.sizeBytes)}`,
        evidenceType: CaseEvidenceType.DOCUMENT,
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
