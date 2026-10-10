"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * «Энэ компьютерээс чөлөөлөх»: the owner releases the licence from the web (e.g. the old computer is gone). The next computer then activates
 * with the same code. Nothing is moved silently; the server enforces the transfer cooldown.
 */
export function SpellReleaseButton({ licenseId }: { licenseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function release() {
    if (!window.confirm("Лицензийг одоогийн компьютероос чөлөөлөх үү? Дараа нь шинэ компьютер дээр кодоо оруулж идэвхжүүлнэ.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/spell/licenses/${encodeURIComponent(licenseId)}/deactivate`, { method: "POST" });
      if (!res.ok) setMsg("Чөлөөлж чадсангүй. Дахин оролдоно уу.");
      else router.refresh();
    } catch {
      setMsg("Холболтын алдаа.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={release} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
        Шилжүүлэх (чөлөөлөх)
      </button>
      {msg ? <span role="status" className="ml-2 text-sm text-slate-500">{msg}</span> : null}
    </div>
  );
}
