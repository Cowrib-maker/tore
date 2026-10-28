import {
  assertSameOrigin,
  getSpellRuntime,
  hashedClientIp,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import { deactivateOwnerLicense } from "@/application/use-cases/spell/owner-licenses";

/** POST — the owner releases their license from whichever computer holds it. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ licenseId: string }> },
) {
  try {
    const runtime = getSpellRuntime();
    assertSameOrigin(request);
    const actor = await requireActor();
    const { licenseId } = await ctx.params;
    const result = await deactivateOwnerLicense(
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
