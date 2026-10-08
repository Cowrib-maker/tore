"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DECISIONS = [
  ["ACCEPT", "Зөвшөөрөх"],
  ["REJECT", "Татгалзах"],
  ["DUPLICATE", "Давхардсан"],
  ["NEEDS_NATIVE_REVIEW", "Хэлшинжлэлд илгээх"],
] as const;

/** Review one group of identical reports. A reason is required; the server refuses non-admins and finalised groups. */
export function SpellFeedbackReview({ groupKey }: { groupKey: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: string) {
    if (!reason.trim()) return setError("Шалтгаан бичнэ үү.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spell/admin/feedback/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupKey, decision, reason }) });
      if (!res.ok) setError("Хадгалж чадсангүй.");
      else router.refresh();
    } catch {
      setError("Холболтын алдаа.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Шалтгаан" aria-label="Шийдвэрийн шалтгаан" className="w-full rounded-md border px-2 py-1 text-xs" />
      <div className="flex flex-wrap gap-1">
        {DECISIONS.map(([d, label]) => (
          <button key={d} type="button" disabled={busy} onClick={() => decide(d)} className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
