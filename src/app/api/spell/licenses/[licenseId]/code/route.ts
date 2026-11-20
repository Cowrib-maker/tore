import {
  assertSameOrigin,
  getSpellRuntime,
  hashedClientIp,
  requireActor,
  spellErrorResponse,
  spellJson,
  throttle,
} from "@/application/common/spell-http";
import { revealLicenseCode } from "@/application/use-cases/spell/owner-licenses";

/**
 * POST (not GET, so it is never prefetched or cached) — the authenticated
 * owner reveals their own license code. Audited; non-owners get 404.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ licenseId: string }> },
) {
  try {
    const runtime = getSpellRuntime();
    assertSameOrigin(request);
    const actor = await requireActor();
    const limited = await throttle(`spell-reveal:${actor.userId}`, 20, 60 * 60 * 1000);
    if (limited) return limited;
    const { licenseId } = await ctx.params;
    const result = await revealLicenseCode(
      actor,
      licenseId,
      hashedClientIp(request, runtime),
      runtime.deps,
    );
    return spellJson(result);
  } catch (error) {
    return spellErrorResponse(error);
  }
}
