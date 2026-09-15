import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import {
  guardLawyerAiHttp,
  recordLawyerFeatureUsage,
} from "@/application/common/guard-lawyer-ai-http";
import {
  generateCaseAiAnalysisForLawyer,
  getLatestCaseAiAnalysisForLawyer,
} from "@/application/use-cases/case-review/case-ai-analysis";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    await assertEmailVerified(actor.userId);
    const guard = await guardLawyerAiHttp(actor, EntitlementFeature.CASE_ANALYSIS);
    const body = (await request.json()) as { caseId?: string };
    if (!body.caseId) {
      return NextResponse.json(
        { error: "caseId шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await generateCaseAiAnalysisForLawyer(actor, body.caseId);
    if (result.status === "OK") {
      await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const caseId = new URL(request.url).searchParams.get("caseId");
    if (!caseId) {
      return NextResponse.json(
        { error: "caseId шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await getLatestCaseAiAnalysisForLawyer(actor, caseId);
    return NextResponse.json({ analysis: result });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
