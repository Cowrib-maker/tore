import { getSpellRuntime, spellErrorResponse } from "@/application/common/spell-http";
import { NextResponse } from "next/server";

/**
 * GET /api/spell/v1/keys — public Ed25519 verification keys (JWKS), selected
 * by the token's `kid`. Public data; short cache so rotation propagates.
 */
export async function GET() {
  try {
    const runtime = getSpellRuntime();
    return NextResponse.json(runtime.tokenIssuer.publicJwks(), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
