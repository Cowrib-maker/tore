import { NextResponse } from "next/server";

import { requireActor } from "@/application/common/require-actor";
import { getLegalQuestionEntitlementSnapshot } from "@/application/legal-ai/legal-question-access";
import {
  toBillingCenterPendingInvoice,
  toBillingHistoryRow,
} from "@/application/use-cases/billing/billing-center-view";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import {
  CITIZEN_BASIC_PLAN,
  CITIZEN_PLUS_PLAN,
} from "@/domain/constants/subscription-plans";
import { UserRole } from "@/domain/enums";
import { manualPaymentConfig } from "@/infrastructure/billing/manual/manual-payment-config";
import {
  entitlementUsageRepository,
  invoiceRepository,
  subscriptionRepository,
  unpaidCitizenLegalQuestionUsageRepository,
  userRepository,
} from "@/infrastructure/repositories";
import {
  prismaConversationBillingStore,
  prismaGuestSessionStore,
} from "@/infrastructure/legal-ai/prisma-guest-session-store";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const now = new Date();

    const [snapshot, pendingInvoice, history] = await Promise.all([
      getLegalQuestionEntitlementSnapshot(
        { kind: "user", userId: actor.userId, role: actor.role },
        {
          guestSessions: prismaGuestSessionStore,
          conversations: prismaConversationBillingStore,
          subscriptionRepository,
          entitlementUsageRepository,
          unpaidCitizenUsage: unpaidCitizenLegalQuestionUsageRepository,
          userRepository,
        },
      ),
      invoiceRepository.findLatestPendingForUser(actor.userId, now),
      invoiceRepository.listByUserId(actor.userId),
    ]);

    const config = manualPaymentConfig();
    return NextResponse.json({
      audience: snapshot.audience,
      planName: snapshot.planName,
      statusLabel: snapshot.statusLabel,
      remainingLegalQuestions: snapshot.remainingLegalQuestions,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      expiresSoon: snapshot.expiresSoon,
      expiryWarningLabel: snapshot.expiryWarningLabel,
      billingRequired: snapshot.audience !== "paid_citizen",
      availablePlans: [
        { code: CITIZEN_BASIC_PLAN.code, name: CITIZEN_BASIC_PLAN.name, priceMnt: CITIZEN_BASIC_PLAN.priceMnt, quotas: CITIZEN_BASIC_PLAN.quotas },
        { code: CITIZEN_PLUS_PLAN.code, name: CITIZEN_PLUS_PLAN.name, priceMnt: CITIZEN_PLUS_PLAN.priceMnt, quotas: CITIZEN_PLUS_PLAN.quotas },
      ],
      pendingInvoice: pendingInvoice
        ? toBillingCenterPendingInvoice(pendingInvoice, config)
        : null,
      history: history.map(toBillingHistoryRow),
    });
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
