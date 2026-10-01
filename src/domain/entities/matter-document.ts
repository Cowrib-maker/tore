import type { LegalAiDocumentExtractStatus } from "@/application/ai/legal-ai-document.constants";

/**
 * TORE Matter Workspace M2 — a document uploaded directly to a Matter,
 * persistent across every AI conversation under that Matter. See the
 * Prisma schema comment on `MatterDocument` for why this is not
 * AIConversationDocument or CaseEvidence.
 */
export type MatterDocument = {
  id: string;
  matterId: string;
  uploadedByUserId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  pageCount: number | null;
  extractStatus: LegalAiDocumentExtractStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMatterDocumentInput = {
  matterId: string;
  uploadedByUserId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  pageCount: number | null;
  extractStatus: LegalAiDocumentExtractStatus;
};
