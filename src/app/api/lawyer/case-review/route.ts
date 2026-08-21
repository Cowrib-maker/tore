import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import {
  createCaseFileForLawyer,
  getCaseReviewForLawyer,
  listCaseReviewsForLawyer,
} from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { toWorkspacePayload } from "@/application/use-cases/case-review/payload";
import { UserRole } from "@/domain/enums";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const caseId =
      new URL(request.url).searchParams.get("caseId") ??
      new URL(request.url).searchParams.get("case");
    if (!caseId) {
      return NextResponse.json({
        cases: await listCaseReviewsForLawyer(actor),
      });
    }
    return NextResponse.json(await getCaseReviewForLawyer(actor, caseId));
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      legalDomain?: string;
      applicableAt?: string | null;
    };
    const file = await createCaseFileForLawyer(actor, {
      title: body.title ?? "",
      description: body.description,
      legalDomain: body.legalDomain ?? "",
      applicableAt: body.applicableAt,
    });
    return NextResponse.json(toWorkspacePayload(file), { status: 201 });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
