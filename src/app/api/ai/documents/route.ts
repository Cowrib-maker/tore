import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import { LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE } from "@/application/ai/legal-ai-document.constants";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { attachConversationDocumentUseCase } from "@/application/use-cases/ai/attach-conversation-document";
import {
  assertCitizenAiOperation,
  recordCitizenFeatureUsage,
} from "@/application/use-cases/entitlements/assert-citizen-ai-operation";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { EntitlementError } from "@/domain/errors/entitlement-error";
import { getLegalAiDocumentExtractor } from "@/infrastructure/ai/document-text-extractor";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";
import {
  entitlementUsageRepository,
  subscriptionRepository,
} from "@/infrastructure/repositories";
import {
  consumeRateLimit,
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";

const store = new PrismaLegalAiStore();

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    await assertEmailVerified(actor.userId);

    const rate = await consumeRateLimit(
      legalAiDocumentRateLimitKey(actor.userId),
      LEGAL_AI_DOCUMENT_RATE_LIMIT.limit,
      LEGAL_AI_DOCUMENT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const guard = await assertCitizenAiOperation(
      actor,
      EntitlementFeature.DOCUMENT_ANALYSIS,
      {
        subscriptionRepository,
        entitlementUsageRepository,
      },
    );

    const formData = await request.formData();
    const file = formData.get("file");
    const conversationIdRaw = formData.get("conversationId");
    const conversationId =
      typeof conversationIdRaw === "string" && conversationIdRaw.trim()
        ? conversationIdRaw.trim()
        : undefined;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: LEGAL_AI_UNSUPPORTED_FORMAT_MESSAGE, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const result = await attachConversationDocumentUseCase(
      {
        userId: actor.userId,
        conversationId,
        fileName: file.name || "document",
        contentType: file.type,
        body,
      },
      {
        store,
        fileStorage: getFileStorage(),
        extractor: getLegalAiDocumentExtractor(),
      },
    );

    await recordCitizenFeatureUsage(
      guard.usageId,
      EntitlementFeature.DOCUMENT_ANALYSIS,
      { entitlementUsageRepository },
    );

    return NextResponse.json(
      {
        id: result.id,
        conversationId: result.conversationId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
        extractStatus: result.extractStatus,
        pageCount: result.pageCount,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof EntitlementError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
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

    console.error("TORE Legal AI citizen document upload error:", error);
    return NextResponse.json(
      { error: "Баримт хавсаргахад алдаа гарлаа." },
      { status: 500 },
    );
  }
}
