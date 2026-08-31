"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Check, SpellCheck2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OrthographySuggestionView = {
  kind: "ORTHOGRAPHY" | "LATIN_TO_CYRILLIC";
  sourceWord: string;
  suggestedWord: string;
  suggestionLabel: string;
  ruleIds: readonly string[];
  ruleTitle: string | null;
};

export type OrthographyCheckApiResult = {
  suggestions: OrthographySuggestionView[];
  suggestionCount: number;
  orthographyCount: number;
  latinCount: number;
  premium: true;
};

export function useOrthographyCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrthographyCheckApiResult | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);
  const [open, setOpen] = useState(false);
  const [includeLatinToCyrillic, setIncludeLatinToCyrillic] = useState(false);

  const clear = useCallback(() => {
    setResult(null);
    setGateMessage(null);
    setNeedsBilling(false);
    setOpen(false);
  }, []);

  const check = useCallback(
    async (text: string, options?: { includeLatinToCyrillic?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        toast.message("Шалгах текст оруулна уу.");
        return;
      }
      const latin = options?.includeLatinToCyrillic ?? includeLatinToCyrillic;
      setLoading(true);
      setGateMessage(null);
      setNeedsBilling(false);
      setOpen(true);
      try {
        const response = await fetch("/api/orthography/check", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            includeLatinToCyrillic: latin,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | OrthographyCheckApiResult
          | { error?: string; code?: string }
          | null;

        if (!response.ok) {
          const message =
            payload && "error" in payload && payload.error
              ? payload.error
              : "Алдаа шалгах үед алдаа гарлаа.";
          setResult(null);
          setGateMessage(message);
          setNeedsBilling(
            response.status === 402 ||
              (payload != null &&
                "code" in payload &&
                payload.code === "BILLING_REQUIRED"),
          );
          if (response.status === 401) {
            toast.error(message);
          }
          return;
        }

        setResult(payload as OrthographyCheckApiResult);
      } catch {
        setResult(null);
        setGateMessage("Сүлжээний алдаа. Дахин оролдоно уу.");
        toast.error("Алдаа шалгагч түр ажиллахгүй байна.");
      } finally {
        setLoading(false);
      }
    },
    [includeLatinToCyrillic],
  );

  return {
    loading,
    result,
    gateMessage,
    needsBilling,
    open,
    setOpen,
    includeLatinToCyrillic,
    setIncludeLatinToCyrillic,
    check,
    clear,
    setResult,
  };
}

type OrthographyResultsProps = {
  loading: boolean;
  result: OrthographyCheckApiResult | null;
  gateMessage: string | null;
  needsBilling: boolean;
  text: string;
  includeLatinToCyrillic: boolean;
  onIncludeLatinChange: (value: boolean) => void;
  onApplySuggestion: (nextText: string) => void;
  onRecheck: (nextText: string) => void;
  onClose?: () => void;
  billingHref?: string;
  className?: string;
};

