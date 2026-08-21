import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { rerunCaseAnalysisForLawyer } from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
    };
    const payload = await rerunCaseAnalysisForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
