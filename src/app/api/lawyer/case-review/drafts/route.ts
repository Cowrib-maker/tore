import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import {
  guardLawyerAiHttp,
  recordLawyerFeatureUsage,
} from "@/application/common/guard-lawyer-ai-http";
import {
  generateCaseDraftForLawyer,
  listCaseDraftsForLawyer,
} from "@/application/use-cases/case-review/case-draft";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { CaseDraftType } from "@/domain/entities/case-draft";
import { EntitlementFeature, UserRole } from "@/domain/enums";

const VALID_DRAFT_TYPES = new Set(Object.values(CaseDraftType));

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    await assertEmailVerified(actor.userId);
    const guard = await guardLawyerAiHttp(actor, EntitlementFeature.CASE_ANALYSIS);
    const body = (await request.json()) as { caseId?: string; draftType?: string };
    if (!body.caseId || !body.draftType || !VALID_DRAFT_TYPES.has(body.draftType as never)) {
      return NextResponse.json(
        { error: "caseId, draftType шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const result = await generateCaseDraftForLawyer(
      actor,
      body.caseId,
      body.draftType as CaseDraftType,
    );
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
    const drafts = await listCaseDraftsForLawyer(actor, caseId);
    return NextResponse.json({ drafts });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
