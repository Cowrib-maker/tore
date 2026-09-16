import type { ActorContext } from "@/application/common/actor-context";
import { createCompletion, createCorpusRetriever } from "@/application/ai/create-legal-ai-service";
import { buildLegalAiCaseContext, formatLegalAiCaseContextBlock } from "@/application/ai/legal-ai-case-context";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { resolveLegalAuthorities } from "@/application/ai/resolve-legal-authorities";
import { retrieveCaseDocumentExcerpts } from "@/application/case-ai/case-document-retriever";
import { buildCaseAnalysisCitations } from "@/application/case-ai/case-analysis-prompt";
import {
  buildLawyerPositionDraftPrompt,
  parseLawyerPositionDraftResponse,
} from "@/application/case-ai/case-draft-lawyer-position";
import { CaseDraftType, type CaseDraftResult } from "@/domain/entities/case-draft";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import type { CaseDraftRepository } from "@/domain/repositories/case-draft-repository";
import { NotImplementedError } from "@/domain/errors/domain-error";
import { logCaseAiEvent } from "@/infrastructure/observability/case-ai-metrics";
import { caseFileRepository } from "@/infrastructure/repositories/prisma-case-file-repository";
import { caseDraftRepository } from "@/infrastructure/repositories/prisma-case-draft-repository";

import { requireOwnedCaseFile } from "./assert-access";

const GENERIC_FAILURE_REASON = "Төслийг AI-аар боловсруулах явцад алдаа гарлаа.";
const MAX_QUESTION_CHARS = 1200;

export type CaseDraftDeps = {
  caseFileRepository: CaseFileRepository;
  draftRepository: CaseDraftRepository;
  corpusRetriever: LegalCorpusRetriever;
  completion: LegalAiCompletionPort;
};

/**
 * Concrete static imports, not a runtime `require()` against the
 * `@/infrastructure/repositories` barrel — see the matching comment in
 * case-ai-analysis.ts for why that pattern resolved `caseFileRepository`
 * to `undefined` at runtime.
 */
export function defaultCaseDraftDeps(): CaseDraftDeps {
  return {
    caseFileRepository,
    draftRepository: caseDraftRepository,
    corpusRetriever: createCorpusRetriever(),
    completion: createCompletion(),
  };
}

function buildLegalQuestion(input: {
  title: string;
  legalDomain: string;
  description: string | null;
}): string {
  const parts = [input.title, input.legalDomain, input.description ?? ""].filter(Boolean);
  return parts.join(". ").slice(0, MAX_QUESTION_CHARS);
}

/**
 * Sprint 13 Phase 8 — Draft Generator V1. Only CaseDraftType.LAWYER_POSITION
 * is actually implemented; PROSECUTOR_CONCLUSION_STRUCTURE and
 * COURT_QUESTIONS exist in the schema for forward compatibility but throw
 * NotImplementedError here rather than producing shallow/fake output — see
 * the Sprint 13 final report for why those were deliberately deferred.
 */
export async function generateCaseDraftForLawyer(
  actor: ActorContext,
  caseId: string,
  draftType: CaseDraftType,
  deps: CaseDraftDeps = defaultCaseDraftDeps(),
): Promise<CaseDraftResult> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);

  if (draftType !== CaseDraftType.LAWYER_POSITION) {
    logCaseAiEvent({ operation: "caseDraftGeneration", outcome: "not_implemented" });
    throw new NotImplementedError(
      "Энэ төслийн төрөл (" + draftType + ") V1-д хараахан бэлэн болоогүй байна.",
    );
  }

  if (!deps.completion.isConfigured()) {
    logCaseAiEvent({ operation: "caseDraftGeneration", outcome: "not_configured" });
    return deps.draftRepository.create({
      caseFileId: file.id,
      draftType,
      createdByUserId: actor.userId,
      status: "FAILED",
      failureReason: "AI үйлчилгээний тохиргоо хийгдээгүй байна.",
    });
  }

  try {
    const question = buildLegalQuestion({
      title: file.title,
      legalDomain: file.legalDomain,
      description: file.description,
    });

    const [authorities, excerpts] = await Promise.all([
      resolveLegalAuthorities({
        question,
        retriever: deps.corpusRetriever,
        requireRetrieval: true,
      }),
      Promise.resolve(retrieveCaseDocumentExcerpts(file.evidence, question)),
    ]);

    const verifiedAuthorities = authorities.kind === "verified" ? authorities.authorities : [];
    const citations = buildCaseAnalysisCitations({ authorities: verifiedAuthorities, excerpts });

    const caseContextBlock = formatLegalAiCaseContextBlock(buildLegalAiCaseContext(file));

    const systemPrompt = buildLawyerPositionDraftPrompt({
      caseTitle: file.title,
      legalDomain: file.legalDomain,
      caseContextBlock,
      authorities: verifiedAuthorities,
      excerpts,
      citations,
    });

    const completion = await deps.completion.complete({
      systemPrompt,
      messages: [
        {
          role: "user",
          content: "Дээрх мэдээлэлд үндэслэн байр суурийн төслийг JSON хэлбэрээр гаргана уу.",
        },
      ],
    });

    const parsed = parseLawyerPositionDraftResponse(completion.content, citations);
    if (!parsed.ok) {
      logCaseAiEvent({ operation: "caseDraftGeneration", outcome: "invalid_model_output" });
      return deps.draftRepository.create({
        caseFileId: file.id,
        draftType,
        createdByUserId: actor.userId,
        status: "FAILED",
        failureReason: GENERIC_FAILURE_REASON,
      });
    }

    logCaseAiEvent({
      operation: "caseDraftGeneration",
      outcome: "ok",
      count: parsed.content.citations.length,
    });
    return await deps.draftRepository.create({
      caseFileId: file.id,
      draftType,
      createdByUserId: actor.userId,
      status: "OK",
      content: parsed.content,
    });
  } catch (error) {
    console.error("[case-draft] generation failed", { caseId: file.id, draftType });
    void error;
    logCaseAiEvent({ operation: "caseDraftGeneration", outcome: "failed" });
    return deps.draftRepository.create({
      caseFileId: file.id,
      draftType,
      createdByUserId: actor.userId,
      status: "FAILED",
      failureReason: GENERIC_FAILURE_REASON,
    });
  }
}

export async function listCaseDraftsForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseDraftDeps = defaultCaseDraftDeps(),
): Promise<CaseDraftResult[]> {
  await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);
  return deps.draftRepository.listByCaseFileId(caseId);
}
