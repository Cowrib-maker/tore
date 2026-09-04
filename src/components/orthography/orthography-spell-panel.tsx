"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import type { OrthographyCheckApiResult } from "@/components/orthography/orthography-checker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Suggestion = OrthographyCheckApiResult["suggestions"][number];

export function OrthographySpellPanel({
  text,
  loading,
  result,
  gateMessage,
  needsBilling,
  billingHref = "/legal-ai",
  includeLatinToCyrillic,
  onIncludeLatinChange,
  onApplySuggestion,
  onRecheck,
  onClose,
  onCheck,
  className,
}: {
  text: string;
  loading: boolean;
  result: OrthographyCheckApiResult | null;
  gateMessage: string | null;
  needsBilling: boolean;
  billingHref?: string;
  includeLatinToCyrillic?: boolean;
  onIncludeLatinChange?: (value: boolean) => void;
  onApplySuggestion: (nextText: string) => void;
  onRecheck: (nextText: string) => void;
  onClose?: () => void;
  onCheck: () => void;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIgnoredKeys(new Set());
    setActiveIndex(null);
  }, [result]);

  const allSuggestions = useMemo(() => result?.suggestions ?? [], [result?.suggestions]);
  const suggestions = useMemo(
    () => allSuggestions.filter((item) => !ignoredKeys.has(`${item.start}:${item.end}`)),
    [allSuggestions, ignoredKeys],
  );
  const errorCount = suggestions.length;

  function applySuggestion(item: Suggestion, index: number) {
    const next = `${text.slice(0, item.start)}${item.suggestedWord}${text.slice(item.end)}`;
    onApplySuggestion(next);
    setActiveIndex(index);
    onRecheck(next);
  }

  function ignoreWord(item: Suggestion) {
    setIgnoredKeys((current) => {
      const next = new Set(current);
      next.add(`${item.start}:${item.end}`);
      return next;
    });
    setActiveIndex(null);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#0B1F3A]/10 bg-white shadow-[0_10px_28px_-22px_rgba(11,31,58,0.35)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#0B1F3A]/8 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-xs font-semibold text-[#0B1F3A]">Зөв бичгийн алдаа шалгагч</p>
          {errorCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {errorCount}
            </span>
          ) : null}
          {loading ? <span className="text-[10px] text-[#66717D]">шалгаж байна…</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || !text.trim()}
            onClick={onCheck}
            className="h-7 gap-1 border-[#1A7A72]/30 px-2 text-[11px] text-[#0F3D33] hover:bg-[#EAF4F0]"
          >
            <Check className="size-3" />
            Шалгах
          </Button>
          {onClose ? (
            <button
              type="button"
              aria-label="Хаах"
              className="inline-flex size-7 items-center justify-center rounded-md text-[#66717D] hover:bg-[#0B1F3A]/5"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {onIncludeLatinChange ? (
        <label className="flex cursor-pointer items-center gap-2 border-b border-[#0B1F3A]/8 px-3 py-2 text-[11px] text-[#5C6570]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={Boolean(includeLatinToCyrillic)}
            onChange={(event) => onIncludeLatinChange(event.target.checked)}
          />
          <span>Латин үсгээр бичсэн монгол үгийг кириллээр санал болгох</span>
        </label>
      ) : null}

      {gateMessage ? (
        <div className="px-3 py-2.5">
          <p className="text-[11px] leading-5 text-[#5C6570]">{gateMessage}</p>
          {needsBilling ? (
            <a href={billingHref} className="mt-1 inline-flex text-[11px] font-semibold text-[#1A7A72] hover:underline">
              Багц идэвхжүүлэх
            </a>
          ) : null}
        </div>
      ) : null}

      {!gateMessage && !loading && result ? (
        <div className="max-h-56 overflow-y-auto p-2">
          {errorCount === 0 ? (
            <p className="flex items-center gap-1.5 px-2 py-2 text-[11px] text-[#1A7A72]">
              <Check className="size-3.5" />
              Алдаатай үг олдсонгүй.
            </p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {suggestions.map((item, index) => (
                <div
                  key={`${item.start}-${item.end}-${index}`}
                  className={cn(
                    "rounded-lg border bg-[#FAFBFC] px-2.5 py-2 transition",
                    activeIndex === index
                      ? "border-[#1A7A72]/40 ring-1 ring-[#1A7A72]/15"
                      : "border-[#0B1F3A]/8",
                  )}
                >
                  <p className="truncate text-xs font-medium text-[#0B1F3A]">
                    <span className="text-[#991B1B]">{item.sourceWord}</span>
                    <span className="mx-1 text-[#8A939D]">→</span>
                    <span className="rounded bg-[#E8F5E9] px-1 text-[#1B5E20]">{item.suggestedWord}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#66717D]">{item.suggestionLabel}</p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      className="text-[10px] font-semibold text-[#1A7A72] hover:underline"
                      onClick={() => applySuggestion(item, index)}
                    >
                      Сонгох
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-[#66717D] hover:underline"
                      onClick={() => ignoreWord(item)}
                    >
                      Үл хэрэгсэх
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
