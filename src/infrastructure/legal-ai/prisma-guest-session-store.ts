import { prisma } from "@/infrastructure/database/prisma";
import type {
  ConversationBillingStore,
  GuestSessionRecord,
  GuestSessionStore,
} from "@/application/legal-ai/legal-question-access";
import {
  GUEST_SESSION_TTL_MS,
  hashGuestToken,
} from "@/infrastructure/legal-ai/guest-session-cookie";

export const prismaGuestSessionStore: GuestSessionStore = {
  async getById(id) {
    const row = await prisma.guestSession.findUnique({
      where: { id },
      select: {
        id: true,
        freeLegalQuestionsUsed: true,
        expiresAt: true,
      },
    });
    return row ? toRecord(row) : null;
  },

  async incrementFreeLegalQuestionsUsed(id) {
    await prisma.guestSession.update({
      where: { id },
      data: {
        freeLegalQuestionsUsed: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
  },
};

export const prismaConversationBillingStore: ConversationBillingStore = {
  async countBilledQuestionsForUser(userId) {
    const aggregate = await prisma.aIConversation.aggregate({
      where: { userId },
      _sum: { billedQuestionCount: true },
    });
    return aggregate._sum.billedQuestionCount ?? 0;
  },
};

export async function createGuestSessionRecord(token: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);
  const row = await prisma.guestSession.create({
    data: {
      tokenHash: hashGuestToken(token),
      expiresAt,
      lastSeenAt: now,
    },
    select: {
      id: true,
      freeLegalQuestionsUsed: true,
      expiresAt: true,
    },
  });
  return toRecord(row);
}

export async function findGuestSessionByTokenHash(tokenHash: string) {
  const row = await prisma.guestSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      freeLegalQuestionsUsed: true,
      expiresAt: true,
    },
  });
  return row ? toRecord(row) : null;
}

export async function touchGuestSession(id: string, now = new Date()) {
  await prisma.guestSession.update({
    where: { id },
    data: { lastSeenAt: now },
  });
}

export async function claimGuestConversationsForUser(
  guestSessionId: string,
  userId: string,
) {
  return claimGuestSessionForUser(guestSessionId, userId);
}

export async function claimGuestSessionForUser(
  guestSessionId: string,
  userId: string,
) {
  await prisma.$transaction([
    prisma.aIConversation.updateMany({
      where: { guestSessionId, userId: null },
      data: { userId },
    }),
    prisma.guestSession.update({
      where: { id: guestSessionId },
      data: { claimedByUserId: userId },
    }),
  ]);
}

function toRecord(row: {
  id: string;
  freeLegalQuestionsUsed: number;
  expiresAt: Date;
}): GuestSessionRecord {
  return {
    id: row.id,
    freeLegalQuestionsUsed: row.freeLegalQuestionsUsed,
    expiresAt: row.expiresAt,
  };
}
