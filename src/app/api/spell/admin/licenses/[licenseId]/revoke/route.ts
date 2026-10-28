import {
  assertSameOrigin,
  getSpellRuntime,
  parseOrThrow,
  readBoundedBody,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import { revokeSpellLicense } from "@/application/use-cases/spell/admin-licenses";
import { reasonSchema } from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";

/** POST — Revoke a license and end its active activation (reason required). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ licenseId: string }> },
) {
  try {
    const runtime = getSpellRuntime();
    assertSameOrigin(request);
    const actor = await requireActor(UserRole.ADMIN);
    const { licenseId } = await ctx.params;
    const { json } = await readBoundedBody(request);
    const body = parseOrThrow(reasonSchema, json);
    return spellJson(await revokeSpellLicense(actor, licenseId, body.reason, runtime.deps));
  } catch (error) {
    return spellErrorResponse(error);
  }
}
