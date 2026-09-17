/**
 * Pure scroll-position math shared by the Legal AI composer's
 * scroll-to-bottom control (spellcheck-textarea.tsx) and the message
 * transcript's auto-follow/new-response control (legal-ai-chat.tsx).
 * Kept dependency-free and framework-free so it's testable without a real
 * layout engine (jsdom reports zero for every scroll metric) — callers
 * measure the real element, this just does the arithmetic.
 */

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** True when the scrollable content extends past its visible area at all. */
export function hasScrollableOverflow(metrics: Pick<ScrollMetrics, "scrollHeight" | "clientHeight">): boolean {
  return metrics.scrollHeight > metrics.clientHeight + 1;
}

/** True when scrolled within `thresholdPx` of the true bottom. */
export function isNearBottom(metrics: ScrollMetrics, thresholdPx: number): boolean {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

/** Whether a floating "scroll to bottom" control should be shown: there is
 * overflow to scroll through, and the viewer isn't already near the end. */
export function shouldShowScrollToBottom(metrics: ScrollMetrics, thresholdPx: number): boolean {
  return hasScrollableOverflow(metrics) && !isNearBottom(metrics, thresholdPx);
}
