import {
  assertSameOrigin,
  getSpellRuntime,
  parseOrThrow,
  readBoundedBody,
  requireActor,
  spellErrorResponse,
  spellJson,
  throttle,
} from "@/application/common/spell-http";
import { lawyerBillingDeps } from "@/application/common/lawyer-billing-http";
import { billingApiErrorResponse } from "@/application/use-cases/billing/qpay-callback-parse";
import { createSpellCheckout } from "@/application/use-cases/spell/purchase";
import { DomainError } from "@/domain/errors/domain-error";
import { SpellError } from "@/domain/spell/errors";
import { z } from "zod";

const bodySchema = z.object({ planCode: z.string().min(1).max(32) });

/**
 * POST /api/spell/purchase { planCode } — starts a TORE Spell purchase for the
 * signed-in user. The body carries ONLY a plan code: price, duration and
 * product are resolved on the server. Spell must be enabled and configured
 * (otherwise nothing can be sold, because the licence could not be issued).
 */
export async function POST(request: Request) {
  try {
    getSpellRuntime(); // 404 SPELL_DISABLED / 503 SPELL_NOT_CONFIGURED before any money moves
    assertSameOrigin(request);
    const actor = await requireActor();
    const limited = await throttle(`spell-purchase:${actor.userId}`, 10, 60 * 60 * 1000);
    if (limited) return limited;
    const { json } = await readBoundedBody(request);
    const body = parseOrThrow(bodySchema, json);
    const view = await createSpellCheckout(actor, body.planCode, lawyerBillingDeps());
    return spellJson(view);
  } catch (error) {
    if (error instanceof SpellError) return spellErrorResponse(error);
    if (error instanceof DomainError) return billingApiErrorResponse(error);
    return spellErrorResponse(error);
  }
}
