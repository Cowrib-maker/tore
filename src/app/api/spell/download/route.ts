import { NextResponse } from "next/server";

import { getSpellRuntime, requireActor, spellErrorResponse } from "@/application/common/spell-http";
import { SpellEffectiveLicenseStatus } from "@/domain/spell/enums";
import { getSpellInstallerSource } from "@/domain/spell/installer";
import { deriveLicenseState } from "@/domain/spell/license-state";
import { env } from "@/lib/env";
import { getFileStorage } from "@/infrastructure/storage";

/** Lifetime of the signed installer URL. Long enough to start the download; the transfer itself may outlive it. */
export const SPELL_INSTALLER_URL_TTL_SECONDS = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/spell/download — sends an owner of a LIVE TORE Spell licence (derived from the clock: an expired or revoked licence does not
 * qualify, even though its stored status may still read ACTIVE) to the Windows installer.
 *
 *  - No session → 401. No live licence → 403. Nothing configured → 404 INSTALLER_NOT_AVAILABLE (never a made-up URL).
 *  - Private delivery (SPELL_INSTALLER_STORAGE_KEY on S3): a short-lived signed URL is issued per request; the object is never public.
 *  - Fallback (SPELL_WINDOWS_INSTALLER_URL): redirect to the configured https URL — the licence is checked, but the URL itself is public.
 * The target comes only from server configuration, so this is not an open redirect, and no response body ever contains it.
 */
export async function GET() {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor();
    const licenses = await runtime.deps.repos.licenseRepository.listByOwner(actor.userId);
    const now = new Date();
    if (!licenses.some((l) => deriveLicenseState(l, now).status === SpellEffectiveLicenseStatus.ACTIVE)) {
      return NextResponse.json({ error: "Лиценз олдсонгүй.", code: "FORBIDDEN" }, { status: 403, headers: NO_STORE });
    }

    const source = getSpellInstallerSource(process.env, env.FILE_STORAGE === "s3");
    if (!source) {
      return NextResponse.json({ error: "Beta installer удахгүй.", code: "INSTALLER_NOT_AVAILABLE" }, { status: 404, headers: NO_STORE });
    }

    if (source.kind === "url") {
      return NextResponse.redirect(source.url, { status: 302, headers: NO_STORE });
    }

    let signed: string;
    try {
      signed = await getFileStorage().getUrl(source.key, { expiresInSeconds: SPELL_INSTALLER_URL_TTL_SECONDS });
    } catch {
      // Operational failure (credentials, network): tell the customer to retry, log nothing that identifies the object or the user.
      console.error("spell download: could not issue a signed installer URL");
      return NextResponse.json(
        { error: "Татах холбоос үүсгэж чадсангүй. Түр хүлээгээд дахин оролдоно уу.", code: "DOWNLOAD_UNAVAILABLE" },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.redirect(signed, { status: 302, headers: NO_STORE });
  } catch (error) {
    return spellErrorResponse(error);
  }
}
