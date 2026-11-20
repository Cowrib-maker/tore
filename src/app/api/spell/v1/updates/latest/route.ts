import { NextResponse } from "next/server";

import { getSpellRuntime, hashedClientIp, spellErrorResponse, throttle } from "@/application/common/spell-http";
import { getSpellRelease } from "@/domain/spell/update";

/**
 * GET /api/spell/v1/updates/latest — the SIGNED description of the latest Windows release, or `{ available: false }` while no release is
 * configured (never a made-up URL). Public data, signed so a network attacker cannot forge an update notice; the app only ever tells the
 * user and sends them to the licence page — it does not download or run anything.
 */
export async function GET(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const limited = await throttle(`spell-updates:${hashedClientIp(request, runtime) ?? "unknown"}`, 120, 60 * 60 * 1000);
    if (limited) return limited;
    const release = getSpellRelease();
    if (!release) return NextResponse.json({ available: false }, { headers: { "Cache-Control": "public, max-age=300" } });
    const token = await runtime.tokenIssuer.signRelease(release, new Date());
    return NextResponse.json({ available: true, token }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
