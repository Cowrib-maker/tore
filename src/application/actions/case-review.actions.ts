"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/application/common/action-state";
import { mapActionError } from "@/application/common/map-action-error";
import { guardLawyerAiHttp, recordLawyerFeatureUsage } from "@/application/common/guard-lawyer-ai-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import {
  createCaseEvidenceForLawyer,
  createCaseFactForLawyer,
  createCaseFileForLawyer,
  deleteCaseEvidenceForLawyer,
  deleteCaseFactForLawyer,
  linkCaseFactEvidenceForLawyer,
  loadCaseWorkspaceForLawyer,
  openSampleCaseForLawyer,
  rerunCaseAnalysisForLawyer,
  startCaseConversationForLawyer,
  submitManualMappingForLawyer,
  unlinkCaseFactEvidenceForLawyer,
  updateCaseEvidenceForLawyer,
  updateCaseFactForLawyer,
  updateCaseFileForLawyer,
} from "@/application/use-cases/case-review";
import { toWorkspacePayload } from "@/application/use-cases/case-review/payload";
import type { CaseWorkspaceView } from "@/application/use-cases/case-review";
import { parseEvidenceIds } from "@/application/use-cases/case-review/view-model";
import {
  generateCaseAiAnalysisForLawyer,
  getLatestCaseAiAnalysisForLawyer,
} from "@/application/use-cases/case-review/case-ai-analysis";
import {
  extractCaseTimelineForLawyer,
  listCaseTimelineForLawyer,
} from "@/application/use-cases/case-review/case-timeline";
import {
  generateCaseDraftForLawyer,
  listCaseDraftsForLawyer,
} from "@/application/use-cases/case-review/case-draft";
import type { CaseAiAnalysisResult } from "@/domain/entities/case-ai-analysis";
import type { CaseTimelineEntry } from "@/domain/entities/case-timeline";
import { CaseDraftType, type CaseDraftResult } from "@/domain/entities/case-draft";
import { EntitlementFeature, UserRole } from "@/domain/enums";
import { ValidationError } from "@/domain/errors/domain-error";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

const REVIEW_PATH = "/lawyer/workspace/case-review";
const CASES_PATH = "/lawyer/workspace/cases";
const WORKSPACE_PATH = "/lawyer/workspace";

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
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
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
  revalidatePath(WORKSPACE_PATH);
  redirect(`${REVIEW_PATH}?caseId=${encodeURIComponent(caseId)}`);
}

export async function openSampleCaseAction(formData: FormData): Promise<void> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  const guard = await guardLawyerAiHttp(
    actor,
    EntitlementFeature.CASE_ANALYSIS,
  );
  const variant = String(formData.get("variant") ?? "");
  const payload = await openSampleCaseForLawyer(actor, variant);
  await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
  revalidatePath(CASES_PATH);
  revalidatePath(WORKSPACE_PATH);
  redirect(`${REVIEW_PATH}?caseId=${encodeURIComponent(payload.caseId)}`);
}

export async function submitManualMappingAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
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
    revalidatePath(WORKSPACE_PATH);
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
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
    await assertEmailVerified(actor.userId);
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
    revalidatePath(WORKSPACE_PATH);
    return { success: true, payload, caseId: payload.caseId };
  } catch (error) {
    return mapActionError(error);
  }
}

export type CaseAiAnalysisActionState = ActionState & {
  analysis?: CaseAiAnalysisResult;
  caseId?: string;
};

/**
 * Sprint 13 Phase 6 — triggers one grounded Case Analysis V1 run for an
 * owned case. Mirrors rerunCaseAnalysisAction's guard/entitlement pattern;
 * unlike that action this never touches CaseFile.reviewJson, so it only
 * needs to revalidate the analyze sub-page, not the whole workspace tree.
 */
export async function generateCaseAiAnalysisAction(
  _prev: CaseAiAnalysisActionState,
  formData: FormData,
): Promise<CaseAiAnalysisActionState> {
  const caseId = String(formData.get("caseId") ?? "");
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
    await assertEmailVerified(actor.userId);
    const guard = await guardLawyerAiHttp(actor, EntitlementFeature.CASE_ANALYSIS);
    const analysis = await generateCaseAiAnalysisForLawyer(actor, caseId);
    if (analysis.status === "OK") {
      await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
    }
    revalidatePath(`${REVIEW_PATH}/analyze`);
    return { success: analysis.status === "OK", analysis, caseId };
  } catch (error) {
    return { ...mapActionError(error), caseId };
  }
}

