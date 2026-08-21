import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import {
  linkCaseFactEvidenceForLawyer,
  unlinkCaseFactEvidenceForLawyer,
} from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
      factId?: string;
      evidenceId?: string;
    };
    const payload = await linkCaseFactEvidenceForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      factId: body.factId ?? "",
      evidenceId: body.evidenceId ?? "",
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
      factId?: string;
      evidenceId?: string;
    };
    const payload = await unlinkCaseFactEvidenceForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      factId: body.factId ?? "",
      evidenceId: body.evidenceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
