import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  guardLawyerAiHttp,
  recordLawyerFeatureUsage,
} from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { attachConversationPdfUseCase } from "@/application/use-cases/ai/attach-conversation-pdf";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import { PrismaLegalAiStore } from "@/infrastructure/ai/prisma-legal-ai-store";
import { getPdfTextExtractor } from "@/infrastructure/ai/pdf-text-extractor";
import {
  consumeRateLimit,
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";
import { getFileStorage } from "@/infrastructure/storage";

const store = new PrismaLegalAiStore();

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    await assertEmailVerified(actor.userId);

    const rate = await consumeRateLimit(
      legalAiDocumentRateLimitKey(actor.userId),
      LEGAL_AI_DOCUMENT_RATE_LIMIT.limit,
      LEGAL_AI_DOCUMENT_RATE_LIMIT.windowMs,
    );
    if (!rate.ok) {
      return rateLimitHttpResponse(rate.retryAfterSeconds);
    }

    const guard = await guardLawyerAiHttp(
      actor,
      EntitlementFeature.DOCUMENT_ANALYSIS,
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
        { error: "PDF файл шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const result = await attachConversationPdfUseCase(
      {
        userId: actor.userId,
        conversationId,
        fileName: file.name || "document.pdf",
        contentType: file.type,
        body,
      },
      {
        store,
        fileStorage: getFileStorage(),
        extractor: getPdfTextExtractor(),
      },
    );

    await recordLawyerFeatureUsage(
      guard.usageId,
      EntitlementFeature.DOCUMENT_ANALYSIS,
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

    console.error("TORE Legal AI document upload error:", error);
    return NextResponse.json(
      { error: "Баримт хавсаргахад алдаа гарлаа." },
      { status: 500 },
    );
  }
}
