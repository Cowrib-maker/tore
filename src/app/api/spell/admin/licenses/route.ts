import {
  assertSameOrigin,
  getSpellRuntime,
  parseOrThrow,
  readBoundedBody,
  requireActor,
  spellErrorResponse,
  spellJson,
} from "@/application/common/spell-http";
import {
  issueSpellLicense,
  listSpellLicenses,
} from "@/application/use-cases/spell/admin-licenses";
import {
  adminListQuerySchema,
  issueLicenseSchema,
} from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";

/** GET /api/spell/admin/licenses — paginated list (never includes codes). */
export async function GET(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor(UserRole.ADMIN);
    const query = parseOrThrow(
      adminListQuerySchema,
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return spellJson(await listSpellLicenses(actor, query, runtime.deps));
  } catch (error) {
    return spellErrorResponse(error);
  }
}

/**
 * POST — issue a license. The only response that ever contains a plaintext
 * code; it is returned once, to the issuing admin.
 */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    assertSameOrigin(request);
    const actor = await requireActor(UserRole.ADMIN);
    const { json } = await readBoundedBody(request);
    const body = parseOrThrow(issueLicenseSchema, json);
    return spellJson(await issueSpellLicense(actor, body, runtime.deps), { status: 201 });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
