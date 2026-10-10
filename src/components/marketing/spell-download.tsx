import Link from "next/link";
import { Download } from "lucide-react";

import type { SpellCopy } from "@/i18n/types";

/**
 * Public download call-to-action. It NEVER contains the installer URL: the button leads to «Миний лиценз» (sign-in → licence → /api/spell/download),
 * where the owner of an active licence is redirected to the configured https installer. When no installer is configured the page says so
 * instead of showing a dead or invented link.
 */
export function SpellDownload({ copy, installerReady }: { copy: SpellCopy["download"]; installerReady: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-900">{copy.platform}</p>
        <p className="text-sm text-slate-500">{installerReady ? copy.note : copy.soon}</p>
        <p className="mt-1 text-xs text-slate-500">{copy.requirements}</p>
        <p className="mt-1 text-xs text-slate-500">{copy.unsigned}</p>
      </div>
      {installerReady ? (
        <Link href="/spell/license" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1B63FF] px-6 text-[15px] font-bold text-white transition hover:bg-blue-700">
          <Download className="size-4" />
          {copy.cta}
        </Link>
      ) : null}
    </div>
  );
}
