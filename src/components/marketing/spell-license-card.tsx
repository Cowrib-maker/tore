"use client";

import { useState } from "react";

/** Owner-only code reveal (audited server-side) with copy. The code is never in the page HTML. */
export function SpellCodeReveal({ licenseId, maskedCode }: { licenseId: string; maskedCode: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/spell/licenses/${encodeURIComponent(licenseId)}/code`, { method: "POST" });
      if (!res.ok) throw new Error("reveal failed");
      setCode(((await res.json()) as { code: string }).code);
    } catch {
      setMsg("Кодыг харуулж чадсангүй. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMsg("Хуулагдлаа.");
    } catch {
      setMsg("Хуулж чадсангүй — кодыг гараар сонгоно уу.");
    }
  }

  return (
    <div>
      <p className="font-mono text-lg font-semibold tracking-wide text-slate-900">{code ?? maskedCode}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {code ? (
          <button type="button" onClick={copy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Хуулах
          </button>
        ) : (
          <button type="button" onClick={reveal} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            Кодыг харуулах
          </button>
        )}
        {msg ? <span role="status" className="text-sm text-slate-500">{msg}</span> : null}
      </div>
    </div>
  );
}
