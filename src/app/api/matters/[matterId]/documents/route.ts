import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { attachMatterDocumentUseCase } from "@/application/use-cases/matters/attach-matter-document";
import {
  MATTER_DOCUMENT_MAX_BYTES,
  MATTER_DOCUMENT_REQUEST_OVERHEAD_BYTES,
  MATTER_DOCUMENT_SIZE_MESSAGE,
  MATTER_DOCUMENT_UNSUPPORTED_MESSAGE,
} from "@/application/use-cases/matters/matter-document-policy";
import {
  describeUploadFailure,
  logMatterDocumentUpload,
} from "@/application/use-cases/matters/matter-document-upload-log";
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
 * Extraction is capped at MATTER_DOCUMENT_PROCESSING_TIMEOUT_MS inside the
 * use case; the function budget leaves room for auth, storage and the DB.
 */
// Must be a literal: Next statically analyzes segment config. Keep in sync
// with MATTER_DOCUMENT_ROUTE_MAX_DURATION_SECONDS (asserted in a unit test).
export const maxDuration = 30;

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
  let matterId = "unknown";
  try {
    ({ matterId } = await context.params);
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

    // Reject an over-limit body before buffering it. The declared length is
    // advisory (the use case re-checks the real byte count), but it spares a
    // large multipart parse for the common honest-client case.
    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength >
        MATTER_DOCUMENT_MAX_BYTES + MATTER_DOCUMENT_REQUEST_OVERHEAD_BYTES
    ) {
      logMatterDocumentUpload("size_rejected", {
        matterId,
        code: "FILE_TOO_LARGE",
        sizeBytes: declaredLength,
      });
      return NextResponse.json(
        { error: MATTER_DOCUMENT_SIZE_MESSAGE, code: "FILE_TOO_LARGE" },
        { status: 413 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logMatterDocumentUpload("unsupported_type", {
        matterId,
        code: "UNSUPPORTED_FILE_TYPE",
        reason: describeUploadFailure(error),
      });
      return NextResponse.json(
        { error: MATTER_DOCUMENT_UNSUPPORTED_MESSAGE, code: "UNSUPPORTED_FILE_TYPE" },
        { status: 400 },
      );
    }
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: MATTER_DOCUMENT_UNSUPPORTED_MESSAGE, code: "UNSUPPORTED_FILE_TYPE" },
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

    logMatterDocumentUpload("unexpected_error", {
      matterId,
      reason: describeUploadFailure(error),
    });
    return NextResponse.json(
      { error: "Баримт хавсаргахад алдаа гарлаа.", code: "UPLOAD_FAILED" },
      { status: 500 },
    );
  }
}
