"use client";

import { useEffect, useState } from "react";

export type LegalAiEntitlementView = {
  statusLabel: string;
  remainingLabel: string;
  exhaustedLabel: string;
};

export function LegalAiEntitlementBanner() {
  const [view, setView] = useState<LegalAiEntitlementView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/entitlement", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as LegalAiEntitlementView;
      })
      .then((data) => {
        if (!cancelled && data?.statusLabel) {
          setView(data);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#0B1F3A]/10 bg-[#F8FAFC] px-3 py-3 text-left text-sm text-[#3F4852]">
      <p className="font-medium text-[#0A0F14]">{view.statusLabel}</p>
      <p className="mt-1">{view.remainingLabel}</p>
      <p className="mt-1 text-xs text-[#66717D]">{view.exhaustedLabel}</p>
    </div>
  );
}
