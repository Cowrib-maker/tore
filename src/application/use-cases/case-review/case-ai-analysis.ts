import type { ActorContext } from "@/application/common/actor-context";
import { createCompletion, createCorpusRetriever } from "@/application/ai/create-legal-ai-service";
import { buildLegalAiCaseContext, formatLegalAiCaseContextBlock } from "@/application/ai/legal-ai-case-context";
import type { LegalCorpusRetriever } from "@/application/ai/legal-corpus";
import { resolveLegalAuthorities } from "@/application/ai/resolve-legal-authorities";
import { retrieveCaseDocumentExcerpts } from "@/application/case-ai/case-document-retriever";
import {
  buildCaseAnalysisCitations,
  buildCaseAnalysisSystemPrompt,
} from "@/application/case-ai/case-analysis-prompt";
import {
  parseCaseAnalysisResponse,
  pruneUnusedCitations,
  remapSectionCitationRefs,
} from "@/application/case-ai/case-analysis-schema";
import type { CaseAiAnalysisResult } from "@/domain/entities/case-ai-analysis";
import type { CaseFileRepository } from "@/domain/repositories/case-file-repository";
import type { CaseAiAnalysisRepository } from "@/domain/repositories/case-ai-analysis-repository";
import type { LegalAiCompletionPort } from "@/application/ai/legal-ai.types";
import { logCaseAiEvent } from "@/infrastructure/observability/case-ai-metrics";
import { caseFileRepository } from "@/infrastructure/repositories/prisma-case-file-repository";
import { caseAiAnalysisRepository } from "@/infrastructure/repositories/prisma-case-ai-analysis-repository";

import { requireOwnedCaseFile } from "./assert-access";

const GENERIC_FAILURE_REASON =
  "Хэргийн шинжилгээг AI-аар боловсруулах явцад алдаа гарлаа.";

export type CaseAiAnalysisDeps = {
  caseFileRepository: CaseFileRepository;
  analysisRepository: CaseAiAnalysisRepository;
  corpusRetriever: LegalCorpusRetriever;
  completion: LegalAiCompletionPort;
};

/**
 * Concrete static imports, not a runtime `require()` against the
 * `@/infrastructure/repositories` barrel: that barrel is also reached via
 * `create-legal-ai-service.ts`'s own static imports above, and a runtime
 * `require()` re-entering it mid-initialization can hand back a stale/
 * partial exports snapshot under Turbopack's CJS/ESM interop — confirmed
 * in browser QA as the cause of `caseFileRepository` resolving to
 * `undefined` here. Mirrors the working pattern in prod-wiring.ts.
 */
export function defaultCaseAiAnalysisDeps(): CaseAiAnalysisDeps {
  return {
    caseFileRepository,
    analysisRepository: caseAiAnalysisRepository,
    corpusRetriever: createCorpusRetriever(),
    completion: createCompletion(),
  };
}

/** Bounds the case description text fed into the legal-authority question
 * so one huge case doesn't blow the corpus retriever's own input handling. */
const MAX_QUESTION_CHARS = 1200;

function buildLegalQuestion(input: {
  title: string;
  legalDomain: string;
  description: string | null;
}): string {
  const parts = [input.title, input.legalDomain, input.description ?? ""].filter(
    Boolean,
  );
  return parts.join(". ").slice(0, MAX_QUESTION_CHARS);
}

/**
 * Sprint 13 Phase 3+5+6 — generates one grounded Case Analysis V1 run for
 * an owned CaseFile. Never overwrites CaseFile.reviewJson (that remains the
 * deterministic doctrine engine's own output) — this is a wholly additive
 * CaseAiAnalysis row. On any failure (AI unconfigured, completion error,
 * malformed model output) a FAILED row is persisted with a safe, non-PII
 * reason instead of throwing past the caller, so a lawyer always sees why
 * an analysis attempt did not produce a result.
 */
export async function generateCaseAiAnalysisForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiAnalysisDeps = defaultCaseAiAnalysisDeps(),
): Promise<CaseAiAnalysisResult> {
  const file = await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);

  if (!deps.completion.isConfigured()) {
    logCaseAiEvent({ operation: "caseAiAnalysis", outcome: "not_configured" });
    return deps.analysisRepository.create({
      caseFileId: file.id,
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

    const retrievalStart = Date.now();
    const [authorities, excerpts] = await Promise.all([
      resolveLegalAuthorities({
        question,
        retriever: deps.corpusRetriever,
        requireRetrieval: true,
      }),
      Promise.resolve(retrieveCaseDocumentExcerpts(file.evidence, question)),
    ]);
    logCaseAiEvent({
      operation: "caseDocumentRetrieval",
      outcome: excerpts.length > 0 ? "ok" : "empty",
      count: excerpts.length,
      latencyMs: Date.now() - retrievalStart,
    });

    const verifiedAuthorities = authorities.kind === "verified" ? authorities.authorities : [];
    const citations = buildCaseAnalysisCitations({
      authorities: verifiedAuthorities,
      excerpts,
    });

    const caseContextBlock = formatLegalAiCaseContextBlock(
      buildLegalAiCaseContext(file),
    );

    const systemPrompt = buildCaseAnalysisSystemPrompt({
      caseTitle: file.title,
      legalDomain: file.legalDomain,
      caseContextBlock,
      authorities: verifiedAuthorities,
      excerpts,
      citations,
      missingLegalSourceNote: authorities.kind !== "verified",
    });

    const completion = await deps.completion.complete({
      systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Дээрх мэдээлэлд үндэслэн бүтэцтэй хэрэг шинжилгээг JSON хэлбэрээр гаргана уу.",
        },
      ],
    });

    const parsed = parseCaseAnalysisResponse(completion.content, citations.length);
    if (!parsed.ok) {
      logCaseAiEvent({ operation: "caseAiAnalysis", outcome: "invalid_model_output" });
      return deps.analysisRepository.create({
        caseFileId: file.id,
        createdByUserId: actor.userId,
        status: "FAILED",
        failureReason: GENERIC_FAILURE_REASON,
      });
    }

    const { citations: prunedCitations, remap } = pruneUnusedCitations(
      citations,
      parsed.usedCitationIndices,
    );
    const sections = remapSectionCitationRefs(parsed.sections, remap);

    logCaseAiEvent({
      operation: "caseAiAnalysis",
      outcome: "ok",
      count: prunedCitations.length,
    });
    return await deps.analysisRepository.create({
      caseFileId: file.id,
      createdByUserId: actor.userId,
      status: "OK",
      sections,
      citations: prunedCitations,
      provider: completion.provider,
      model: completion.model,
    });
  } catch (error) {
    console.error("[case-ai-analysis] generation failed", {
      caseId: file.id,
    });
    void error;
    logCaseAiEvent({ operation: "caseAiAnalysis", outcome: "failed" });
    return deps.analysisRepository.create({
      caseFileId: file.id,
      createdByUserId: actor.userId,
      status: "FAILED",
      failureReason: GENERIC_FAILURE_REASON,
    });
  }
}

export async function getLatestCaseAiAnalysisForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiAnalysisDeps = defaultCaseAiAnalysisDeps(),
): Promise<CaseAiAnalysisResult | null> {
  await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);
  return deps.analysisRepository.findLatestByCaseFileId(caseId);
}

export async function listCaseAiAnalysesForLawyer(
  actor: ActorContext,
  caseId: string,
  deps: CaseAiAnalysisDeps = defaultCaseAiAnalysisDeps(),
): Promise<CaseAiAnalysisResult[]> {
  await requireOwnedCaseFile(actor, caseId, deps.caseFileRepository);
  return deps.analysisRepository.listByCaseFileId(caseId);
}
