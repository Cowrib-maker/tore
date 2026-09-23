import { NextResponse } from "next/server";

import { lawyerBillingDeps, manualBillingDeps } from "@/application/common/lawyer-billing-http";
import { requireActor } from "@/application/common/require-actor";
import { assertEmailVerified } from "@/application/common/require-verified-email";
import { createSoloCheckout } from "@/application/use-cases/billing/create-solo-checkout";
import {
  createManualLawyerCheckout,
  type ManualCheckoutMethod,
} from "@/application/use-cases/billing/create-manual-checkout";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { UserRole } from "@/domain/enums";

type CheckoutRequest = {
  method?: string;
};

function manualMethod(value: string | undefined): ManualCheckoutMethod | null {
  return value === "BANK_TRANSFER" || value === "QR" ? value : null;
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(UserRole.LAWYER);
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
