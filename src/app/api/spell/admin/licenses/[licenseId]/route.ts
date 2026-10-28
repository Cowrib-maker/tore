import {
  getSpellRuntime,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import { getSpellLicenseDetail } from "@/application/use-cases/spell/admin-licenses";
import { UserRole } from "@/domain/enums";

/** GET — license detail with activation history and the immutable event log. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ licenseId: string }> },
) {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor(UserRole.ADMIN);
    const { licenseId } = await ctx.params;
    return spellJson(await getSpellLicenseDetail(actor, licenseId, runtime.deps));
  } catch (error) {
    return spellErrorResponse(error);
  }
}
