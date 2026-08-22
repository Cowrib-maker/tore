import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { guardLawyerAiHttp, recordLawyerFeatureUsage } from "@/application/common/guard-lawyer-ai-http";
import { rerunCaseAnalysisForLawyer } from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { EntitlementFeature, UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const guard = await guardLawyerAiHttp(
      actor,
      EntitlementFeature.CASE_ANALYSIS,
    );
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
    };
    const payload = await rerunCaseAnalysisForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
    });
    if (!payload.lastAnalysisError) {
      await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
    }
    return NextResponse.json(payload);
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
