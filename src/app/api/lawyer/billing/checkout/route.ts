import { NextResponse } from "next/server";

import { lawyerBillingDeps, manualBillingDeps } from "@/application/common/lawyer-billing-http";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { createSoloCheckout } from "@/application/use-cases/billing/create-solo-checkout";
import {
  createManualLawyerCheckout,
  type ManualCheckoutMethod,
} from "@/application/use-cases/billing/create-manual-checkout";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { UserRole } from "@/domain/enums";
import { MANUAL_PAYMENT_CLAIM_RATE_LIMIT } from "@/infrastructure/security/rate-limiter";

type CheckoutRequest = {
  method?: string;
};

function manualMethod(value: string | undefined): ManualCheckoutMethod | null {
  return value === "BANK_TRANSFER" || value === "QR" ? value : null;
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
    const limited = await enforceRateLimit(
      `billing:checkout:${actor.userId}`,
      MANUAL_PAYMENT_CLAIM_RATE_LIMIT,
    );
    if (limited) {
      return NextResponse.json({ error: limited.error }, { status: 429 });
    }
    await assertEmailVerified(actor.userId);
    const body = (await request.json().catch(() => ({}))) as CheckoutRequest;
    const method = manualMethod(body.method);

    const view = method
      ? await createManualLawyerCheckout(actor, method, manualBillingDeps())
      : await createSoloCheckout(actor, lawyerBillingDeps());
    return NextResponse.json(view);
  } catch (error) {
    return billingApiErrorResponse(error);
  }
}
