import { beforeEach, describe, expect, it } from "vitest";

import type { ActorContext } from "@/application/common/actor-context";
import type {
  LegalAiCompletionPort,
  LegalAiCompletionResult,
} from "@/application/ai/legal-ai.types";
import type {
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusVerifyInput,
  LegalCitationVerifyResult,
} from "@/application/ai/legal-corpus";
import {
  generateCaseDraftForLawyer,
  listCaseDraftsForLawyer,
  type CaseDraftDeps,
} from "@/application/use-cases/case-review/case-draft";
import { createCaseFileForLawyer } from "@/application/use-cases/case-review";
import type { CaseFileDeps } from "@/application/use-cases/case-review/deps";
import { runPersistedCaseAnalysis } from "@/application/use-cases/case-review/deps";
import {
  CaseDraftType,
  LAWYER_POSITION_SECTION_ORDER,
} from "@/domain/entities/case-draft";
import { UserRole } from "@/domain/enums";
import { LegalDomain } from "@/engine/doctrine";
import { ForbiddenError, NotImplementedError } from "@/domain/errors/domain-error";
import { InMemoryCaseFileRepository } from "@/infrastructure/repositories/in-memory-case-file-repository";
import { InMemoryCaseDraftRepository } from "@/infrastructure/repositories/in-memory-case-draft-repository";

const lawyerA: ActorContext = { userId: "lawyer-a", role: UserRole.LAWYER };
const lawyerB: ActorContext = { userId: "lawyer-b", role: UserRole.LAWYER };

function emptySectionsJson(): string {
  const sections: Record<string, unknown[]> = {};
  for (const key of LAWYER_POSITION_SECTION_ORDER) sections[key] = [];
  return JSON.stringify(sections);
}

function stubCompletion(
  respond: (input: { systemPrompt: string }) => LegalAiCompletionResult | Promise<LegalAiCompletionResult>,
  configured = true,
): LegalAiCompletionPort {
  return { isConfigured: () => configured, complete: async (input) => respond(input) };
}

function makeResult(content: string): LegalAiCompletionResult {
  return { content, model: "test-model", provider: "OPENAI", inputTokens: 5, outputTokens: 5 };
}

function stubCorpusRetriever(): LegalCorpusRetriever {
  return {
    async retrieveExactCitation(): Promise<LegalCorpusRetrieveResult> {
      return { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null };
    },
    async retrieveLegalQuestion(
      _input: LegalCorpusRetrieveInput,
    ): Promise<LegalCorpusRetrieveResult> {
      return { kind: "unavailable", reason: "not_found", authorities: [], retrievedAt: null };
    },
    async verifyCitation(_input: LegalCorpusVerifyInput): Promise<LegalCitationVerifyResult> {
      return {
        ok: true,
        verdict: { query: "", status: "VALID", nodeId: null, documentVersionId: null, locator: null, reasons: [] },
      };
    },
  };
}

