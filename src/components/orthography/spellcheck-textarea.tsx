"use client";

import { useEffect, useMemo, useRef } from "react";
import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  suggestions: OrthographySuggestionView[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
};

function rangesForText(text: string, suggestions: OrthographySuggestionView[]) {
  return suggestions
    .filter(
      (item) =>
        item.start >= 0 &&
        item.end > item.start &&
        item.start < text.length &&
        item.end <= text.length,
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

export function SpellcheckTextarea({
  value,
  suggestions,
  placeholder,
  rows = 4,
  disabled,
  onChange,
  onKeyDown,
  inputRef,
  className,
}: Props) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ranges = useMemo(() => rangesForText(value, suggestions), [value, suggestions]);

  useEffect(() => {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    mirror.scrollTop = 0;
    mirror.scrollLeft = 0;
  }, [value]);

  function syncScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    const mirror = mirrorRef.current;
    if (!mirror) return;
    mirror.scrollTop = event.currentTarget.scrollTop;
    mirror.scrollLeft = event.currentTarget.scrollLeft;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((item, index) => {
    if (item.start < cursor) return;
    if (item.start > cursor) {
      parts.push(<span key={`text-${index}-${cursor}`}>{value.slice(cursor, item.start)}</span>);
    }
    parts.push(
      <span
        key={`error-${item.start}-${item.end}-${index}`}
        className="decoration-wavy decoration-2 underline decoration-[#DC2626] underline-offset-[3px]"
        title={`${item.sourceWord} → ${item.suggestedWord}`}
      >
        {value.slice(item.start, item.end)}
      </span>,
    );
    cursor = item.end;
  });
  if (cursor < value.length) parts.push(<span key={`tail-${cursor}`}>{value.slice(cursor)}</span>);

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-6 text-[#0B1F3A]",
          className,
        )}
      >
        {value ? parts : <span className="text-[#9AA3AD]">{placeholder}</span>}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          "relative min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-transparent caret-[#0B1F3A] outline-none selection:bg-[#0F3D33]/15 selection:text-transparent placeholder:text-[#9AA3AD]",
          className,
        )}
      />
    </div>
  );
}
