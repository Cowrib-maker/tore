import { activateRequestSchema } from "@/application/validators/spell.schema";
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
import { activateLicense } from "@/application/use-cases/spell/activate-license";
import {
  authenticateSignedRequest,
  toAuthenticateDeps,
} from "@/application/use-cases/spell/authenticate-installation-request";
import { SpellAttemptKind } from "@/domain/spell/enums";

/**
 * POST /api/spell/v1/activations — activate (or, with explicit confirmation,
 * transfer) a license on the calling installation. Authenticated by the
 * installation's Ed25519 signature, never by cookies.
 */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const ipHash = hashedClientIp(request, runtime);
    const limited = await throttle(`spell-activate:${ipHash ?? "unknown"}`, 30, 15 * 60 * 1000);
    if (limited) return limited;

    const { rawBody, json } = await readBoundedBody(request);
    const body = parseOrThrow(activateRequestSchema, json);
    const device = await authenticateSignedRequest(
      toSignedRequest(request, rawBody, ipHash),
      toAuthenticateDeps(runtime.deps),
      SpellAttemptKind.ACTIVATE,
      { registerPublicKey: body.installation.publicKey },
    );
    const grant = await activateLicense(
      {
        code: body.code,
        platform: body.installation.platform,
        appVersion: body.installation.appVersion,
        machineHint: body.installation.machineHint ?? null,
        confirmTransferOfActivationId: body.confirmTransferOfActivationId ?? null,
        device,
        ipHash,
      },
      runtime.deps,
    );
    return spellJson(grant);
  } catch (error) {
    return spellErrorResponse(error);
  }
}
