import { NextResponse } from "next/server";

import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { createCitizenPlanCheckout } from "@/application/use-cases/billing/create-plan-checkout";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { SubscriptionPlanCode, UserRole } from "@/domain/enums";

type CheckoutRequest = {
  planCode?: string;
};

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    await assertEmailVerified(actor.userId);
    const body = (await request.json().catch(() => ({}))) as CheckoutRequest;
    const view = await createCitizenPlanCheckout(
      actor,
      body.planCode ?? SubscriptionPlanCode.CITIZEN_BASIC,
      lawyerBillingDeps(),
    );
    return NextResponse.json(view);
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
