import { NextResponse } from "next/server";

import { lookupAuthSession } from "@/application/common/session";
import { getLegalQuestionEntitlementSnapshot } from "@/application/legal-ai/legal-question-access";
import { resolveGuestSession } from "@/application/legal-ai/resolve-guest-session";
import { UserRole } from "@/domain/enums";
import { SessionReplacedError } from "@/domain/errors/domain-error";
import {
  prismaConversationBillingStore,
  prismaGuestSessionStore,
} from "@/infrastructure/legal-ai/prisma-guest-session-store";
import {
  entitlementUsageRepository,
  subscriptionRepository,
} from "@/infrastructure/repositories";

export async function GET() {
  const lookup = await lookupAuthSession();
  if (lookup.replaced) {
    const error = new SessionReplacedError();
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  const session = lookup.session;
  const actor = session?.user?.id
    ? { userId: session.user.id, role: session.user.role as UserRole }
    : null;
  const guest = actor
    ? await resolveGuestSession({
        claimForUserId: actor.userId,
        createIfMissing: false,
      })
    : await resolveGuestSession({ createIfMissing: false });

  const subject = actor
    ? { kind: "user" as const, userId: actor.userId, role: actor.role }
    : guest
      ? { kind: "guest" as const, guestSessionId: guest.id }
      : { kind: "anonymous" as const };

  const snapshot = await getLegalQuestionEntitlementSnapshot(subject, {
    guestSessions: prismaGuestSessionStore,
    conversations: prismaConversationBillingStore,
    subscriptionRepository,
    entitlementUsageRepository,
  });

  return NextResponse.json(snapshot);
}
