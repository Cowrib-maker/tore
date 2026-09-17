"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEventHandler, RefObject, ReactNode, UIEvent, MouseEvent } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { shouldShowScrollToBottom } from "@/lib/scroll-position";
import { cn } from "@/lib/utils";

/** Below this distance (px) from the true bottom, the textarea counts as
 * "at bottom" — hides the scroll-to-bottom control and matches what a user
 * would perceive as already caught up. */
const NEAR_BOTTOM_THRESHOLD_PX = 24;

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
 * suggestion menu for exactly the token the user clicked, independent of
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

/** Identifies one specific occurrence of a flagged span by text range (not
 * just the word), since the same misspelling can occur multiple times.
 * Exported for unit testing. */
export function rangeKey(item: Pick<OrthographySuggestionView, "start" | "end" | "sourceWord">): string {
  return `${item.start}:${item.end}:${item.sourceWord}`;
}

/** Which flagged span (if any) a screen point falls inside, by testing it
 * against each span's real rendered client rects — `getClientRects()`
 * rather than `getBoundingClientRect()` so a span that itself wraps across
 * lines is tested per line-fragment, not against one bounding box spanning
 * the gap between them. Used for right-click, where `selectionStart` is not
 * a reliable stand-in for "where the user clicked" (see handleContextMenu).
 * Exported for unit testing. */
export function findRangeIndexAtPoint(
  ranges: readonly OrthographySuggestionView[],
  spanEls: ReadonlyMap<number, HTMLSpanElement>,
  clientX: number,
  clientY: number,
): number | null {
  for (let index = 0; index < ranges.length; index += 1) {
    const el = spanEls.get(index);
    if (!el) continue;
    const rects = el.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i]!;
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return index;
      }
    }
  }
  return null;
}

