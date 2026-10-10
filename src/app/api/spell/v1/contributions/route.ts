import { activationRefSchema } from "@/application/validators/spell.schema";
import { getSpellRuntime, hashedClientIp, parseOrThrow, readBoundedBody, spellErrorResponse, spellJson, throttle, toSignedRequest } from "@/application/common/spell-http";
import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { getContributions } from "@/application/use-cases/spell/feedback";
import { SpellAttemptKind } from "@/domain/spell/enums";

/** POST /api/spell/v1/contributions — the caller's own contribution counts (accepted reports are the only credit). Signed, like every device request. */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const ipHash = hashedClientIp(request, runtime);
    const limited = await throttle(`spell-contributions:${ipHash ?? "unknown"}`, 60, 60 * 60 * 1000);
    if (limited) return limited;
    const { rawBody, json } = await readBoundedBody(request);
    const body = parseOrThrow(activationRefSchema, json);
    const device = await authenticateSignedRequest(toSignedRequest(request, rawBody, ipHash), toAuthenticateDeps(runtime.deps), SpellAttemptKind.VALIDATE);
    return spellJson(await getContributions({ device, activationId: body.activationId }, { feedbackRepository: runtime.feedbackRepository, spell: runtime.deps }));
  } catch (error) {
    return spellErrorResponse(error);
  }
}
