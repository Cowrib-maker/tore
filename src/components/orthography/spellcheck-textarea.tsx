"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEventHandler, RefObject, ReactNode, UIEvent, MouseEvent } from "react";
import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
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
  maxHeightPx?: number;
};

/** Keep only suggestions with a valid span for `text`, sorted left to right
 * (widest span first on a tie) so overlapping spans render deterministically. */
export function rangesForText(
  text: string,
  suggestions: readonly OrthographySuggestionView[],
): OrthographySuggestionView[] {
  return suggestions
    .filter((item) => item.start >= 0 && item.end > item.start && item.start < text.length && item.end <= text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Which flagged span (if any) the caret sits on/against — used to open the
 * suggestion popup for exactly the token the user clicked, independent of
 * every other flagged span in the text. Exported for unit testing. */
export function findActiveRangeIndex(
  ranges: readonly OrthographySuggestionView[],
  caret: number,
): number | null {
  const index = ranges.findIndex(
    (item) =>
      (caret >= item.start && caret <= item.end) ||
      (caret > 0 && caret - 1 >= item.start && caret - 1 < item.end),
  );
  return index >= 0 ? index : null;
}

export function SpellcheckTextarea({ value, suggestions, placeholder, rows = 4, disabled, onChange, onKeyDown, inputRef, className, maxHeightPx }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const ranges = useMemo(() => rangesForText(value, suggestions), [value, suggestions]);
  const active = activeIndex == null ? null : ranges[activeIndex] ?? null;
  const containerRef = useRef<HTMLDivElement>(null);

  const localRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(localRef, value, maxHeightPx);
  function setTextareaRef(el: HTMLTextAreaElement | null) {
    localRef.current = el;
    if (inputRef) inputRef.current = el;
  }

  useEffect(() => setActiveIndex(null), [value]);

  // Clicking anywhere outside this composer (textarea + popup) closes the
  // suggestion popup without touching the text.
  useEffect(() => {
    if (activeIndex == null) return;
    function handleOutsideClick(event: PointerEvent) {
      if (!containerRef.current) return;
      if (event.target instanceof Node && containerRef.current.contains(event.target)) return;
      setActiveIndex(null);
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [activeIndex]);

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const mirror = event.currentTarget.parentElement?.querySelector<HTMLDivElement>("[data-spellcheck-mirror]");
    if (!mirror) return;
    mirror.scrollTop = event.currentTarget.scrollTop;
    mirror.scrollLeft = event.currentTarget.scrollLeft;
  }

  function handleClick(event: MouseEvent<HTMLTextAreaElement>) {
    const caret = event.currentTarget.selectionStart;
    setActiveIndex(findActiveRangeIndex(ranges, caret));
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
    parts.push(
      <span
        key={`error-${item.start}-${item.end}-${index}`}
        className="text-transparent underline decoration-wavy decoration-2 decoration-[#DC2626] underline-offset-[3px]"
      >
        {value.slice(item.start, item.end)}
      </span>,
    );
    cursor = item.end;
  });
  if (cursor < value.length) parts.push(<span key={`tail-${cursor}`}>{value.slice(cursor)}</span>);

  // Best candidate first: candidates already carries the ranked list with
  // suggestedWord as its first entry, but fall back to suggestedWord alone
  // for suggestion kinds (e.g. orthography-rule fixes) that never populate it.
  const candidates = Array.from(new Set([...(active?.candidates ?? []), ...(active?.suggestedWord ? [active.suggestedWord] : [])]));

  return (
    <div ref={containerRef} className="relative isolate">
      <div
        data-spellcheck-mirror
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-6 text-transparent",
          className,
        )}
      >
        {value ? parts : <span className="text-[#9AA3AD]">{placeholder}</span>}
        {value.endsWith("\n") ? " " : null}
      </div>

      <textarea
        ref={setTextareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onClick={handleClick}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          "relative z-10 min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-[#0B1F3A] caret-[#0B1F3A] outline-none selection:bg-[#0F3D33]/15",
          className,
        )}
      />

      {active ? (
        <div
          className="pointer-events-auto absolute left-3 right-3 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#0B1F3A]/15 bg-white p-2 shadow-xl"
          role="dialog"
          aria-label={`${active.sourceWord} үгийн санал`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs">
              <span className="font-semibold text-[#991B1B]">{active.sourceWord}</span>
            </p>
            <button type="button" className="text-[11px] text-[#66717D]" onClick={() => setActiveIndex(null)}>
              Хаах
            </button>
          </div>

          {candidates.length ? (
            <div className="mt-1.5">
              <p className="text-[10px] font-medium text-[#66717D]">Зөв бичих санал</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {candidates.slice(0, 6).map((word) => (
                  <button
                    key={`candidate-${word}`}
                    type="button"
                    className="rounded-md border border-[#1A7A72]/25 bg-[#F2FAF7] px-2 py-1 text-[11px] font-semibold text-[#0F3D33] hover:bg-[#E5F4EE]"
                    onClick={() => apply(word)}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!candidates.length ? (
            <p className="mt-1.5 text-[10px] text-[#66717D]">Энэ үгэнд найдвартай засварын санал одоогоор алга.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
