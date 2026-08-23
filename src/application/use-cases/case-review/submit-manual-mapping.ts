import { randomUUID } from "node:crypto";

import type { ActorContext } from "@/application/common/actor-context";
import { CaseFileAnalysisStatus } from "@/domain/entities/case-file";
import type { ManualMappingLogEntry } from "@/domain/entities/case-file";
import { ConflictError, ValidationError } from "@/domain/errors/domain-error";
import {
  MappingMethod,
  type CaseAnalysisRequest,
  type CaseReviewWorkspacePayload,
  type ExplicitFactMappingInput,
} from "@/engine/doctrine";

import { requireOwnedCaseFile } from "./assert-access";
import type { CaseFileDeps } from "./deps";
import { defaultCaseFileDeps } from "./deps";
import { toWorkspacePayload } from "./payload";
import { isCaseAnalysisRequest, validateManualMapping } from "./view-model";

export type SubmitManualMappingInput = {
  caseId: string;
  expectedVersion: number;
  factId: string;
  elementId: string;
  relation: string;
  evidenceIds?: string[];
};

function requireRequest(request: CaseAnalysisRequest): CaseAnalysisRequest {
  if (!isCaseAnalysisRequest(request)) {
    throw new ValidationError("Malformed analysis request.");
  }
  return request;
}

function nextAnalyzedAt(previous: Date | null, now = new Date()): Date {
  if (previous && now.getTime() <= previous.getTime()) {
    return new Date(previous.getTime() + 1);
  }
  return now;
}

function upsertActiveMapping(
  mappings: ExplicitFactMappingInput[],
  next: ExplicitFactMappingInput,
): ExplicitFactMappingInput[] {
  const index = mappings.findIndex(
    (m) => m.factId === next.factId && m.elementId === next.elementId,
  );
  if (index === -1) return [...mappings, next];
  const copy = mappings.slice();
  copy[index] = next;
  return copy;
}

export async function submitManualMappingForLawyer(
  actor: ActorContext,
  input: SubmitManualMappingInput,
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ValidationError("A current case version is required.");
  }
  const request = requireRequest(file.request);
  const review = toWorkspacePayload(file).review;
  const validated = validateManualMapping(
    review,
    {
      factId: input.factId,
      elementId: input.elementId,
      relation: input.relation,
      evidenceIds: input.evidenceIds,
    },
    { facts: request.facts, evidence: request.evidence },
  );
  if (!validated.ok) {
    throw new ValidationError(validated.error);
  }

  const fact = request.facts.find((f) => f.id === validated.draft.factId);
  const engineMapping: ExplicitFactMappingInput = {
    factId: validated.draft.factId,
    elementId: validated.draft.elementId,
    relation: validated.draft.relation as ExplicitFactMappingInput["relation"],
    method: MappingMethod.MANUAL,
    explanation: `Lawyer MANUAL mapping of ${validated.draft.factId} → ${validated.draft.elementId}.`,
    evidenceIds: validated.draft.evidenceIds,
  };
  const nextRequest: CaseAnalysisRequest = {
    ...request,
    mappings: upsertActiveMapping(
      [...(request.mappings ?? [])],
      engineMapping,
    ),
  };
  const logEntry: ManualMappingLogEntry = {
    id: `maplog:${randomUUID()}`,
    recordedAt: new Date().toISOString(),
    recordedByUserId: actor.userId,
    factId: validated.draft.factId,
    factText: fact?.statement ?? "",
    elementId: validated.draft.elementId,
    relation: validated.draft.relation,
    evidenceIds: validated.draft.evidenceIds,
    method: "MANUAL",
    applicableAt: file.applicableAt,
  };
  const mappingLog = [...file.mappingLog, logEntry];

  let analysisStatus: string = CaseFileAnalysisStatus.ANALYZED;
  let lastAnalysisError: string | null = null;
  let reviewSnapshot = file.review;
  let lastAnalyzedAt = file.lastAnalyzedAt;
  try {
    const result = await deps.runAnalysis(nextRequest, file.fixtureRules);
    reviewSnapshot = result.review;
    lastAnalyzedAt = nextAnalyzedAt(file.lastAnalyzedAt);
    analysisStatus = CaseFileAnalysisStatus.ANALYZED;
  } catch {
    analysisStatus = CaseFileAnalysisStatus.ANALYSIS_FAILED;
    lastAnalysisError = "Analysis failed. Previous review was preserved.";
  }

  const updated = await deps.repository.updateIfVersionMatch(
    file.id,
    input.expectedVersion,
    {
      request: nextRequest,
      mappingLog,
      review: reviewSnapshot,
      analysisStatus,
      lastAnalyzedAt,
      lastAnalysisError,
    },
  );
  if (!updated) {
    throw new ConflictError("Case file was updated in another session.");
  }
  return toWorkspacePayload(updated);
}

export async function rerunCaseAnalysisForLawyer(
  actor: ActorContext,
  input: { caseId: string; expectedVersion: number },
  deps: CaseFileDeps = defaultCaseFileDeps(),
): Promise<CaseReviewWorkspacePayload> {
  const file = await requireOwnedCaseFile(actor, input.caseId, deps.repository);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new ValidationError("A current case version is required.");
  }
  const request = requireRequest(file.request);

  let analysisStatus: string = CaseFileAnalysisStatus.ANALYZED;
  let lastAnalysisError: string | null = null;
  let reviewSnapshot = file.review;
  let lastAnalyzedAt = file.lastAnalyzedAt;
  try {
    const result = await deps.runAnalysis(request, file.fixtureRules);
    reviewSnapshot = result.review;
    lastAnalyzedAt = nextAnalyzedAt(file.lastAnalyzedAt);
    analysisStatus = CaseFileAnalysisStatus.ANALYZED;
  } catch {
    analysisStatus = CaseFileAnalysisStatus.ANALYSIS_FAILED;
    lastAnalysisError = "Analysis failed. Previous review was preserved.";
  }

  const updated = await deps.repository.updateIfVersionMatch(
    file.id,
    input.expectedVersion,
    {
      review: reviewSnapshot,
      analysisStatus,
      lastAnalyzedAt,
      lastAnalysisError,
    },
  );
  if (!updated) {
    throw new ConflictError("Case file was updated in another session.");
  }
  return toWorkspacePayload(updated);
}
