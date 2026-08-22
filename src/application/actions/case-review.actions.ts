"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { guardLawyerAiHttp, recordLawyerFeatureUsage } from "@/application/common/guard-lawyer-ai-http";
import { requireActor } from "@/application/common/require-actor";
import {
  createCaseEvidenceForLawyer,
  createCaseFactForLawyer,
  createCaseFileForLawyer,
  deleteCaseEvidenceForLawyer,
  deleteCaseFactForLawyer,
  getCaseReviewForLawyer,
  linkCaseFactEvidenceForLawyer,
  openSampleCaseForLawyer,
  rerunCaseAnalysisForLawyer,
  submitManualMappingForLawyer,
  unlinkCaseFactEvidenceForLawyer,
  updateCaseEvidenceForLawyer,
  updateCaseFactForLawyer,
} from "@/application/use-cases/case-review";
import { parseEvidenceIds } from "@/application/use-cases/case-review/view-model";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { ValidationError } from "@/domain/errors/domain-error";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

const REVIEW_PATH = "/lawyer/workspace/case-review";
const CASES_PATH = "/lawyer/workspace/cases";

export type CaseReviewActionState = ActionState & {
  payload?: CaseReviewWorkspacePayload;
  caseId?: string;
};

export async function createCaseFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let caseId: string;
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const file = await createCaseFileForLawyer(actor, {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      legalDomain: String(formData.get("legalDomain") ?? ""),
      applicableAt: String(formData.get("applicableAt") ?? "") || null,
    });
    caseId = file.id;
  } catch (error) {
    return mapActionError(error);
  }
  revalidatePath(CASES_PATH);
  redirect(`${REVIEW_PATH}?caseId=${encodeURIComponent(caseId)}`);
}

export async function openSampleCaseAction(formData: FormData): Promise<void> {
  const actor = await requireActor(UserRole.LAWYER);
  const guard = await guardLawyerAiHttp(
    actor,
    EntitlementFeature.CASE_ANALYSIS,
  );
  const variant = String(formData.get("variant") ?? "");
  const payload = await openSampleCaseForLawyer(actor, variant);
  await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
  revalidatePath(CASES_PATH);
  redirect(`${REVIEW_PATH}?caseId=${encodeURIComponent(payload.caseId)}`);
}

export async function submitManualMappingAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const payload = await submitManualMappingForLawyer(actor, {
      caseId: String(formData.get("caseId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion") ?? NaN),
      factId: String(formData.get("factId") ?? ""),
      elementId: String(formData.get("elementId") ?? ""),
      relation: String(formData.get("relation") ?? ""),
      evidenceIds: parseEvidenceIds(String(formData.get("evidenceIds") ?? "")),
    });
    revalidatePath(REVIEW_PATH);
    revalidatePath(CASES_PATH);
    return { success: true, payload, caseId: payload.caseId };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function rerunCaseAnalysisAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const guard = await guardLawyerAiHttp(
      actor,
      EntitlementFeature.CASE_ANALYSIS,
    );
    const payload = await rerunCaseAnalysisForLawyer(actor, {
      caseId: String(formData.get("caseId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion") ?? NaN),
    });
    if (!payload.lastAnalysisError) {
      await recordLawyerFeatureUsage(
        guard.usageId,
        EntitlementFeature.CASE_ANALYSIS,
      );
    }
    revalidatePath(REVIEW_PATH);
    revalidatePath(CASES_PATH);
    return { success: true, payload, caseId: payload.caseId };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function loadCaseReviewForPage(
  caseId: string,
): Promise<CaseReviewWorkspacePayload> {
  const actor = await requireActor(UserRole.LAWYER);
  return getCaseReviewForLawyer(actor, caseId);
}

export async function caseIntakeAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const intent = String(formData.get("intent") ?? "");
    const caseId = String(formData.get("caseId") ?? "");
    const expectedVersion = Number(formData.get("expectedVersion") ?? NaN);
    const payload = await runIntakeIntent(actor, intent, {
      caseId,
      expectedVersion,
      formData,
    });
    revalidatePath(REVIEW_PATH);
    revalidatePath(CASES_PATH);
    return { success: true, payload, caseId: payload.caseId };
  } catch (error) {
    return mapActionError(error);
  }
}

async function runIntakeIntent(
  actor: Awaited<ReturnType<typeof requireActor>>,
  intent: string,
  input: { caseId: string; expectedVersion: number; formData: FormData },
) {
  const { caseId, expectedVersion, formData } = input;
  switch (intent) {
    case "create-fact":
      return createCaseFactForLawyer(actor, {
        caseId,
        expectedVersion,
        text: String(formData.get("text") ?? ""),
        sourceType: String(formData.get("sourceType") ?? ""),
        sourceReference: String(formData.get("sourceReference") ?? "") || null,
      });
    case "update-fact":
      return updateCaseFactForLawyer(actor, {
        caseId,
        expectedVersion,
        factId: String(formData.get("factId") ?? ""),
        text: String(formData.get("text") ?? ""),
        sourceType: String(formData.get("sourceType") ?? ""),
        sourceReference: String(formData.get("sourceReference") ?? "") || null,
      });
    case "delete-fact":
      return deleteCaseFactForLawyer(actor, {
        caseId,
        expectedVersion,
        factId: String(formData.get("factId") ?? ""),
      });
    case "create-evidence":
      return createCaseEvidenceForLawyer(actor, {
        caseId,
        expectedVersion,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        evidenceType: String(formData.get("evidenceType") ?? ""),
        sourceReference: String(formData.get("sourceReference") ?? "") || null,
      });
    case "update-evidence":
      return updateCaseEvidenceForLawyer(actor, {
        caseId,
        expectedVersion,
        evidenceId: String(formData.get("evidenceId") ?? ""),
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? "") || null,
        evidenceType: String(formData.get("evidenceType") ?? ""),
        sourceReference: String(formData.get("sourceReference") ?? "") || null,
      });
    case "delete-evidence":
      return deleteCaseEvidenceForLawyer(actor, {
        caseId,
        expectedVersion,
        evidenceId: String(formData.get("evidenceId") ?? ""),
      });
    case "link":
      return linkCaseFactEvidenceForLawyer(actor, {
        caseId,
        expectedVersion,
        factId: String(formData.get("factId") ?? ""),
        evidenceId: String(formData.get("evidenceId") ?? ""),
      });
    case "unlink":
      return unlinkCaseFactEvidenceForLawyer(actor, {
        caseId,
        expectedVersion,
        factId: String(formData.get("factId") ?? ""),
        evidenceId: String(formData.get("evidenceId") ?? ""),
      });
    default:
      throw new ValidationError("Unknown intake action.");
  }
}
