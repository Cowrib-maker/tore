import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import {
  createCaseFactForLawyer,
  deleteCaseFactForLawyer,
  updateCaseFactForLawyer,
} from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
      text?: string;
      sourceType?: string;
      sourceReference?: string | null;
    };
    const payload = await createCaseFactForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      text: body.text ?? "",
      sourceType: body.sourceType,
      sourceReference: body.sourceReference,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
      factId?: string;
      text?: string;
      sourceType?: string;
      sourceReference?: string | null;
    };
    const payload = await updateCaseFactForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      factId: body.factId ?? "",
      text: body.text,
      sourceType: body.sourceType,
      sourceReference: body.sourceReference,
    });
    return NextResponse.json(payload);
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
    };
    const payload = await deleteCaseFactForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      factId: body.factId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
