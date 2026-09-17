import { describe, expect, it } from "vitest";

import {
  hasScrollableOverflow,
  isNearBottom,
  shouldShowScrollToBottom,
} from "@/lib/scroll-position";

/**
 * Pure scroll-position math shared by the composer's scroll-to-bottom
 * control and the message transcript's auto-follow/new-response control.
 * No DOM/layout engine involved — jsdom reports zero for every real scroll
 * metric, so this logic is deliberately factored out to be testable with
 * plain numbers instead.
 */

describe("hasScrollableOverflow", () => {
  it("is false when content exactly fills the visible area", () => {
    expect(hasScrollableOverflow({ scrollHeight: 100, clientHeight: 100 })).toBe(false);
  });

  it("is false when content is shorter than the visible area", () => {
    expect(hasScrollableOverflow({ scrollHeight: 60, clientHeight: 100 })).toBe(false);
  });

  it("is true once content exceeds the visible area", () => {
    expect(hasScrollableOverflow({ scrollHeight: 250, clientHeight: 100 })).toBe(true);
  });

  it("tolerates a 1px rounding difference without reporting overflow", () => {
    expect(hasScrollableOverflow({ scrollHeight: 100.6, clientHeight: 100 })).toBe(false);
  });
});

describe("isNearBottom", () => {
  it("is true when scrolled exactly to the bottom", () => {
    expect(isNearBottom({ scrollTop: 150, scrollHeight: 250, clientHeight: 100 }, 24)).toBe(true);
  });

  it("is true within the threshold distance from the bottom", () => {
    expect(isNearBottom({ scrollTop: 140, scrollHeight: 250, clientHeight: 100 }, 24)).toBe(true);
  });

  it("is false beyond the threshold distance from the bottom", () => {
    expect(isNearBottom({ scrollTop: 100, scrollHeight: 250, clientHeight: 100 }, 24)).toBe(false);
  });

  it("is true when there is no overflow at all (content fits, so any scrollTop is 'at bottom')", () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 80, clientHeight: 100 }, 24)).toBe(true);
  });

  it("respects a zero threshold as an exact-bottom check", () => {
    expect(isNearBottom({ scrollTop: 149, scrollHeight: 250, clientHeight: 100 }, 0)).toBe(false);
    expect(isNearBottom({ scrollTop: 150, scrollHeight: 250, clientHeight: 100 }, 0)).toBe(true);
  });
});

describe("shouldShowScrollToBottom", () => {
  it("is false when there is nothing to scroll (no overflow)", () => {
    expect(
      shouldShowScrollToBottom({ scrollTop: 0, scrollHeight: 80, clientHeight: 100 }, 24),
    ).toBe(false);
  });

  it("is false when overflowing but already near the bottom", () => {
    expect(
      shouldShowScrollToBottom({ scrollTop: 145, scrollHeight: 250, clientHeight: 100 }, 24),
    ).toBe(false);
  });

  it("is true when overflowing and scrolled away from the bottom", () => {
    expect(
      shouldShowScrollToBottom({ scrollTop: 0, scrollHeight: 250, clientHeight: 100 }, 24),
    ).toBe(true);
  });

  it("flips to false the moment scrolling reaches the near-bottom threshold", () => {
    const clientHeight = 100;
    const scrollHeight = 250;
    const threshold = 24;
    const justOutside = { scrollTop: scrollHeight - clientHeight - threshold - 1, scrollHeight, clientHeight };
    const justInside = { scrollTop: scrollHeight - clientHeight - threshold, scrollHeight, clientHeight };
    expect(shouldShowScrollToBottom(justOutside, threshold)).toBe(true);
    expect(shouldShowScrollToBottom(justInside, threshold)).toBe(false);
  });
});
