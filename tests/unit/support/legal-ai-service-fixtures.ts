/**
 * Shared LegalAiService test fixtures (store/completion/retriever/service
 * factories). Deliberately NOT named *.test.ts: vitest's test glob
 * (tests/unit/**\/*.test.ts) only collects real test files, and importing
 * a *.test.ts file's exports from another test file still evaluates its
 * top-level `describe`/`it` calls as a side effect — silently re-running
 * that file's entire suite wherever it's imported. Keeping fixtures here
 * avoids that trap while still letting legal-ai.service.test.ts and
 * legal-ai-service-streaming.test.ts share one implementation.
 */
import { vi } from "vitest";

import {
  LegalAiService,
} from "@/application/ai/legal-ai.service";
import {
  CitationVerificationStatus,
  type LegalCorpusRetriever,
  type LegalCorpusRetrieveInput,
  type LegalCorpusRetrieveResult,
} from "@/application/ai/legal-corpus";
import type {
  LegalAiCompletionPort,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import type { LegalQuestionAccessPort } from "@/application/legal-ai/legal-question-access";
import type { LegalAiCaseContextLoader } from "@/application/ai/legal-ai-case-context";
import { LegalQuestionStatus } from "@/domain/enums";
import {
  PromptBuilderService,
  RuleBasedDomainFilter,
  UserTypeService,
} from "@/engine/gateway";
import { createIntentEngine } from "@/engine/intent";
import { createReasoningEngine } from "@/engine/reasoning";
import { createLegalRelevanceEngine } from "@/engine/relevance";

export function createStore(): LegalAiStore & {
  conversations: Map<
    string,
    {
      id: string;
      userId?: string;
      guestSessionId?: string;
      caseFileId?: string;
      questionStatus: LegalQuestionStatus;
      billedQuestionCount: number;
    }
  >;
  userMessages: string[];
  assistantMessages: string[];
  usageCount: number;
  citations: Array<{
    messageId: string;
    title: string;
    sourceType: string;
    sourceUrl?: string | null;
  }>;
  documentExtracts: Map<
    string,
    Array<{
      userId: string;
      fileName: string;
      extractedText: string;
      extractStatus?: "OK" | "EMPTY" | "FAILED" | "NEEDS_OCR";
    }>
  >;
} {
  const conversations = new Map<
    string,
    {
      id: string;
      userId?: string;
      guestSessionId?: string;
      caseFileId?: string;
      questionStatus: LegalQuestionStatus;
      billedQuestionCount: number;
    }
  >();
  const messages = new Map<string, LegalAiStoredMessage[]>();
  const documentExtracts = new Map<
    string,
    Array<{
      userId: string;
      fileName: string;
      extractedText: string;
      extractStatus?: "OK" | "EMPTY" | "FAILED" | "NEEDS_OCR";
    }>
  >();
  let seq = 0;

  return {
    conversations,
    userMessages: [],
    assistantMessages: [],
    usageCount: 0,
    citations: [],
    documentExtracts,

    async countUserLegalAiQuestions() {
      return this.userMessages.length;
    },

    async findOwnedConversation(id, userId) {
      const row = conversations.get(id);
      if (!row || row.userId !== userId) {
        return null;
      }
      return {
        id: row.id,
        questionStatus: row.questionStatus,
        billedQuestionCount: row.billedQuestionCount,
        caseFileId: row.caseFileId ?? null,
      };
    },
    async findAccessibleConversation(input) {
      const row = conversations.get(input.id);
      if (!row) return null;
      const userOk = input.userId && row.userId === input.userId;
      const guestOk =
        input.guestSessionId && row.guestSessionId === input.guestSessionId;
      if (!userOk && !guestOk) return null;
      return {
        id: row.id,
        questionStatus: row.questionStatus,
        billedQuestionCount: row.billedQuestionCount,
        caseFileId: row.caseFileId ?? null,
      };
    },
    async createConversation(input) {
      const id = `conv-${++seq}`;
      const row = {
        id,
        userId: input.userId,
        guestSessionId: input.guestSessionId,
        caseFileId: input.caseFileId,
        questionStatus: LegalQuestionStatus.NEW,
        billedQuestionCount: 0,
      };
      conversations.set(id, row);
      messages.set(id, []);
      return {
        id,
        questionStatus: row.questionStatus,
        billedQuestionCount: 0,
        caseFileId: row.caseFileId ?? null,
      };
    },
    async listOwnedCaseConversations(userId, caseFileId) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId && row.caseFileId === caseFileId)
        .map((row) => ({
          id: row.id,
          title: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async listOwnedRecentConversations(userId, take) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId)
        .slice(0, take)
        .map((row) => ({
          id: row.id,
          title: null,
          caseFileId: row.caseFileId ?? null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async updateQuestionThread(input) {
      const row = conversations.get(input.conversationId);
      if (!row) return;
      row.questionStatus = input.questionStatus;
      if (input.incrementBilledQuestion) {
        row.billedQuestionCount += 1;
      }
    },
    async countBilledQuestionsForUser(userId) {
      return [...conversations.values()]
        .filter((row) => row.userId === userId)
        .reduce((sum, row) => sum + row.billedQuestionCount, 0);
    },
    async createUserMessage(input) {
      this.userMessages.push(input.content);
      messages.get(input.conversationId)?.push({
        role: "USER",
        content: input.content,
      });
    },
    async listMessages(conversationId) {
      return [...(messages.get(conversationId) ?? [])];
    },
    async createAssistantMessage(input) {
      this.assistantMessages.push(input.content);
      const message = {
        id: `asst-${++seq}`,
        role: "ASSISTANT" as const,
        content: input.content,
      };
      messages.get(input.conversationId)?.push({
        role: "ASSISTANT",
        content: input.content,
      });
      return message;
    },
    async recordUsage() {
      this.usageCount += 1;
    },
    async createCitations(input) {
      const rows = input.citations.map((citation) => ({
        messageId: input.messageId,
        title: citation.title,
        sourceType: citation.sourceType,
        sourceUrl: citation.sourceUrl ?? null,
      }));
      this.citations.push(...rows);
      return input.citations.map((citation, index) => ({
        id: `cite-${input.messageId}-${index + 1}`,
        sourceType: citation.sourceType,
        title: citation.title,
        article: citation.article ?? null,
        paragraph: citation.paragraph ?? null,
        sourceUrl: citation.sourceUrl ?? null,
        sourceVersion: citation.sourceVersion ?? null,
        validFrom: citation.validFrom ?? null,
        validTo: citation.validTo ?? null,
      }));
    },
    async listOwnedDocumentExtracts(conversationId, userId) {
      return (documentExtracts.get(conversationId) ?? [])
        .filter((row) => row.userId === userId)
        .map((row) => ({
          fileName: row.fileName,
          extractedText: row.extractedText,
          extractStatus: row.extractStatus ?? "OK",
        }));
    },
    async listOwnedDocumentMetas(conversationId, userId) {
      return (documentExtracts.get(conversationId) ?? [])
        .filter((row) => row.userId === userId)
        .map((row, index) => ({
          id: `doc-${conversationId}-${index + 1}`,
          fileName: row.fileName,
          mimeType: "application/pdf",
          sizeBytes: row.extractedText.length,
          extractStatus: row.extractStatus ?? "OK",
          pageCount: 1,
        }));
    },
    async findDocumentByStorageKey() {
      return null;
    },
    async createConversationDocument(input) {
      const list = documentExtracts.get(input.conversationId) ?? [];
      list.push({
        userId: input.userId,
        fileName: input.fileName,
        extractedText: input.extractedText,
        extractStatus: input.extractStatus,
      });
      documentExtracts.set(input.conversationId, list);
      return {
        id: `doc-${input.conversationId}-${list.length}`,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractStatus: input.extractStatus,
        pageCount: input.pageCount,
      };
    },
  };
}

export function createCompletion(
  complete: LegalAiCompletionPort["complete"] = async () => ({
    content: "mocked-answer",
    model: "gpt-5.6-luna",
    provider: "OPENAI",
    inputTokens: 11,
    outputTokens: 7,
  }),
  configured = true,
): LegalAiCompletionPort & { complete: ReturnType<typeof vi.fn> } {
  const completeFn = vi.fn(complete);
  return {
    isConfigured: () => configured,
    complete: completeFn,
  };
}

export function createRetriever(
  retrieve: LegalCorpusRetriever["retrieveExactCitation"] = async () => ({
    kind: "unavailable",
    reason: "not_configured",
    authorities: [],
    retrievedAt: null,
  }),
  verify: LegalCorpusRetriever["verifyCitation"] = async () => ({
    ok: false,
    reason: "not_configured",
  }),
): LegalCorpusRetriever & {
  retrieveExactCitation: ReturnType<typeof vi.fn>;
  retrieveLegalQuestion: ReturnType<typeof vi.fn>;
  verifyCitation: ReturnType<typeof vi.fn>;
} {
  const retrieveExactCitation = vi.fn(retrieve);

  const retrieveLegalQuestion = vi.fn(
    async (
      _input: LegalCorpusRetrieveInput,
    ): Promise<LegalCorpusRetrieveResult> => ({
      kind: "unavailable",
      reason: "not_configured",
      authorities: [],
      retrievedAt: null,
    }),
  );

  const verifyCitation = vi.fn(verify);

  return {
    retrieveExactCitation,
    retrieveLegalQuestion,
    verifyCitation,
  };
}

export function sampleVerdict(
  status: (typeof CitationVerificationStatus)[keyof typeof CitationVerificationStatus] = CitationVerificationStatus.VALID,
) {
  if (status === CitationVerificationStatus.VALID) {
    return {
      query: "Эрүүгийн хуулийн 17.1",
      status,
      nodeId: "node-1",
      documentVersionId: "ver-1",
      locator: "art-17.1",
      reasons: ["citation_unique"],
    };
  }
  return {
    query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
    status,
    nodeId: null,
    documentVersionId: null,
    locator: null,
    reasons:
      status === CitationVerificationStatus.CONFLICT
        ? ["citation_conflict"]
        : ["citation_unresolved"],
  };
}

export function sampleAuthority(overrides: Partial<{
  nodeId: string;
  documentVersionId: string;
  excerpt: string;
}> = {}) {
  return {
    nodeId: overrides.nodeId ?? "node-1",
    documentId: "doc-1",
    documentVersionId: overrides.documentVersionId ?? "ver-1",
    locator: "art-17.1",
    title: "Эрүүгийн хууль",
    excerpt: overrides.excerpt ?? "Гэмт хэрэг гэж хуулиар хориглосон үйлдэл.",
    contentHash: "hash-node",
    sourceContentHash: "hash-source",
    parserId: "legalinfo-html-v1",
    archiveRecordId: "arch-1",
    effectiveFrom: "2017-07-01T00:00:00.000Z",
    effectiveTo: null,
  };
}

export function paidLegalQuestionAccess(
  overrides?: Partial<LegalQuestionAccessPort>,
): LegalQuestionAccessPort {
  return {
    async assertCanStartNewLegalQuestion() {
      return { kind: "none" };
    },
    async consumeNewLegalQuestion() {},
    async releaseNewLegalQuestion() {},
    async hasPaidLegalAiAccess() {
      return true;
    },
    ...overrides,
  };
}

export function createService<
  C extends LegalAiCompletionPort = ReturnType<typeof createCompletion>,
>(overrides?: {
  store?: ReturnType<typeof createStore>;
  completion?: C;
  reasoning?: ReturnType<typeof createReasoningEngine>;
  corpusRetriever?: ReturnType<typeof createRetriever>;
  legalQuestionAccess?: LegalQuestionAccessPort;
  caseContextLoader?: LegalAiCaseContextLoader;
}) {
  const store = overrides?.store ?? createStore();
  const completion = overrides?.completion ?? (createCompletion() as unknown as C);
  const reasoning = overrides?.reasoning ?? createReasoningEngine();
  const corpusRetriever = overrides?.corpusRetriever ?? createRetriever();
  const intent = createIntentEngine();
  const domainFilter = new RuleBasedDomainFilter();
  const service = new LegalAiService({
    domainFilter,
    userTypeService: new UserTypeService(),
    promptBuilder: new PromptBuilderService(),
    intent,
    reasoning,
    legalRelevance: createLegalRelevanceEngine({ domainFilter, intent }),
    store,
    completion,
    corpusRetriever,
    legalQuestionAccess: overrides?.legalQuestionAccess,
    caseContextLoader: overrides?.caseContextLoader,
  });
  return { service, store, completion, reasoning, corpusRetriever, intent };
}
