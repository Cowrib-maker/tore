import { NextResponse } from "next/server";

import { getSpellRuntime, requireActor, spellErrorResponse } from "@/application/common/spell-http";
import { SpellEffectiveLicenseStatus } from "@/domain/spell/enums";
import { deriveLicenseState } from "@/domain/spell/license-state";
import { getSpellInstallerUrl } from "@/domain/spell/installer";

/**
 * GET /api/spell/download — redirects an owner of a LIVE TORE Spell licence (derived from the clock: an
 * expired or revoked licence does not qualify, even though its stored status may still read ACTIVE) to the
 * published Windows installer. No licence → 403. No published installer
 * configured → 404 INSTALLER_NOT_AVAILABLE (never a made-up URL). The target
 * comes only from server configuration, so this is not an open redirect.
 */
export async function GET() {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor();
    const licenses = await runtime.deps.repos.licenseRepository.listByOwner(actor.userId);
    const now = new Date();
    if (!licenses.some((l) => deriveLicenseState(l, now).status === SpellEffectiveLicenseStatus.ACTIVE)) {
      return NextResponse.json({ error: "Лиценз олдсонгүй.", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    const url = getSpellInstallerUrl();
    if (!url) {
      return NextResponse.json({ error: "Beta installer удахгүй.", code: "INSTALLER_NOT_AVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
