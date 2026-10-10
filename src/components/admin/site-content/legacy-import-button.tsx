"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { importLegacyHomepageContentAction } from "@/application/actions/admin-site-content-legacy.actions";
import { Button } from "@/components/ui/button";

export function LegacyImportButton({ importable }: { importable: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending || importable === 0}
        onClick={() =>
          startTransition(async () => {
            const r = await importLegacyHomepageContentAction();
            setResult(
              r.ok
                ? { ok: true, text: `${r.imported} ноорог үүслээ. Нийтлэхийн тулд «Вэб сайтын агуулга» хэсгээс хянана уу.` }
                : { ok: false, text: r.message },
            );
            if (r.ok) router.refresh();
          })
        }
      >
        {importable === 0 ? "Импортлох зүйл алга" : `${importable} засварыг ноорог болгон импортлох`}
      </Button>
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
