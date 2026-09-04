"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, SpellCheck2 } from "lucide-react";
import { toast } from "sonner";

import { OrthographySpellPanel } from "@/components/orthography/orthography-spell-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { buildOrthographySuggestions } from "@/domain/mongolian-orthography/suggestions";
import { cn } from "@/lib/utils";

export { OrthographySpellPanel } from "@/components/orthography/orthography-spell-panel";

export type OrthographySuggestionView = {
  kind: "ORTHOGRAPHY" | "LATIN_TO_CYRILLIC" | "SPELLING";
  sourceWord: string;
  suggestedWord: string;
  suggestionLabel: string;
  ruleIds: readonly string[];
  ruleTitle: string | null;
  start: number;
  end: number;
  candidates?: readonly string[];
  relatedWords?: readonly string[];
};

export type OrthographyCheckApiResult = {
  suggestions: OrthographySuggestionView[];
  suggestionCount: number;
  orthographyCount: number;
  latinCount: number;
  spellingCount: number;
  wordCount: number;
  characterCount: number;
  premium: true;
};

export type OrthographyCheckMode = "manual" | "auto";

function localOrthographyResult(text: string, includeLatinToCyrillic: boolean): OrthographyCheckApiResult {
  return { ...buildOrthographySuggestions(text, { includeLatinToCyrillic }), premium: true };
}

export function useOrthographyCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OrthographyCheckApiResult | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [needsBilling, setNeedsBilling] = useState(false);
  const [open, setOpen] = useState(false);
  const [includeLatinToCyrillic, setIncludeLatinToCyrillic] = useState(false);
  const [checkedText, setCheckedText] = useState("");
  const lastCheckedTextRef = useRef<string | null>(null);

  const clear = useCallback(() => {
    setResult(null); setGateMessage(null); setNeedsBilling(false); setOpen(false); setCheckedText(""); lastCheckedTextRef.current = null;
  }, []);

  const check = useCallback(async (text: string, options?: { includeLatinToCyrillic?: boolean; mode?: OrthographyCheckMode }) => {
    const mode = options?.mode ?? "manual";
    const trimmed = text.trim();
    if (!trimmed) {
      if (mode === "manual") toast.message("Шалгах текст оруулна уу."); else clear();
      return;
    }
    if (mode === "auto" && trimmed === lastCheckedTextRef.current) return;

    const latin = options?.includeLatinToCyrillic ?? includeLatinToCyrillic;
    setLoading(true); setGateMessage(null); setNeedsBilling(false);
    if (mode === "manual") setOpen(true);

    setCheckedText(trimmed);
    const local = localOrthographyResult(trimmed, latin);
    setResult(local);
    if (mode === "auto") setOpen(local.suggestionCount > 0 || local.spellingCount > 0);

    try {
      const response = await fetch("/api/orthography/check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, includeLatinToCyrillic: latin }),
      });
      const payload = (await response.json().catch(() => null)) as OrthographyCheckApiResult | { error?: string; code?: string } | null;
      if (!response.ok) {
        const message = payload && "error" in payload && payload.error ? payload.error : "Алдаа шалгах үед алдаа гарлаа.";
        setGateMessage(message);
        setNeedsBilling(response.status === 402 || (payload != null && "code" in payload && payload.code === "BILLING_REQUIRED"));
        if (mode === "manual") { setOpen(true); if (response.status === 401) { toast.error(message); setResult(null); } }
        else if (response.status === 401) { setOpen(false); setResult(null); }
        return;
      }
      lastCheckedTextRef.current = trimmed;
      const typed = payload as OrthographyCheckApiResult;
      setResult(typed);
      setOpen(mode === "auto" ? typed.suggestionCount > 0 || typed.spellingCount > 0 : true);
    } catch {
      setGateMessage("Сүлжээний алдаа. Дахин оролдоно уу.");
      if (mode === "manual") { setOpen(true); toast.error("Сүлжээний алдаа — локал шалгалтын үр дүн харагдаж байна."); }
      else setOpen(local.suggestionCount > 0 || local.spellingCount > 0);
    } finally { setLoading(false); }
  }, [clear, includeLatinToCyrillic]);

  return { loading, result, gateMessage, needsBilling, open, setOpen, checkedText, includeLatinToCyrillic, setIncludeLatinToCyrillic, check, clear, setResult };
}

export function useOrthographyAutoCheck(text: string, check: (value: string, options?: { mode?: OrthographyCheckMode }) => void | Promise<void>, options?: { debounceMs?: number; minLength?: number; enabled?: boolean; clear?: () => void }) {
  const { debounceMs = 750, minLength = 10, enabled = true, clear } = options ?? {};
  useEffect(() => {
    if (!enabled) return;
    const trimmed = text.trim();
    if (trimmed.length < minLength) { clear?.(); return; }
    const timer = window.setTimeout(() => { void check(trimmed, { mode: "auto" }); }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [check, clear, debounceMs, enabled, minLength, text]);
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

export function OrthographyResults({ loading, result, gateMessage, needsBilling, text, includeLatinToCyrillic, onIncludeLatinChange, onApplySuggestion, onRecheck, onClose, billingHref = "/legal-ai", className }: OrthographyResultsProps) {
  function applyOne(item: OrthographySuggestionView) {
    const next = item.start >= 0 && item.end > item.start ? `${text.slice(0, item.start)}${item.suggestedWord}${text.slice(item.end)}` : replaceWordInText(text, item.sourceWord, item.suggestedWord);
    if (next === text) { toast.message("Энэ үг текстээс олдсонгүй."); return; }
    onApplySuggestion(next); toast.success(`«${item.sourceWord}» → «${item.suggestedWord}»`); onRecheck(next);
  }

  return (
    <OrthographySpellPanel
      loading={loading}
      result={result}
      gateMessage={gateMessage}
      needsBilling={needsBilling}
      text={text}
      includeLatinToCyrillic={includeLatinToCyrillic}
      onIncludeLatinChange={onIncludeLatinChange}
      onApplySuggestion={onApplySuggestion}
      onRecheck={onRecheck}
      onClose={onClose}
      billingHref={billingHref}
      className={className}
    />
  );
}

export function OrthographyCheckButton({ onClick, loading = false, className }: { onClick: () => void; loading?: boolean; className?: string }) {
  return <Button type="button" variant="outline" disabled={loading} onClick={onClick} className={cn("gap-2", className)}><SpellCheck2 className="size-4" />{loading ? "Шалгаж байна…" : "Алдаа шалгах"}</Button>;
}

function replaceWordInText(text: string, sourceWord: string, suggestedWord: string): string {
  const escaped = sourceWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü'])(${escaped})(?=[^A-Za-zА-Яа-яӨөҮүЁёЪъЬьЫыÖÜöü']|$)`, "u");
  const next = text.replace(pattern, `$1${suggestedWord}`);
  return next !== text ? next : text.replace(new RegExp(escaped, "giu"), suggestedWord);
}