export function SpellcheckTextarea({ value, suggestions, placeholder, rows = 4, disabled, onChange, onKeyDown, inputRef, className, maxHeightPx }: Props) {
  // Tracked by STABLE KEY (start:end:sourceWord), not array index: if
  // `suggestions` changes shape while a menu is open (e.g. an external
  // re-check re-runs on unchanged text) without `value` itself changing,
  // an index could silently point at a different span after the array
  // shifts. Re-deriving the index from the key against the CURRENT
  // `ranges` every render means the menu only ever shows the span it was
  // actually opened for, or closes if that exact span is gone.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Session-local "ignore this occurrence" set — never persisted, never
  // mutates the dictionary. Keyed by exact text range + word, so an edit
  // that shifts positions naturally drops an ignore rather than silencing
  // the wrong span.
  const [ignoredKeys, setIgnoredKeys] = useState<ReadonlySet<string>>(() => new Set());

  const allRanges = useMemo(() => rangesForText(value, suggestions), [value, suggestions]);
  const ranges = useMemo(
    () => allRanges.filter((item) => !ignoredKeys.has(rangeKey(item))),
    [allRanges, ignoredKeys],
  );
  const activeIndex = activeKey == null ? -1 : ranges.findIndex((item) => rangeKey(item) === activeKey);
  const active = activeIndex >= 0 ? ranges[activeIndex]! : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const spanRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  const localRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(localRef, value, maxHeightPx);
  function setTextareaRef(el: HTMLTextAreaElement | null) {
    localRef.current = el;
    if (inputRef) inputRef.current = el;
  }

  // Whether the textarea has scrollable overflow and the user isn't already
  // near the bottom of it — drives the floating "scroll to bottom" control.
  // Kept in a ref alongside the state so the scroll handler can skip
  // setState entirely when the boolean hasn't actually changed, instead of
  // triggering a re-render on every scroll tick.
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollToBottomRef = useRef(false);

  const checkScrollAffordance = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    const shouldShow = shouldShowScrollToBottom(el, NEAR_BOTTOM_THRESHOLD_PX);
    if (shouldShow !== showScrollToBottomRef.current) {
      showScrollToBottomRef.current = shouldShow;
      setShowScrollToBottom(shouldShow);
    }
  }, []);

  // Re-check after every value change too: typing can grow/shrink content
  // (and so scrollHeight) without necessarily firing a scroll event.
  useEffect(() => {
    checkScrollAffordance();
  }, [value, checkScrollAffordance]);

  function scrollTextareaToBottom() {
    localRef.current?.scrollTo({ top: localRef.current.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => setActiveKey(null), [value]);

  const closeMenu = useCallback(() => setActiveKey(null), []);

  function openForCaret(caret: number) {
    const index = findActiveRangeIndex(ranges, caret);
    setActiveKey(index == null ? null : rangeKey(ranges[index]!));
  }

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const mirror = event.currentTarget.parentElement?.querySelector<HTMLDivElement>("[data-spellcheck-mirror]");
    if (mirror) {
      mirror.scrollTop = event.currentTarget.scrollTop;
      mirror.scrollLeft = event.currentTarget.scrollLeft;
    }
    checkScrollAffordance();
  }

  // Left click: the browser has already moved the caret by the time this
  // fires, so normal cursor placement/selection is never touched — we only
  // check afterwards whether the caret landed inside a flagged span.
  function handleClick(event: MouseEvent<HTMLTextAreaElement>) {
    openForCaret(event.currentTarget.selectionStart);
  }

  // Right click: unlike left click, `selectionStart` is NOT a reliable proxy
  // for "where the user clicked" here — if the user already had a text range
  // selected (e.g. spanning past a flagged word) and right-clicks inside
  // that selection, browsers preserve the selection instead of collapsing
  // the caret to the click point, so `selectionStart` would silently
  // describe the wrong position. Hit-test the actual click point against
  // the flagged mirror spans' real screen rects instead — correct
  // regardless of selection state, focus history, wrapping, scroll, or zoom.
  function handleContextMenu(event: MouseEvent<HTMLTextAreaElement>) {
    const index = findRangeIndexAtPoint(ranges, spanRefs.current, event.clientX, event.clientY);
    if (index == null) {
      // Right-clicking plain text must never leave a stale menu (from a
      // previously flagged word) open behind the native context menu.
      closeMenu();
      return;
    }
    event.preventDefault();
    setActiveKey(rangeKey(ranges[index]!));
  }

  function apply(word: string) {
    if (!active) return;
    const next = `${value.slice(0, active.start)}${word}${value.slice(active.end)}`;
    onChange(next);
    closeMenu();
  }

  function ignoreActive() {
    if (!active) return;
    const key = rangeKey(active);
    setIgnoredKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    closeMenu();
  }

  // A floating-ui "virtual element": getBoundingClientRect is read live off
  // the corresponding invisible mirror span, so the menu tracks the actual
  // on-screen token position (including textarea-internal scroll, since the
  // mirror's scroll is kept in sync with the textarea in syncScroll) without
  // any manual character-to-pixel math. contextElement lets floating-ui find
  // the textarea's scroll ancestors for auto-repositioning.
  const anchor = useMemo(() => {
    if (activeIndex < 0) return null;
    const index = activeIndex;
    return {
      getBoundingClientRect: () => spanRefs.current.get(index)?.getBoundingClientRect() ?? new DOMRect(),
      contextElement: localRef.current ?? undefined,
    };
  }, [activeIndex]);

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((item, index) => {
    if (item.start < cursor) return;
    if (item.start > cursor) parts.push(<span key={`text-${index}-${cursor}`}>{value.slice(cursor, item.start)}</span>);
    parts.push(
      <span
        key={`error-${item.start}-${item.end}-${index}`}
        ref={(el) => {
          if (el) spanRefs.current.set(index, el);
          else spanRefs.current.delete(index);
        }}
        className="text-transparent underline decoration-wavy decoration-2 decoration-destructive underline-offset-[3px]"
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
        {value ? parts : <span className="text-muted-foreground">{placeholder}</span>}
        {value.endsWith("\n") ? " " : null}
      </div>

      <textarea
        ref={setTextareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          // `block` (textareas default to inline-block) removes it from an
          // inline formatting context: an inline-block's `vertical-align:
          // baseline` otherwise leaves a font-descender gap below it in its
          // line box, making the container (and so the inset-0 mirror,
          // which stretches to match) a few pixels taller than the
          // textarea's own rendered height. Harmless while at rest, but
          // that gap becomes a real bug once the textarea scrolls
          // internally: the mirror's own max scrollTop would then be a few
          // pixels short of the textarea's, so syncScroll's 1:1 assignment
          // clamps short and the underline drifts from the real text near
          // the bottom of a scrolled block.
          "relative z-10 block min-h-16 w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-foreground caret-foreground outline-none selection:bg-primary/15",
          className,
        )}
      />

      {showScrollToBottom ? (
        <button
          type="button"
          aria-label="Бичвэрийн төгсгөл рүү гүйлгэх"
          title="Бичвэрийн төгсгөл рүү гүйлгэх"
          // Prevents the button from ever taking focus away from the
          // textarea, so clicking it can never move or lose the cursor —
          // the textarea's selection is simply never touched.
          onMouseDown={(event) => event.preventDefault()}
          onClick={scrollTextareaToBottom}
          className={cn(
            "absolute right-2 bottom-2 z-20 inline-flex size-7 items-center justify-center rounded-full",
            "border border-border bg-popover text-muted-foreground shadow-md",
            "transition hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      <Menu.Root
        open={active != null}
        onOpenChange={(open) => {
          if (!open) closeMenu();
        }}
        modal={false}
      >
        <Menu.Portal>
          <Menu.Positioner
            className="isolate z-50 outline-none"
            anchor={anchor}
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={8}
          >
            <Menu.Popup
              finalFocus={localRef}
              aria-label={active ? `${active.sourceWord} үгийн санал` : undefined}
              className="min-w-40 max-w-72 rounded-lg border border-border bg-popover p-1.5 shadow-xl outline-none"
            >
              {active ? (
                <div className="px-1.5 py-1 text-xs font-semibold text-destructive">{active.sourceWord}</div>
              ) : null}

              {candidates.length ? (
                candidates.slice(0, 6).map((word) => (
                  <Menu.Item
                    key={`candidate-${word}`}
                    className="cursor-default rounded-md px-1.5 py-1.5 text-[13px] font-medium text-primary outline-none data-[highlighted]:bg-accent"
                    onClick={() => apply(word)}
                  >
                    {word}
                  </Menu.Item>
                ))
              ) : (
                <p className="px-1.5 py-1.5 text-[11px] text-muted-foreground">Энэ үгэнд найдвартай засварын санал одоогоор алга.</p>
              )}

              <Menu.Separator className="my-1 h-px bg-border" />

              <Menu.Item
                className="cursor-default rounded-md px-1.5 py-1.5 text-[12px] text-muted-foreground outline-none data-[highlighted]:bg-accent"
                onClick={ignoreActive}
              >
                Алдаа биш — үл хэрэгсэх
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