export function OrthographyResults({
  loading,
  result,
  gateMessage,
  needsBilling,
  text,
  includeLatinToCyrillic,
  onIncludeLatinChange,
  onApplySuggestion,
  onRecheck,
  onClose,
  billingHref = "/legal-ai",
  className,
}: OrthographyResultsProps) {
  function applyOne(item: OrthographySuggestionView) {
    const next = replaceWordInText(text, item.sourceWord, item.suggestedWord);
    if (next === text) {
      toast.message("Энэ үг текстээс олдсонгүй.");
      return;
    }
    onApplySuggestion(next);
    toast.success(`«${item.sourceWord}» → «${item.suggestedWord}»`);
    onRecheck(next);
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[#0B1F3A]/10 bg-white px-3 py-3 text-left text-sm text-[#3F4852]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-[#0A0F14]">Зөв бичгийн алдаа шалгагч</p>
          <p className="mt-0.5 text-xs text-[#66717D]">
            Зөвхөн санал · автоматаар засаагүй · төлбөртэй багц
            {loading ? " · шалгаж байна…" : null}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="text-xs text-[#66717D] hover:text-[#0B1F3A]"
            onClick={onClose}
          >
            Хаах
          </button>
        ) : null}
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-[#5C6570]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={includeLatinToCyrillic}
          onChange={(event) => onIncludeLatinChange(event.target.checked)}
        />
        <span>
          Латин үсгээр бичсэн монгол үгийг кириллээр санал болгох (хүсвэл)
        </span>
      </label>

      {gateMessage ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs leading-5 text-[#5C6570]">{gateMessage}</p>
          {needsBilling ? (
            <Link
              href={billingHref}
              className={cn(buttonVariants({ size: "sm" }), "inline-flex")}
            >
              Багц идэвхжүүлэх
            </Link>
          ) : null}
        </div>
      ) : null}

      {result && !gateMessage ? (
        <div className="mt-3 space-y-2">
          {result.suggestionCount === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-[#1A7A72]">
              <Check className="size-3.5" />
              Зөвлөх хувилбар олдсонгүй — зөв үгэнд санал гаргахгүй.
            </p>
          ) : (
            <>
              <p className="text-xs text-[#5C6570]">
                {result.orthographyCount} зөв бичгийн санал
                {includeLatinToCyrillic
                  ? ` · ${result.latinCount} латин→кирилл`
                  : null}
              </p>
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {result.suggestions.map((item, index) => (
                  <li
                    key={`${item.kind}-${item.sourceWord}-${index}`}
                    className="rounded-lg border border-[#0B1F3A]/8 bg-[#F8FAFC] px-2.5 py-2"
                  >
                    <p className="text-xs font-medium text-[#0B1F3A]">
                      «{item.sourceWord}»
                      {item.ruleIds[0] ? (
                        <span className="ml-1 font-normal text-[#8A939D]">
                          {item.ruleIds[0]}
                        </span>
                      ) : item.kind === "LATIN_TO_CYRILLIC" ? (
                        <span className="ml-1 font-normal text-[#8A939D]">
                          латин
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#5C6570]">
                      {item.suggestionLabel}
                    </p>
                    <button
                      type="button"
                      className="mt-1.5 text-[11px] font-semibold text-[#1A7A72] hover:underline"
                      onClick={() => applyOne(item)}
                    >
                      Сонгох → {item.suggestedWord}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function OrthographyCheckButton({
  onClick,
  loading,
  disabled,
  pressed,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Зөв бичгийн алдаа шалгах"
      title="Зөв бичгийн алдаа шалгах"
      disabled={disabled || loading}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-[#5C6570] transition hover:bg-[#0B1F3A]/8 hover:text-[#0B1F3A]",
        pressed && "bg-[#0B1F3A]/10 text-[#0B1F3A]",
        (disabled || loading) && "opacity-50",
      )}
    >
      <SpellCheck2 className="size-4" />
    </button>
  );
}

/** Standalone panel with its own check button (Student draft pad). */
export function OrthographyChecker({
  text,
  onApplySuggestion,
  billingHref = "/#chat",
  disabled = false,
  className,
}: {
  text: string;
  onApplySuggestion: (nextText: string) => void;
  billingHref?: string;
  disabled?: boolean;
  className?: string;
}) {
  const ortho = useOrthographyCheck();

  return (
    <div className={cn("mt-3", className)}>
      <Button
        type="button"
        size="sm"
        className="bg-[#0B1F3A] text-white hover:bg-[#173A66]"
        disabled={disabled || ortho.loading || !text.trim()}
        onClick={() => void ortho.check(text)}
      >
        {ortho.loading ? "Шалгаж байна…" : "Алдаа шалгах"}
      </Button>
      {ortho.open ? (
        <OrthographyResults
          className="mt-3"
          loading={ortho.loading}
          result={ortho.result}
          gateMessage={ortho.gateMessage}
          needsBilling={ortho.needsBilling}
          text={text}
          includeLatinToCyrillic={ortho.includeLatinToCyrillic}
          onIncludeLatinChange={(value) => {
            ortho.setIncludeLatinToCyrillic(value);
            void ortho.check(text, { includeLatinToCyrillic: value });
          }}
          billingHref={billingHref}
          onApplySuggestion={onApplySuggestion}
          onRecheck={(next) => void ortho.check(next)}
          onClose={ortho.clear}
        />
      ) : null}
    </div>
  );
}

function replaceWordInText(
  text: string,
  sourceWord: string,
  suggestedWord: string,
): string {
  const boundary = `[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']`;
  const exact = new RegExp(
    `(^|${boundary})(${escapeRegExp(sourceWord)})(?=${boundary}|$)`,
    "u",
  );
  const once = text.replace(exact, `$1${suggestedWord}`);
  if (once !== text) return once;

  const insensitive = new RegExp(
    `(^|${boundary})(${escapeRegExp(sourceWord)})(?=${boundary}|$)`,
    "giu",
  );
  return text.replace(insensitive, `$1${suggestedWord}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
