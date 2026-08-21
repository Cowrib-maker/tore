import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import {
  createCaseEvidenceForLawyer,
  deleteCaseEvidenceForLawyer,
  updateCaseEvidenceForLawyer,
} from "@/application/use-cases/case-review";
import { caseFileErrorResponse } from "@/application/use-cases/case-review/http-error";
import { UserRole } from "@/domain/enums";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const body = (await request.json()) as {
      caseId?: string;
      expectedVersion?: number;
      title?: string;
      description?: string | null;
      evidenceType?: string;
      fileReference?: string | null;
      sourceReference?: string | null;
    };
    const payload = await createCaseEvidenceForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      title: body.title ?? "",
      description: body.description,
      evidenceType: body.evidenceType ?? "",
      fileReference: body.fileReference,
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
      evidenceId?: string;
      title?: string;
      description?: string | null;
      evidenceType?: string;
      fileReference?: string | null;
      sourceReference?: string | null;
    };
    const payload = await updateCaseEvidenceForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      evidenceId: body.evidenceId ?? "",
      title: body.title,
      description: body.description,
      evidenceType: body.evidenceType,
      fileReference: body.fileReference,
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
      evidenceId?: string;
    };
    const payload = await deleteCaseEvidenceForLawyer(actor, {
      caseId: body.caseId ?? "",
      expectedVersion: Number(body.expectedVersion),
      evidenceId: body.evidenceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return caseFileErrorResponse(error);
  }
}