export type CaseTimelineActionState = ActionState & {
  entries?: CaseTimelineEntry[];
  caseId?: string;
};

/** Sprint 13 Phase 9 — (re-)runs the deterministic timeline extractor. No
 * entitlement guard: this never calls an LLM, so it costs nothing to run. */
export async function extractCaseTimelineAction(
  _prev: CaseTimelineActionState,
  formData: FormData,
): Promise<CaseTimelineActionState> {
  const caseId = String(formData.get("caseId") ?? "");
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
    const entries = await extractCaseTimelineForLawyer(actor, caseId);
    revalidatePath(`${REVIEW_PATH}/timeline`);
    return { success: true, entries, caseId };
  } catch (error) {
    return { ...mapActionError(error), caseId };
  }
}

export type CaseDraftActionState = ActionState & {
  draft?: CaseDraftResult;
  caseId?: string;
};

/** Sprint 13 Phase 8 — Draft Generator V1. Only LAWYER_POSITION is wired
 * up on the form (see the draft page); any other draftType value still
 * reaches generateCaseDraftForLawyer's own NotImplementedError guard. */
export async function generateCaseDraftAction(
  _prev: CaseDraftActionState,
  formData: FormData,
): Promise<CaseDraftActionState> {
  const caseId = String(formData.get("caseId") ?? "");
  const draftType = String(formData.get("draftType") ?? CaseDraftType.LAWYER_POSITION);
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
    await assertEmailVerified(actor.userId);
    const guard = await guardLawyerAiHttp(actor, EntitlementFeature.CASE_ANALYSIS);
    const draft = await generateCaseDraftForLawyer(actor, caseId, draftType as CaseDraftType);
    if (draft.status === "OK") {
      await recordLawyerFeatureUsage(guard.usageId, EntitlementFeature.CASE_ANALYSIS);
    }
    revalidatePath(`${REVIEW_PATH}/draft`);
    return { success: draft.status === "OK", draft, caseId };
  } catch (error) {
    return { ...mapActionError(error), caseId };
  }
}

export async function updateCaseTitleAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
    const updated = await updateCaseFileForLawyer(actor, {
      caseId: String(formData.get("caseId") ?? ""),
      expectedVersion: Number(formData.get("expectedVersion") ?? NaN),
      title: String(formData.get("title") ?? ""),
    });
    revalidatePath(REVIEW_PATH);
    revalidatePath(CASES_PATH);
    revalidatePath(WORKSPACE_PATH);
    return {
      success: true,
      payload: toWorkspacePayload(updated),
      caseId: updated.id,
    };
  } catch (error) {
    return mapActionError(error);
  }
}

export async function startCaseChatAction(formData: FormData): Promise<void> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  const caseId = String(formData.get("caseId") ?? "");
  const started = await startCaseConversationForLawyer(actor, caseId);
  revalidatePath(REVIEW_PATH);
  revalidatePath(WORKSPACE_PATH);
  redirect(
    `/legal-ai?conversationId=${encodeURIComponent(started.conversationId)}&caseId=${encodeURIComponent(started.caseId)}`,
  );
}

export async function loadCaseWorkspaceForPage(
  caseId: string,
): Promise<CaseWorkspaceView> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  return loadCaseWorkspaceForLawyer(actor, caseId);
}

export async function loadCaseAiAnalysisForPage(
  caseId: string,
): Promise<CaseAiAnalysisResult | null> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  return getLatestCaseAiAnalysisForLawyer(actor, caseId);
}

export async function loadCaseTimelineForPage(
  caseId: string,
): Promise<CaseTimelineEntry[]> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  return listCaseTimelineForLawyer(actor, caseId);
}

export async function loadCaseDraftsForPage(caseId: string): Promise<CaseDraftResult[]> {
  const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
  return listCaseDraftsForLawyer(actor, caseId);
}

export async function caseIntakeAction(
  _prev: CaseReviewActionState,
  formData: FormData,
): Promise<CaseReviewActionState> {
  try {
    const actor = await requireActor([UserRole.LAWYER, UserRole.ADMIN]);
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
    revalidatePath(WORKSPACE_PATH);
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
