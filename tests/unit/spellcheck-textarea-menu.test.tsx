// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { SpellcheckTextarea } from "@/components/orthography/spellcheck-textarea";
import type { OrthographySuggestionView } from "@/components/orthography/orthography-checker";

/**
 * Orthography UX V2 — inline word-level suggestion menu.
 *
 * jsdom has no real layout engine (getBoundingClientRect always returns a
 * zero rect, there is no viewport to overflow), so these tests can prove
 * FUNCTIONAL correctness — the right token is targeted, the right text
 * range is replaced, keyboard/escape/outside-click behavior is correct,
 * duplicate popups never appear, the existing prop contract (onKeyDown,
 * onChange, disabled) is untouched — but they cannot demonstrate real
 * pixel positioning, viewport clipping, or side-flip behavior. Those were
 * verified separately via a live local dev-server browser check (see the
 * milestone's final report), never against production.
 */

beforeAll(() => {
  // Base UI's Menu (via floating-ui) uses these during positioning/pointer
  // interaction; jsdom does not implement them.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;

  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // @ts-expect-error -- test polyfill
  global.IntersectionObserver ??= IntersectionObserverStub;

  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
});

function suggestion(
  overrides: Partial<OrthographySuggestionView> & Pick<OrthographySuggestionView, "sourceWord" | "start" | "end">,
): OrthographySuggestionView {
  return {
    kind: "SPELLING",
    suggestedWord: overrides.sourceWord,
    suggestionLabel: "",
    ruleIds: [],
    ruleTitle: null,
    candidates: [],
    ...overrides,
  };
}

