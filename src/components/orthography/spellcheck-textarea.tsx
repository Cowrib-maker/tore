"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEventHandler, RefObject, ReactNode, UIEvent, MouseEvent } from "react";
import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  suggestions: OrthographySuggestionView[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
};

function rangesForText(text: string, suggestions: OrthographySuggestionView[]) {
  return suggestions.filter((item) => item.start >= 0 && item.end > item.start && item.start < text.length && item.end <= text.length).sort((a, b) => a.start - b.start || b.end - a.end);
}

export function SpellcheckTextarea({ value, suggestions, placeholder, rows = 4, disabled, onChange, onKeyDown, inputRef, className }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const ranges = useMemo(() => rangesForText(value, suggestions), [value, suggestions]);
  const active = activeIndex == null ? null : ranges[activeIndex] ?? null;

  useEffect(() => setActiveIndex(null), [value]);

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    // The overlay is intentionally pointer-transparent; textarea remains the real editor.
    const mirror = event.currentTarget.parentElement?.querySelector<HTMLDivElement>("[data-spellcheck-mirror]");
    if (!mirror) return;
    mirror.scrollTop = event.currentTarget.scrollTop;
    mirror.scrollLeft = event.currentTarget.scrollLeft;
  }

  function handleClick(event: MouseEvent<HTMLTextAreaElement>) {
    const caret = event.currentTarget.selectionStart;
    const index = ranges.findIndex((item) => (caret >= item.start && caret <= item.end) || (caret > 0 && caret - 1 >= item.start && caret - 1 < item.end));
    setActiveIndex(index >= 0 ? index : null);
  }

  function apply(word: string) {
    if (!active) return;
    const next = `${value.slice(0, active.start)}${word}${value.slice(active.end)}`;
    onChange(next);
    setActiveIndex(null);
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((item, index) => {
    if (item.start < cursor) return;
    if (item.start > cursor) parts.push(<span key={`text-${index}-${cursor}`}>{value.slice(cursor, item.start)}</span>);
    parts.push(<span key={`error-${item.start}-${item.end}-${index}`} className="underline decoration-wavy decoration-2 decoration-[#DC2626] underline-offset-[3px]">{value.slice(item.start, item.end)}</span>);
    cursor = item.end;
  });
  if (cursor < value.length) parts.push(<span key={`tail-${cursor}`}>{value.slice(cursor)}</span>);

  return (
    <div className="relative">
      <div data-spellcheck-mirror aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-6 text-[#0B1F3A]", className)}>
        {value ? parts : <span className="text-[#9AA3AD]">{placeholder}</span>}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} onClick={handleClick} onScroll={syncScroll} placeholder={placeholder} rows={rows} disabled={disabled} spellCheck={false} className={cn("relative min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-transparent caret-[#0B1F3A] outline-none selection:bg-[#0F3D33]/15 selection:text-transparent placeholder:text-[#9AA3AD]", className)} />
      {active ? (
        <div className="absolute left-3 right-3 top-2 z-30 rounded-lg border border-[#0B1F3A]/15 bg-white p-2 shadow-xl" role="dialog" aria-label={`${active.sourceWord} үгийн санал`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs"><span className="font-semibold text-[#991B1B]">{active.sourceWord}</span><span className="mx-1 text-[#8A939D]">→</span><span className="font-semibold text-[#1B5E20]">{active.suggestedWord}</span></p>
            <button type="button" className="text-[11px] text-[#66717D]" onClick={() => setActiveIndex(null)}>Хаах</button>
          </div>
          <button type="button" className="mt-1.5 rounded-md bg-[#0F3D33] px-2.5 py-1 text-[11px] font-semibold text-white" onClick={() => apply(active.suggestedWord)}>Зөвөөр солих</button>
          {active.relatedWords?.length ? <div className="mt-2 border-t border-[#0B1F3A]/8 pt-2"><p className="text-[10px] font-medium text-[#66717D]">Үгийн үндэс / язгуураар төстэй үгс</p><div className="mt-1 flex flex-wrap gap-1">{active.relatedWords.map((word) => <button key={word} type="button" className="rounded border border-[#0B1F3A]/10 px-1.5 py-0.5 text-[10px] text-[#0B1F3A] hover:bg-[#F3F6F8]" onClick={() => apply(word)}>{word}</button>)}</div></div> : null}
        </div>
      ) : null}
    </div>
  );
}
