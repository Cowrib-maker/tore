"use client";

import { useEffect, useState } from "react";

import { AccountSharingRiskState } from "@/domain/enums";
import type { MarketplaceDictionary } from "@/i18n/marketplace-types";

export function AccountSharingBanner({
  copy,
}: {
  copy: Pick<
    MarketplaceDictionary["account"],
    "sharingWarning" | "sharingHighRiskHint"
  >;
}) {
  const [state, setState] = useState<AccountSharingRiskState>(
    AccountSharingRiskState.NORMAL,
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/lawyer/billing", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          riskState?: AccountSharingRiskState;
        };
        if (
          data.riskState === AccountSharingRiskState.SUSPICIOUS ||
          data.riskState === AccountSharingRiskState.HIGH_RISK
        ) {
          setState(data.riskState);
        }
      })
      .catch(() => {
        /* non-blocking */
      });
    return () => controller.abort();
  }, []);

  if (state === AccountSharingRiskState.NORMAL) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
    >
      <p>{copy.sharingWarning}</p>
      {state === AccountSharingRiskState.HIGH_RISK ? (
        <p className="mt-1 text-muted-foreground">{copy.sharingHighRiskHint}</p>
      ) : null}
    </div>
  );
}
