import type {
  LegalAiCitationPersistInput,
  LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";
import type { PromptTurnKind, UserTypeContext } from "@/engine/gateway";
import { type UserRole, LegalQuestionStatus } from "@/domain/enums";

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
  userContext?: UserTypeContext;
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
};

export type LegalAiConversationDocumentExtract = {
  fileName: string;
  extractedText: string;
};

export type LegalAiConversationDocumentMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractStatus: "OK" | "EMPTY" | "FAILED";
  pageCount: number | null;
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
  }): Promise<LegalAiConversation>;
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
  findOwnedDocumentExtract(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentExtract | null>;
  findOwnedDocumentMeta(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentMeta | null>;
  findDocumentByStorageKey(
    storageKey: string,
  ): Promise<{ userId: string } | null>;
  findDocumentIdByConversationId(
    conversationId: string,
  ): Promise<string | null>;
  createConversationDocument(input: {
    conversationId: string;
    userId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
    pageCount: number | null;
    extractStatus: "OK";
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
