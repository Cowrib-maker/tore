import {
  getSpellRuntime,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import { listOwnerLicenses } from "@/application/use-cases/spell/owner-licenses";

/** GET /api/spell/licenses — the signed-in user's own licenses (no codes). */
export async function GET() {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor();
    return spellJson({ licenses: await listOwnerLicenses(actor, runtime.deps) });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
