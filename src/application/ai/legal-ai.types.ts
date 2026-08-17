import type { PromptTurnKind, UserTypeContext } from "@/engine/gateway";

export type LegalAiMessageRole = "USER" | "ASSISTANT" | "SYSTEM";

export type LegalAiStoredMessage = {
  role: LegalAiMessageRole;
  content: string;
};

export type LegalAiConversation = {
  id: string;
};

export type LegalAiAssistantMessage = {
  id: string;
  role: "ASSISTANT";
  content: string;
};

export type LegalAiCreateTurnInput = {
  userId: string;
  message: string;
  conversationId?: string;
  userContext?: UserTypeContext;
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

export type LegalAiStore = {
  findOwnedConversation(
    id: string,
    userId: string,
  ): Promise<LegalAiConversation | null>;
  createConversation(input: {
    userId: string;
    title: string;
  }): Promise<LegalAiConversation>;
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
    citations: Array<{
      title: string;
      sourceType: string;
      sourceUrl?: string | null;
      reference?: string | null;
      excerpt?: string | null;
    }>;
  }): Promise<void>;
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
