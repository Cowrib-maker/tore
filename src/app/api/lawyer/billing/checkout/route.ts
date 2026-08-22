import { NextResponse } from "next/server";

import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { createSoloCheckout } from "@/application/use-cases/billing/create-solo-checkout";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { UserRole } from "@/domain/enums";

export async function POST() {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    await assertEmailVerified(actor.userId);
    const view = await createSoloCheckout(actor, lawyerBillingDeps());
    return NextResponse.json(view);
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
