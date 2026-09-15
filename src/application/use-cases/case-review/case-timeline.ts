import type { ActorContext } from "@/application/common/actor-context";
import { extractCaseTimelineEntries } from "@/application/case-ai/case-timeline-extractor";
import type { CaseTimelineEntry } from "@/domain/entities/case-timeline";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import type { CaseTimelineRepository } from "@/domain/repositories/case-timeline-repository";
import { logCaseAiEvent } from "@/infrastructure/observability/case-ai-metrics";

import { requireOwnedCaseFile } from "./assert-access";

export type CaseTimelineDeps = {
  caseFileRepository: CaseFileRepository;
  timelineRepository: CaseTimelineRepository;
};

export function defaultCaseTimelineDeps(): CaseTimelineDeps {
  const {
    caseFileRepository,
    caseTimelineRepository,
  } = require("@/infrastructure/repositories") as typeof import("@/infrastructure/repositories");
  return { caseFileRepository, timelineRepository: caseTimelineRepository };
}

/**
 * Sprint 13 Phase 9 — (re-)runs the deterministic timeline extractor over
 * an owned CaseFile's current evidence and persists the result, replacing
 * whatever timeline previously existed for the case. No LLM is involved.
 */
export async function extractCaseTimelineForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseTimelineDeps = defaultCaseTimelineDeps(),
): Promise<CaseTimelineEntry[]> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);
  const drafts = extractCaseTimelineEntries(file.evidence);
  logCaseAiEvent({
    operation: "caseTimelineExtraction",
    outcome: drafts.length > 0 ? "ok" : "empty",
    count: drafts.length,
  });
  return deps.timelineRepository.replaceForCaseFile(file.id, drafts);
}

export async function listCaseTimelineForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseTimelineDeps = defaultCaseTimelineDeps(),
): Promise<CaseTimelineEntry[]> {
  await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);
  return deps.timelineRepository.listByCaseFileId(caseId);
}
