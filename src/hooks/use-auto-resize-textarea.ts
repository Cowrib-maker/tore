"use client";

import { useLayoutEffect } from "react";
import type { RefObject } from "react";

export const AUTO_RESIZE_TEXTAREA_DEFAULT_MAX_HEIGHT_PX = 240;

/**
 * Grows a <textarea> to fit its content as the user types — like Claude's
 * chat composer — instead of staying a fixed number of rows. Height tracks
 * `scrollHeight` up to `maxHeightPx`; beyond that the textarea scrolls
 * internally instead of growing further.
 *
 * Re-runs on every `value` change (so it also shrinks back down after the
 * text is cleared, e.g. right after a message is sent) and once on mount.
 * Any CSS `min-height` on the element still applies as a floor underneath
 * the inline height this sets.
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeightPx: number = AUTO_RESIZE_TEXTAREA_DEFAULT_MAX_HEIGHT_PX,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }, [ref, value, maxHeightPx]);
}