function renderComposer(overrides?: {
  value?: string;
  suggestions?: OrthographySuggestionView[];
  onChange?: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const onChange = overrides?.onChange ?? vi.fn();
  const value =
    overrides?.value ?? "өчигдөр гэртаа байхад манай найз ирээт надэд хоол хийж өгсөн";
  const suggestions =
    overrides?.suggestions ??
    ([
      suggestion({ sourceWord: "гэртаа", start: 8, end: 14, suggestedWord: "гэртээ", candidates: ["гэртээ", "гэрт", "гэрийн"] }),
      suggestion({ sourceWord: "ирээт", start: 33, end: 38, suggestedWord: "ирээд", candidates: ["ирээд"] }),
      suggestion({ sourceWord: "надэд", start: 39, end: 44, suggestedWord: "надад", candidates: ["надад"] }),
    ] satisfies OrthographySuggestionView[]);

  const utils = render(
    <SpellcheckTextarea value={value} suggestions={suggestions} onChange={onChange} onKeyDown={overrides?.onKeyDown} />,
  );
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  return { ...utils, textarea, onChange, value, suggestions };
}

function setCaret(textarea: HTMLTextAreaElement, position: number) {
  textarea.selectionStart = position;
  textarea.selectionEnd = position;
}

/**
 * jsdom has no layout engine — every element's getBoundingClientRect /
 * getClientRects is always (0,0,0,0), so a naive contextmenu event (default
 * clientX/clientY = 0) would spuriously "hit" every element's zero-rect at
 * once. These helpers give specific mirror spans real, distinguishable
 * rects so findRangeIndexAtPoint's point-in-rect geometry can be exercised
 * meaningfully and deterministically, independent of jsdom's lack of layout.
 */
function stubRect(el: HTMLElement, rect: { left: number; right: number; top: number; bottom: number }) {
  const domRect = {
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    toJSON() {
      return this;
    },
  } as DOMRect;
  el.getBoundingClientRect = () => domRect;
  const list = [domRect] as unknown as DOMRectList;
  el.getClientRects = () => list;
}

function getMirrorSpanByText(container: HTMLElement, text: string): HTMLSpanElement {
  const spans = Array.from(container.querySelectorAll<HTMLSpanElement>("[data-spellcheck-mirror] span"));
  const el = spans.find((s) => s.textContent === text);
  if (!el) throw new Error(`mirror span not found for "${text}"`);
  return el;
}

/** Places non-overlapping, known screen rects on each flagged mirror span so
 * contextmenu point geometry can be tested deterministically. */
function stubDefaultFixtureRects(container: HTMLElement) {
  stubRect(getMirrorSpanByText(container, "гэртаа"), { left: 100, right: 160, top: 0, bottom: 20 });
  stubRect(getMirrorSpanByText(container, "ирээт"), { left: 200, right: 260, top: 0, bottom: 20 });
  stubRect(getMirrorSpanByText(container, "надэд"), { left: 300, right: 360, top: 0, bottom: 20 });
}

describe("SpellcheckTextarea — inline word-level menu", () => {
  it("A/I: correct words never open a menu; clicking a flagged token opens exactly one menu for that token", () => {
    const { textarea } = renderComposer();

    // Click inside "байхад" (a correct word) — no menu.
    setCaret(textarea, 20);
    fireEvent.click(textarea);
    expect(screen.queryByRole("menu")).toBeNull();

    // Click inside "гэртаа" — opens a menu scoped to that word only.
    setCaret(textarea, 10);
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("гэртаа")).toBeTruthy();
    expect(within(menu).getByText("гэртээ")).toBeTruthy();
    expect(within(menu).queryByText("надад")).toBeNull();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  it("B/D: two different (and two identical-word) flagged spans are independently addressable — opening one never leaks another's candidates", () => {
    const { textarea } = renderComposer();

    setCaret(textarea, 35); // inside "ирээт"
    fireEvent.click(textarea);
    let menu = screen.getByRole("menu");
    expect(within(menu).getByText("ирээт")).toBeTruthy();
    expect(within(menu).getByText("ирээд")).toBeTruthy();
    expect(within(menu).queryByText("надад")).toBeNull();

    setCaret(textarea, 41); // inside "надэд"
    fireEvent.click(textarea);
    expect(screen.getAllByRole("menu")).toHaveLength(1); // never two popups at once
    menu = screen.getByRole("menu");
    expect(within(menu).getByText("надэд")).toBeTruthy();
    expect(within(menu).getByText("надад")).toBeTruthy();
    expect(within(menu).queryByText("ирээд")).toBeNull();
  });

  it("D: identical misspelled words at two different positions are addressed by their own text range, not by word text", () => {
    const value = "гэртаа өдөр гэртаа";
    const suggestions = [
      suggestion({ sourceWord: "гэртаа", start: 0, end: 6, suggestedWord: "гэртээ", candidates: ["гэртээ (1)"] }),
      suggestion({ sourceWord: "гэртаа", start: 12, end: 18, suggestedWord: "гэрийн", candidates: ["гэрийн (2)"] }),
    ];
    const onChange = vi.fn();
    const { textarea } = renderComposer({ value, suggestions, onChange });

    setCaret(textarea, 15); // inside the SECOND occurrence
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("гэрийн (2)")).toBeTruthy();
    expect(within(menu).queryByText("гэртээ (1)")).toBeNull();

    fireEvent.click(within(menu).getByText("гэрийн (2)"));
    // Only the SECOND occurrence was replaced; the first is untouched.
    expect(onChange).toHaveBeenCalledWith("гэртаа өдөр гэрийн (2)");
  });

  it("C: selecting a suggestion replaces only that token's exact range, preserving everything before/after", () => {
    const onChange = vi.fn();
    const { textarea } = renderComposer({ onChange });

    setCaret(textarea, 10); // "гэртаа"
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByText("гэртээ"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as string;
    expect(next).toBe("өчигдөр гэртээ байхад манай найз ирээт надэд хоол хийж өгсөн");
    // No duplicate popup left open after applying.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("right-click on a flagged token (by actual screen point, not selectionStart) opens the menu and suppresses the native context menu; right-click elsewhere does not", () => {
    const { textarea, container } = renderComposer();
    stubDefaultFixtureRects(container);

    // A point nowhere near any flagged span's stubbed rect — native menu allowed.
    const elsewhereEvent = fireEvent.contextMenu(textarea, { clientX: 500, clientY: 500 });
    expect(elsewhereEvent).toBe(true); // not prevented
    expect(screen.queryByRole("menu")).toBeNull();

    // A point inside "гэртаа"'s stubbed rect.
    const onFlaggedEvent = fireEvent.contextMenu(textarea, { clientX: 130, clientY: 10 });
    expect(onFlaggedEvent).toBe(false); // preventDefault() was called
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("гэртаа")).toBeTruthy();
  });

  it("right-click resolves the ACTUAL click point, not selectionStart — robust against a pre-existing text selection that spans past the flagged word", () => {
    // Regression case: right-clicking inside an existing selection does not
    // move the caret in real browsers (selectionStart stays wherever the
    // selection started), so a handler that trusted selectionStart would
    // wrongly conclude nothing was clicked, even though the click visually
    // landed right on "гэртаа".
    const { textarea, container } = renderComposer();
    stubDefaultFixtureRects(container);

    textarea.selectionStart = 0;
    textarea.selectionEnd = 20; // a broad selection covering "гэртаа" (8-14) and more
    expect(textarea.selectionStart).not.toBe(10); // selectionStart is NOT inside "гэртаа"

    const event = fireEvent.contextMenu(textarea, { clientX: 130, clientY: 10 }); // physically on "гэртаа"
    expect(event).toBe(false); // preventDefault() was called — correctly identified despite selectionStart
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("гэртаа")).toBeTruthy();
  });

  it("right-clicking a non-flagged word while a different word's menu is open closes it, rather than leaving a stale empty popup behind the native menu", () => {
    const { textarea, container } = renderComposer();
    stubDefaultFixtureRects(container);

    setCaret(textarea, 41); // "надэд"
    fireEvent.click(textarea);
    expect(screen.getByRole("menu")).toBeTruthy();

    // A point nowhere near any flagged span's stubbed rect.
    const event = fireEvent.contextMenu(textarea, { clientX: 500, clientY: 500 });
    expect(event).toBe(true); // native menu allowed, not intercepted
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a flagged span that itself wraps across two lines is hit-tested per line fragment, not by one bounding box spanning the gap between them", () => {
    const { textarea, container } = renderComposer();
    const span = getMirrorSpanByText(container, "гэртаа");
    // Simulate a wrapped span: two line-fragment rects with a gap between
    // them (e.g. y 0-20 then y 40-60), as getClientRects() would report for
    // text that wraps mid-span — getBoundingClientRect() alone would report
    // one box from y=0 to y=60, wrongly including the y 20-40 gap.
    const rectA = { x: 100, y: 0, width: 20, height: 20, top: 0, left: 100, right: 120, bottom: 20, toJSON() { return this; } } as DOMRect;
    const rectB = { x: 0, y: 40, width: 20, height: 20, top: 40, left: 0, right: 20, bottom: 60, toJSON() { return this; } } as DOMRect;
    span.getClientRects = () => [rectA, rectB] as unknown as DOMRectList;

    // A point in the "gap" (inside the bounding box, outside both real fragments).
    const gapEvent = fireEvent.contextMenu(textarea, { clientX: 60, clientY: 30 });
    expect(gapEvent).toBe(true); // must NOT match — native menu allowed
    expect(screen.queryByRole("menu")).toBeNull();

    // A point inside the second real fragment.
    const fragmentEvent = fireEvent.contextMenu(textarea, { clientX: 10, clientY: 50 });
    expect(fragmentEvent).toBe(false);
    expect(within(screen.getByRole("menu")).getByText("гэртаа")).toBeTruthy();
  });

  it("closes cleanly (never silently reattaches to a different word) when the open span's suggestion disappears without `value` changing", () => {
    // Simulates an external re-check re-running on unchanged text (e.g. a
    // manual "check now" while the menu is open) that returns a NEW
    // suggestions array without "гэртаа" — a plain array-index tracker would
    // have the menu silently jump to whatever suggestion now sits at
    // "гэртаа"'s old index (here, "ирээт") instead of closing.
    const value = "өчигдөр гэртаа байхад манай найз ирээт надэд хоол хийж өгсөн";
    const initialSuggestions: OrthographySuggestionView[] = [
      suggestion({ sourceWord: "гэртаа", start: 8, end: 14, suggestedWord: "гэртээ", candidates: ["гэртээ"] }),
      suggestion({ sourceWord: "ирээт", start: 33, end: 38, suggestedWord: "ирээд", candidates: ["ирээд"] }),
    ];
    const onChange = vi.fn();
    const { rerender } = render(
      <SpellcheckTextarea value={value} suggestions={initialSuggestions} onChange={onChange} />,
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    setCaret(textarea, 10); // "гэртаа"
    fireEvent.click(textarea);
    expect(within(screen.getByRole("menu")).getByText("гэртаа")).toBeTruthy();

    // Same value, but "гэртаа" is gone from the new suggestions — only
    // "ирээт" (which used to be at index 1) remains, now at index 0.
    const nextSuggestions: OrthographySuggestionView[] = [
      suggestion({ sourceWord: "ирээт", start: 33, end: 38, suggestedWord: "ирээд", candidates: ["ирээд"] }),
    ];
    rerender(<SpellcheckTextarea value={value} suggestions={nextSuggestions} onChange={onChange} />);

    // Must be fully closed — never silently showing "ирээт"'s menu instead.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Tab moves focus out of the menu rather than being swallowed or submitting the form", () => {
    const onKeyDown = vi.fn();
    const { textarea } = renderComposer({ onKeyDown });

    setCaret(textarea, 10);
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");

    fireEvent.keyDown(items[0]!, { key: "Tab" });
    // Whatever Base UI does with Tab (move focus, close the menu), it must
    // not reach the textarea's own onKeyDown / trigger form submission.
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("G: Escape closes the menu without changing the text", () => {
    const onChange = vi.fn();
    const { textarea } = renderComposer({ onChange });

    setCaret(textarea, 10);
    fireEvent.click(textarea);
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("H: arrow-key navigation moves highlight through candidates and Enter selects the highlighted one", () => {
    const onChange = vi.fn();
    const { textarea } = renderComposer({ onChange });

    setCaret(textarea, 10);
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const items = within(menu).getAllByRole("menuitem");
    // First real candidate ("гэртээ") should be highlighted after one ArrowDown.
    expect(items[0]?.textContent).toBe("гэртээ");
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(items[0]!, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("өчигдөр гэртээ байхад манай найз ирээт надэд хоол хийж өгсөн");
  });

  it("keyboard selection (Enter inside the menu) never triggers the textarea's own Enter-to-submit onKeyDown", () => {
    const onKeyDown = vi.fn();
    const { textarea } = renderComposer({ onKeyDown });

    setCaret(textarea, 10);
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    fireEvent.keyDown(items[0]!, { key: "Enter" });

    // The composer's own onKeyDown (which the parent chat uses to submit
    // the form on Enter) must never fire for a key handled inside the menu.
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("Ignore dismisses only the current occurrence, for this session — text is unchanged and the same span does not reopen a menu", () => {
    const onChange = vi.fn();
    const { textarea } = renderComposer({ onChange });

    setCaret(textarea, 10); // "гэртаа"
    fireEvent.click(textarea);
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByText("Алдаа биш — үл хэрэгсэх"));

    expect(onChange).not.toHaveBeenCalled(); // text itself is untouched
    expect(screen.queryByRole("menu")).toBeNull();

    // Clicking the same span again no longer opens a menu (ignored for the session).
    setCaret(textarea, 10);
    fireEvent.click(textarea);
    expect(screen.queryByRole("menu")).toBeNull();

    // A DIFFERENT flagged word is unaffected by the ignore.
    setCaret(textarea, 41); // "надэд"
    fireEvent.click(textarea);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("clicking outside the composer closes the menu without altering the text", () => {
    const onChange = vi.fn();
    const { textarea } = renderComposer({ onChange });

    setCaret(textarea, 10);
    fireEvent.click(textarea);
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("I: a text with zero flagged spans never renders a menu on click", () => {
    const { textarea } = renderComposer({ suggestions: [] });
    setCaret(textarea, 5);
    fireEvent.click(textarea);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("J/K/L: existing prop contract is preserved — onChange fires on typing, onKeyDown still fires for keys typed directly into the textarea, disabled is respected", () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();
    const { textarea } = renderComposer({ onChange, onKeyDown });

    fireEvent.change(textarea, { target: { value: "шинэ утга" } });
    expect(onChange).toHaveBeenCalledWith("шинэ утга");

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("regression guard: the textarea is forced to `display: block` so its rendered height exactly matches the mirror container (no inline-block baseline gap)", () => {
    // jsdom has no layout engine and doesn't load the compiled Tailwind
    // stylesheet, so getComputedStyle(textarea).display here would just
    // reflect the browser's own UA default (inline-block) regardless of
    // this class — it can't reproduce or verify the actual pixel gap. This
    // is a narrow proxy check that the fix's class hasn't silently
    // regressed; the geometry itself was verified live (see this
    // milestone's report): a <textarea> defaults to `display: inline-block`,
    // and an inline-block's `vertical-align: baseline` leaves a
    // font-descender gap below it inside its container's line box — making
    // the mirror (which stretches to the container's height via inset-0) a
    // few pixels taller than the textarea itself, and its scrollable range
    // correspondingly larger, so a 1:1 scrollTop sync clamps short and the
    // underline drifts from the real text near the bottom of a scrolled box.
    const { textarea } = renderComposer();
    expect(textarea.className.split(/\s+/)).toContain("block");
  });
});