describe("generateCaseDraftForLawyer", () => {
  let caseFileRepository: InMemoryCaseFileRepository;
  let draftRepository: InMemoryCaseDraftRepository;
  let caseDeps: CaseFileDeps;

  beforeEach(() => {
    caseFileRepository = new InMemoryCaseFileRepository();
    draftRepository = new InMemoryCaseDraftRepository();
    caseDeps = { repository: caseFileRepository, runAnalysis: runPersistedCaseAnalysis };
  });

  async function ownedCase(actor = lawyerA, title = "Худалдааны маргаан") {
    return createCaseFileForLawyer(actor, { title, legalDomain: LegalDomain.CIVIL }, caseDeps);
  }

  function deps(overrides: Partial<CaseDraftDeps> = {}): CaseDraftDeps {
    return {
      caseFileRepository,
      draftRepository,
      corpusRetriever: stubCorpusRetriever(),
      completion: stubCompletion(() => makeResult(emptySectionsJson())),
      ...overrides,
    };
  }

  it("generates an OK LAWYER_POSITION draft with empty sections when the model returns valid empty JSON", async () => {
    const file = await ownedCase();
    const result = await generateCaseDraftForLawyer(
      lawyerA,
      file.id,
      CaseDraftType.LAWYER_POSITION,
      deps(),
    );
    expect(result.status).toBe("OK");
    expect(result.draftType).toBe(CaseDraftType.LAWYER_POSITION);
    expect(result.content?.sections.factSummary.statements).toEqual([]);
  });

  it("throws NotImplementedError for PROSECUTOR_CONCLUSION_STRUCTURE without ever calling the completion port", async () => {
    const file = await ownedCase();
    let called = false;
    const completion = stubCompletion(() => {
      called = true;
      return makeResult(emptySectionsJson());
    });
    await expect(
      generateCaseDraftForLawyer(
        lawyerA,
        file.id,
        CaseDraftType.PROSECUTOR_CONCLUSION_STRUCTURE,
        deps({ completion }),
      ),
    ).rejects.toBeInstanceOf(NotImplementedError);
    expect(called).toBe(false);
    expect(await draftRepository.listByCaseFileId(file.id)).toEqual([]);
  });

  it("throws NotImplementedError for COURT_QUESTIONS without persisting anything", async () => {
    const file = await ownedCase();
    await expect(
      generateCaseDraftForLawyer(lawyerA, file.id, CaseDraftType.COURT_QUESTIONS, deps()),
    ).rejects.toBeInstanceOf(NotImplementedError);
    expect(await draftRepository.listByCaseFileId(file.id)).toEqual([]);
  });

  it("persists a FAILED draft when the completion port is not configured", async () => {
    const file = await ownedCase();
    const result = await generateCaseDraftForLawyer(
      lawyerA,
      file.id,
      CaseDraftType.LAWYER_POSITION,
      deps({ completion: stubCompletion(() => makeResult(""), false) }),
    );
    expect(result.status).toBe("FAILED");
    expect(result.content).toBeNull();
  });

  it("persists a FAILED draft when the model returns invalid JSON", async () => {
    const file = await ownedCase();
    const result = await generateCaseDraftForLawyer(
      lawyerA,
      file.id,
      CaseDraftType.LAWYER_POSITION,
      deps({ completion: stubCompletion(() => makeResult("not json")) }),
    );
    expect(result.status).toBe("FAILED");
  });

  it("rejects generating a draft for a case the actor does not own", async () => {
    const file = await ownedCase(lawyerA);
    await expect(
      generateCaseDraftForLawyer(lawyerB, file.id, CaseDraftType.LAWYER_POSITION, deps()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists drafts most recent first and rejects listing for a non-owner", async () => {
    const file = await ownedCase();
    const d = deps();
    await generateCaseDraftForLawyer(lawyerA, file.id, CaseDraftType.LAWYER_POSITION, d);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await generateCaseDraftForLawyer(lawyerA, file.id, CaseDraftType.LAWYER_POSITION, d);
    const list = await listCaseDraftsForLawyer(lawyerA, file.id, d);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(second.id);
    await expect(listCaseDraftsForLawyer(lawyerB, file.id, d)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("marks an unsupported LAW statement down to UNCERTAINTY, matching the analysis grounding rule", async () => {
    const file = await ownedCase();
    const sections: Record<string, unknown[]> = {};
    for (const key of LAWYER_POSITION_SECTION_ORDER) sections[key] = [];
    sections.legalBasis = [
      { kind: "LAW", text: "Хуулийн зохицуулалт заавал байх ёстой.", citationRefs: [] },
    ];
    const completion = stubCompletion(() => makeResult(JSON.stringify(sections)));
    const result = await generateCaseDraftForLawyer(
      lawyerA,
      file.id,
      CaseDraftType.LAWYER_POSITION,
      deps({ completion }),
    );
    expect(result.status).toBe("OK");
    expect(result.content?.sections.legalBasis.statements[0]?.kind).toBe("UNCERTAINTY");
  });
});
