import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import {
  extractCaseTimelineForLawyer,
  listCaseTimelineForLawyer,
} from "@/application/use-cases/case-review/case-timeline";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as { caseId?: string };
    if (!body.caseId) {
      return NextResponse.json(
        { error: "caseId шаардлагатай.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const entries = await extractCaseTimelineForLawyer(actor, body.caseId);
    return NextResponse.json({ entries }, { status: 201 });
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
    const entries = await listCaseTimelineForLawyer(actor, caseId);
    return NextResponse.json({ entries });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
