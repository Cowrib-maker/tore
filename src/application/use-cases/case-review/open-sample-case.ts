import type { ActorContext } from "@/application/common/actor-context";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import { ValidationError } from "@/domain/errors/domain-error";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

import { assertLawyerReviewer } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import {
  SAMPLE_CASE_VARIANTS,
  sampleCaseBlueprint,
  type SampleCaseVariant,
} from "./fixtures";
import { toWorkspacePayload } from "./payload";
import { intakeFromAnalysisRequest } from "./sync-request";

export function isSampleCaseVariant(value: string): value is SampleCaseVariant {
  return (SAMPLE_CASE_VARIANTS as readonly string[]).includes(value);
}

/**
 * Development fixture: persists a sample CaseFile through the repository.
 * Not used for the normal production create-case flow.
 */
export async function openSampleCaseForLawyer(
  actor: ActorContext,
  variant: string,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  assertLawyerReviewer(actor);
  if (!isSampleCaseVariant(variant)) {
    throw new ValidationError("Үл мэдэгдэх жишээ хэрэг.");
  }

  const blueprint = sampleCaseBlueprint(variant);
  const result = await deps.runAnalysis(
    blueprint.request,
    blueprint.retrievedRules,
  );
  const intake = intakeFromAnalysisRequest(
    "pending",
    blueprint.request,
    actor.userId,
  );
  const file = await deps.repository.create({
    ownerLawyerId: actor.userId,
    title: blueprint.title,
    description: `Development fixture (${variant})`,
    legalDomain: result.domain,
    applicableAt: blueprint.request.applicableAt,
    request: blueprint.request,
    review: result.review,
    mappingLog: [],
    fixtureRules: blueprint.retrievedRules,
    analysisStatus: CaseFileAnalysisStatus.ANALYZED,
    lastAnalyzedAt: new Date(),
    lastAnalysisError: null,
    facts: intake.facts,
    evidence: intake.evidence,
    factEvidenceLinks: intake.factEvidenceLinks,
  });
  return toWorkspacePayload(file);
}
