import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { LegalAiError } from "@/application/ai/legal-ai.errors";
import {
  guardLawyerAiHttp,
  recordLawyerFeatureUsage,
} from "@/application/common/guard-lawyer-ai-http";
import { rateLimitHttpResponse } from "@/application/common/rate-limit-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { attachCasePdfForLawyer } from "@/application/use-cases/case-review";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { DomainError } from "@/domain/errors/domain-error";
import {
  consumeRateLimit,
  LEGAL_AI_DOCUMENT_RATE_LIMIT,
  legalAiDocumentRateLimitKey,
} from "@/infrastructure/security/rate-limiter";

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
    const caseId = String(formData.get("caseId") ?? "").trim();
    const expectedVersion = Number(formData.get("expectedVersion") ?? NaN);

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "PDF файл шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    const payload = await attachCasePdfForLawyer(actor, {
      caseId,
      expectedVersion,
      fileName: file.name || "document.pdf",
      contentType: file.type,
      body,
    });

    await recordLawyerFeatureUsage(
      guard.usageId,
      EntitlementFeature.DOCUMENT_ANALYSIS,
    );

    revalidatePath("/lawyer/workspace");
    revalidatePath("/lawyer/workspace/cases");
    revalidatePath("/lawyer/workspace/case-review");

    return NextResponse.json(payload, { status: 201 });
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

    console.error("TORE case PDF upload error:", error);
    return NextResponse.json(
      { error: "Баримт хавсаргахад алдаа гарлаа." },
      { status: 500 },
    );
  }
}
