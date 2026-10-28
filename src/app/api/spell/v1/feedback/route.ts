import { feedbackRequestSchema } from "@/application/validators/spell.schema";
import { getSpellRuntime, hashedClientIp, parseOrThrow, readBoundedBody, spellErrorResponse, spellJson, throttle, toSignedRequest } from "@/application/common/spell-http";
import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { submitFeedback } from "@/application/use-cases/spell/feedback";
import { SpellAttemptKind } from "@/domain/spell/enums";

/**
 * POST /api/spell/v1/feedback — a signed report from a licensed, ACTIVE installation (wrong correction, missing error, wrong suggestion,
 * missing word, general). The request has no status field (strict schema); the row is stored PENDING and only an admin can review it.
 * The body carries one word and short optional notes — never document text.
 */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const ipHash = hashedClientIp(request, runtime);
    const limited = await throttle(`spell-feedback:${ipHash ?? "unknown"}`, 60, 60 * 60 * 1000);
    if (limited) return limited;
    const { rawBody, json } = await readBoundedBody(request);
    const body = parseOrThrow(feedbackRequestSchema, json);
    const device = await authenticateSignedRequest(toSignedRequest(request, rawBody, ipHash), toAuthenticateDeps(runtime.deps), SpellAttemptKind.VALIDATE);
    const receipt = await submitFeedback({ device, activationId: body.activationId, feedback: body.feedback }, { feedbackRepository: runtime.feedbackRepository, spell: runtime.deps });
    return spellJson(receipt, { status: 201 });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
