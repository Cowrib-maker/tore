import {
  assertSameOrigin,
  getSpellRuntime,
  parseOrThrow,
  readBoundedBody,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import { resetSpellTransferCooldown } from "@/application/use-cases/spell/admin-licenses";
import { reasonSchema } from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";

/** POST — Override the self-service transfer cooldown (reason required). */
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
    return await resetSpellTransferCooldown(actor, licenseId, body.reason, runtime.deps);
    return spellJson({ ok: true });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
