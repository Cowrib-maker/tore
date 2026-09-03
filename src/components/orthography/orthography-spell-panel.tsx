"use client";

import { useMemo, useState } from "react";
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
  const [ignoredByResult, setIgnoredByResult] = useState<{
    result: OrthographyCheckApiResult | null;
    keys: Set<string>;
  }>({ result: null, keys: new Set() });

  const allSuggestions = useMemo(
    () => result?.suggestions ?? [],
    [result?.suggestions],
  );
  const suggestions = useMemo(
    () => {
      const ignoredKeys =
        ignoredByResult.result === result
          ? ignoredByResult.keys
          : new Set<string>();
      return allSuggestions.filter(
        (item) => !ignoredKeys.has(`${item.start}:${item.end}`),
      );
    },
    [allSuggestions, ignoredByResult, result],
  );
  const errorCount = suggestions.length;

  const activeSpan =
    activeIndex != null && suggestions[activeIndex]
      ? suggestions[activeIndex]
      : null;

  const segments = useMemo(
    () => buildHighlightSegments(text, suggestions, activeSpan),
    [text, suggestions, activeSpan],
  );

  function focusSuggestion(index: number) {
    setActiveIndex(index);
  }

  function applySuggestion(item: Suggestion, index: number) {
    const next = `${text.slice(0, item.start)}${item.suggestedWord}${text.slice(item.end)}`;
    onApplySuggestion(next);
    setActiveIndex(index);
    onRecheck(next);
  }

  function ignoreWord(item: Suggestion) {
    setIgnoredByResult((current) => {
      const next = new Set(
        current.result === result ? current.keys : undefined,
      );
      next.add(`${item.start}:${item.end}`);
      return { result, keys: next };
    });
    setActiveIndex(null);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-[0_16px_40px_-28px_rgba(11,31,58,0.35)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#0B1F3A]/8 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[#0B1F3A]">
            Зөв бичгийн алдаа шалгагч
          </p>
          <p className="text-xs text-[#66717D]">
            Алдаатай үгийг тодруулж, зөв хувилбар санал болгоно
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Хаах"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#66717D] hover:bg-[#0B1F3A]/5"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {onIncludeLatinChange ? (
        <label className="flex cursor-pointer items-start gap-2 border-b border-[#0B1F3A]/8 px-4 py-2.5 text-xs text-[#5C6570]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={Boolean(includeLatinToCyrillic)}
            onChange={(event) => onIncludeLatinChange(event.target.checked)}
          />
          <span>Латин үсгээр бичсэн монгол үгийг кириллээр санал болгох</span>
        </label>
      ) : null}

      <div className="grid min-h-[180px] lg:grid-cols-[1fr_280px]">
        <div className="border-b border-[#0B1F3A]/8 p-4 lg:border-b-0 lg:border-r">
          <div className="relative min-h-[120px] whitespace-pre-wrap break-words px-3 py-2.5 text-[15px] leading-7 text-[#0B1F3A]">
            {segments.map((segment, index) =>
              segment.kind === "error" ? (
                <mark
                  key={index}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "cursor-pointer rounded-sm px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#1A7A72]/40",
                    segment.active
                      ? "bg-[#C8E6C9] text-[#0B1F3A]"
                      : "bg-[#FEE2E2] text-[#991B1B]",
                  )}
                  onClick={() => {
                    const idx = suggestions.findIndex(
                      (item) =>
                        item.start === segment.start && item.end === segment.end,
                    );
                    if (idx >= 0) focusSuggestion(idx);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    const idx = suggestions.findIndex(
                      (item) =>
                        item.start === segment.start && item.end === segment.end,
                    );
                    if (idx >= 0) focusSuggestion(idx);
                  }}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#0B1F3A]/8 pt-3">
            <div className="flex flex-wrap gap-4 text-xs text-[#66717D]">
              <span>
                Үгийн тоо:{" "}
                <strong className="text-[#0B1F3A]">
                  {result?.wordCount ?? 0}
                </strong>
              </span>
              <span>
                Тэмдэгтийн тоо:{" "}
                <strong className="text-[#0B1F3A]">
                  {result?.characterCount ?? text.length}
                </strong>
                /20 000
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !text.trim()}
              onClick={onCheck}
              className="gap-1.5 border-[#1A7A72]/30 text-[#0F3D33] hover:bg-[#EAF4F0]"
            >
              <Check className="size-3.5" />
              {loading ? "Шалгаж байна…" : "Алдаа шалгах"}
            </Button>
          </div>
        </div>

        <aside className="flex flex-col bg-[#FAFBFC] p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">
              Алдаатай үгсийн жагсаалт
            </h3>
            {errorCount > 0 ? (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {errorCount}
              </span>
            ) : null}
          </div>

          {gateMessage ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs leading-5 text-[#5C6570]">{gateMessage}</p>
              {needsBilling ? (
                <a
                  href={billingHref}
                  className="inline-flex text-xs font-semibold text-[#1A7A72] hover:underline"
                >
                  Багц идэвхжүүлэх
                </a>
              ) : null}
            </div>
          ) : null}

          {!gateMessage && loading ? (
            <p className="mt-4 text-xs text-[#66717D]">Шалгаж байна…</p>
          ) : null}

          {!gateMessage && !loading && result ? (
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {errorCount === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-[#1A7A72]">
                  <Check className="size-3.5" />
                  Алдаатай үг олдсонгүй.
                </p>
              ) : (
                suggestions.map((item, index) => (
                  <div
                    key={`${item.start}-${item.end}-${index}`}
                    className={cn(
                      "rounded-xl border bg-white p-3 shadow-sm transition",
                      activeIndex === index
                        ? "border-[#1A7A72]/40 ring-1 ring-[#1A7A72]/20"
                        : "border-[#0B1F3A]/10",
                    )}
                  >
                    <p className="text-sm font-medium text-[#0B1F3A]">
                      <span className="text-[#991B1B]">{item.sourceWord}</span>
                      <span className="mx-1.5 text-[#8A939D]">→</span>
                      <span className="rounded-md bg-[#E8F5E9] px-1.5 py-0.5 text-[#1B5E20]">
                        {item.suggestedWord}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#66717D]">
                      {item.suggestionLabel}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-[#1A7A72] hover:underline"
                        onClick={() => applySuggestion(item, index)}
                      >
                        Сонгох
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-[#66717D] hover:underline"
                        onClick={() => ignoreWord(item)}
                      >
                        Үгийг үл хэрэгсэх
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

type Segment =
  | { kind: "plain"; text: string }
  | { kind: "error"; text: string; start: number; end: number; active?: boolean };

function buildHighlightSegments(
  text: string,
  suggestions: readonly Suggestion[],
  activeSpan: Suggestion | null,
): Segment[] {
  if (!text) return [];
  if (suggestions.length === 0) {
    return [{ kind: "plain", text }];
  }

  const sorted = [...suggestions].sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const item of sorted) {
    if (item.start > cursor) {
      segments.push({ kind: "plain", text: text.slice(cursor, item.start) });
    }
    if (item.end > item.start) {
      segments.push({
        kind: "error",
        text: text.slice(item.start, item.end),
        start: item.start,
        end: item.end,
        active:
          activeSpan != null &&
          activeSpan.start === item.start &&
          activeSpan.end === item.end,
      });
    }
    cursor = Math.max(cursor, item.end);
  }

  if (cursor < text.length) {
    segments.push({ kind: "plain", text: text.slice(cursor) });
  }

  return segments;
}
