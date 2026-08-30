import type {
  LegalAiCitationPersistInput,
  LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import type { PromptTurnKind, UserTypeContext } from "@/engine/gateway";
import { type UserRole, LegalQuestionStatus } from "@/domain/enums";
import type { LegalAiCapability } from "@/application/ai/legal-ai-capability";
import type { LegalAiTaskType } from "@/application/ai/legal-ai-task";

export type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";
export { LegalQuestionStatus };

export type LegalAiMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type LegalAiStoredMessage = {
  role: LegalAiMessageRole;
  content: string;
};

export type LegalAiConversation = {
  id: string;
  questionStatus: LegalQuestionStatus;
  billedQuestionCount: number;
  caseFileId?: string | null;
};

export type LegalAiAssistantMessage = {
  id: string;
  role: "ASSISTANT";
  content: string;
  citations?: LegalAiSafeCitation[];
};

export type LegalAiMode = "CITIZEN" | "PROFESSIONAL";

export type LegalAiCreateTurnInput = {
  userId?: string;
  guestSessionId?: string;
  actorRole?: UserRole;
  message: string;
  conversationId?: string;
  /** Set only after the HTTP layer verifies CaseFile.ownerLawyerId === userId. */
  caseFileId?: string;
  userContext?: UserTypeContext;
  /**
   * @deprecated Ignored for authorization. Capability is derived from
   * {@link actorRole}. Kept so old clients sending `mode` do not fail JSON parse.
   */
  mode?: LegalAiMode;
};

export type LegalAiCreateTurnResult = {
  conversationId: string;
  message: LegalAiAssistantMessage;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  turnKind: PromptTurnKind;
  capability: LegalAiCapability;
  taskType?: LegalAiTaskType;
  retrievalInvoked?: boolean;
};

export type LegalAiDocumentExtractStatus =
  | "OK"
  | "EMPTY"
  | "FAILED"
  | "NEEDS_OCR";

export type LegalAiConversationDocumentExtract = {
  fileName: string;
  extractedText: string;
  extractStatus: LegalAiDocumentExtractStatus;
};

export type LegalAiConversationDocumentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: LegalAiDocumentExtractStatus;
  pageCount: number | null;
};

export type LegalAiCaseConversationSummary = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LegalAiRecentConversationSummary = {
  id: string;
  title: string | null;
  caseFileId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LegalAiStore = {
  countUserLegalAiQuestions(
    userId: string,
  ): Promise<number>;
  findOwnedConversation(
    id: string,
    userId: string,
  ): Promise<LegalAiConversation | null>;
  findAccessibleConversation(input: {
    id: string;
    userId?: string;
    guestSessionId?: string;
  }): Promise<LegalAiConversation | null>;
  createConversation(input: {
    userId?: string;
    guestSessionId?: string;
    title: string;
    caseFileId?: string;
  }): Promise<LegalAiConversation>;
  listOwnedCaseConversations(
    userId: string,
    caseFileId: string,
  ): Promise<LegalAiCaseConversationSummary[]>;
  listOwnedRecentConversations(
    userId: string,
    take: number,
  ): Promise<LegalAiRecentConversationSummary[]>;
  updateQuestionThread(input: {
    conversationId: string;
    questionStatus: LegalQuestionStatus;
    incrementBilledQuestion?: boolean;
  }): Promise<void>;
  countBilledQuestionsForUser(userId: string): Promise<number>;
  createUserMessage(input: {
    conversationId: string;
    content: string;
  }): Promise<void>;
  listMessages(
    conversationId: string,
    take: number,
  ): Promise<LegalAiStoredMessage[]>;
  createAssistantMessage(input: {
    conversationId: string;
    content: string;
    provider?: "OPENAI";
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<LegalAiAssistantMessage>;
  recordUsage(input: {
    userId: string;
    provider: "OPENAI";
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void>;
  createCitations(input: {
    messageId: string;
    citations: LegalAiCitationPersistInput[];
  }): Promise<LegalAiSafeCitation[]>;
  listOwnedDocumentExtracts(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentExtract[]>;
  listOwnedDocumentMetas(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentMeta[]>;
  findDocumentByStorageKey(
    storageKey: string,
  ): Promise<{ userId: string } | null>;
  createConversationDocument(input: {
    conversationId: string;
    userId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
    pageCount: number | null;
    extractStatus: LegalAiDocumentExtractStatus;
  }): Promise<LegalAiConversationDocumentMeta>;
};

export type LegalAiCompletionResult = {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type LegalAiCompletionPort = {
  isConfigured(): boolean;
  complete(input: {
    systemPrompt: string;
    messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>;
  }): Promise<LegalAiCompletionResult>;
};
