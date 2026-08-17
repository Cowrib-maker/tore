import { prisma } from "@/infrastructure/database/prisma";
import type {
  LegalAiAssistantMessage,
  LegalAiConversation,
  LegalAiStore,
  LegalAiStoredMessage,
} from "@/application/ai/legal-ai.types";

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
    citations: Array<{
      title: string;
      sourceType: string;
      sourceUrl?: string | null;
      reference?: string | null;
      excerpt?: string | null;
    }>;
  }): Promise<void> {
    if (input.citations.length === 0) {
      return;
    }
    await prisma.aICitation.createMany({
      data: input.citations.map((citation) => ({
        messageId: input.messageId,
        title: citation.title,
        sourceType: citation.sourceType,
        sourceUrl: citation.sourceUrl ?? null,
        reference: citation.reference ?? null,
        excerpt: citation.excerpt ?? null,
      })),
    });
  }
}
