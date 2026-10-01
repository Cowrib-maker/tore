import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE } from "@/application/ai/legal-ai-document.constants";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { attachMatterDocumentUseCase } from "@/application/use-cases/matters/attach-matter-document";
import { DomainError } from "@/domain/errors/domain-error";
import { getLegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";
import {
  matterDocumentRepository,
  matterRepository,
} from "@/infrastructure/repositories";
import {
  consumeRateLimit,
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";

/**
 * Any authenticated role may upload to a Matter it owns — Matter has no
 * role restriction (see matter.actions.ts). Ownership is re-verified
 * server-side inside attachMatterDocumentUseCase (requireOwnedMatter)
 * before the upload is accepted; matterId here is only a route param, never
 * trusted on its own.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ matterId: string }> },
) {
  try {
    const { matterId } = await context.params;
    const actor = await requireActor();
    await assertEmailVerified(actor.userId);

    const rate = await consumeRateLimit(
      legalAiDocumentRateLimitKey(actor.userId),
      LEGAL_AI_DOCUMENT_RATE_LIMIT.limit,
      LEGAL_AI_DOCUMENT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const result = await attachMatterDocumentUseCase(
      actor,
      {
        matterId,
        fileName: file.name || "document",
        contentType: file.type,
        body,
      },
      {
        matterRepository,
        matterDocumentRepository,
        fileStorage: getFileStorage(),
        extractor: getLegalAiDocumentExtractor(),
      },
    );

    return NextResponse.json(
      {
        id: result.id,
        matterId: result.matterId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        extractStatus: result.extractStatus,
        pageCount: result.pageCount,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof LegalAiError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        },
        { status: error.statusCode },
      );
    }
    if (error instanceof DomainError) {
      const status =
        error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }

    console.error("TORE Matter document upload error:", error);
    return NextResponse.json(
      { error: "Баримт хавсаргахад алдаа гарлаа." },
      { status: 500 },
    );
  }
}
