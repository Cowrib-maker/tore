import { activationRefSchema } from "@/application/validators/spell.schema";
import {
  getSpellRuntime,
  hashedClientIp,
  parseOrThrow,
  readBoundedBody,
  spellErrorResponse,
  spellJson,
  throttle,
  toSignedRequest,
} from "@/application/common/spell-http";
import {
  authenticateSignedRequest,
  toAuthenticateDeps,
} from "@/application/use-cases/spell/authenticate-installation-request";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { SpellAttemptKind } from "@/domain/spell/enums";

/** POST /api/spell/v1/validations — start-up and periodic server validation; returns a fresh signed token only while this installation still holds the ACTIVE activation. */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const ipHash = hashedClientIp(request, runtime);
    const limited = await throttle(`spell-validations:${ipHash ?? "unknown"}`, 60, 60 * 60 * 1000);
    if (limited) return limited;

    const { rawBody, json } = await readBoundedBody(request);
    const body = parseOrThrow(activationRefSchema, json);
    const device = await authenticateSignedRequest(
      toSignedRequest(request, rawBody, ipHash),
      toAuthenticateDeps(runtime.deps),
      SpellAttemptKind.VALIDATE,
    );
    const result = await validateActivation(
      { activationId: body.activationId, device, ipHash },
      runtime.deps,
    );
    return spellJson(result);
  } catch (error) {
    return spellErrorResponse(error);
  }
}
