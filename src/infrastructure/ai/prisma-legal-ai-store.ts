import { prisma } from "@/infrastructure/database/prisma";
import type {
  LegalAiAssistantMessage,
  LegalAiConversation,
  LegalAiConversationDocumentExtract,
  LegalAiConversationDocumentMeta,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";
import {
  toSafeLegalAiCitation,
  type LegalAiCitationPersistInput,
  type LegalAiSafeCitation,
} from "@/application/ai/legal-ai-citation";

export class PrismaLegalAiStore implements LegalAiStore {
  async findOwnedConversation(
    id: string,
    userId: string,
  ): Promise<LegalAiConversation | null> {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    return conversation;
  }

  async createConversation(input: {
    userId: string;
    title: string;
  }): Promise<LegalAiConversation> {
    return prisma.aIConversation.create({
      data: {
        userId: input.userId,
        title: input.title,
      },
      select: { id: true },
    });
  }

  async createUserMessage(input: {
    conversationId: string;
    content: string;
  }): Promise<void> {
    await prisma.aIMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "USER",
        content: input.content,
      },
    });
  }

  async listMessages(
    conversationId: string,
    take: number,
  ): Promise<LegalAiStoredMessage[]> {
    const rows = await prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take,
      select: { role: true, content: true },
    });
    return rows;
  }

  async createAssistantMessage(input: {
    conversationId: string;
    content: string;
    provider?: "OPENAI";
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<LegalAiAssistantMessage> {
    const row = await prisma.aIMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "ASSISTANT",
        content: input.content,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      },
      select: { id: true, content: true },
    });
    return {
      id: row.id,
      role: "ASSISTANT",
      content: row.content,
    };
  }

  async recordUsage(input: {
    userId: string;
    provider: "OPENAI";
    model: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    await prisma.aIUsage.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      },
    });
  }

  async createCitations(input: {
    messageId: string;
    citations: LegalAiCitationPersistInput[];
  }): Promise<LegalAiSafeCitation[]> {
    if (input.citations.length === 0) {
      return [];
    }
    const created: LegalAiSafeCitation[] = [];
    for (const citation of input.citations) {
      const row = await prisma.aICitation.create({
        data: {
          messageId: input.messageId,
          title: citation.title,
          sourceType: citation.sourceType,
          sourceUrl: citation.sourceUrl ?? null,
          reference: citation.reference ?? null,
          excerpt: citation.excerpt ?? null,
        },
        select: {
          id: true,
          title: true,
          sourceType: true,
          sourceUrl: true,
        },
      });
      created.push(toSafeLegalAiCitation(row.id, citation));
    }
    return created;
  }

  async findOwnedDocumentExtract(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentExtract | null> {
    const row = await prisma.aIConversationDocument.findFirst({
      where: { conversationId, userId, extractStatus: "OK" },
      select: { fileName: true, extractedText: true },
    });
    return row;
  }

  async findOwnedDocumentMeta(
    conversationId: string,
    userId: string,
  ): Promise<LegalAiConversationDocumentMeta | null> {
    const row = await prisma.aIConversationDocument.findFirst({
      where: { conversationId, userId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        extractStatus: true,
        pageCount: true,
      },
    });
    return row;
  }

  async findDocumentByStorageKey(
    storageKey: string,
  ): Promise<{ userId: string } | null> {
    return prisma.aIConversationDocument.findFirst({
      where: { storageKey },
      select: { userId: true },
    });
  }

  async findDocumentIdByConversationId(
    conversationId: string,
  ): Promise<string | null> {
    const row = await prisma.aIConversationDocument.findFirst({
      where: { conversationId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createConversationDocument(input: {
    conversationId: string;
    userId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
    pageCount: number | null;
    extractStatus: "OK";
  }): Promise<LegalAiConversationDocumentMeta> {
    const row = await prisma.aIConversationDocument.create({
      data: {
        conversationId: input.conversationId,
        userId: input.userId,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extractedText: input.extractedText,
        pageCount: input.pageCount,
        extractStatus: input.extractStatus,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        extractStatus: true,
        pageCount: true,
      },
    });
    return row;
  }
}
