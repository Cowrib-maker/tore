// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SpellcheckTextarea } from "@/components/orthography/spellcheck-textarea";

/**
 * Sprint 14 launch-critical UX — long composer scroll control.
 *
 * jsdom has no real layout engine, so scrollHeight/clientHeight/scrollTop
 * are all read-only zeros unless a test defines them itself. Every test
 * here stubs those three properties on the rendered <textarea> directly
 * (the standard jsdom technique for scroll-behavior tests) rather than
 * relying on real layout, matching the existing spellcheck test file's
 * documented approach for this same constraint.
 */

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
});

afterEach(() => {
  cleanup();
});

function stubScrollMetrics(
  el: HTMLTextAreaElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, "scrollHeight", { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: metrics.clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", {
    value: metrics.scrollTop,
    configurable: true,
    writable: true,
  });
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

describe("SpellcheckTextarea — composer scroll-to-bottom control", () => {
  it("does not render the control when content fits (no overflow)", () => {
    render(
      <SpellcheckTextarea value="short text" suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();
    stubScrollMetrics(textarea, { scrollHeight: 60, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);

    expect(screen.queryByRole("button", { name: /гүйлгэх/i })).toBeNull();
  });

  it("renders the control once content overflows and the user has scrolled away from the bottom", () => {
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();
    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);

    expect(screen.queryByRole("button", { name: /гүйлгэх/i })).not.toBeNull();
  });

  it("hides the control again once scrolled back near the bottom", () => {
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();

    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);
    expect(screen.queryByRole("button", { name: /гүйлгэх/i })).not.toBeNull();

    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 299 });
    fireEvent.scroll(textarea);
    expect(screen.queryByRole("button", { name: /гүйлгэх/i })).toBeNull();
  });

  it("clicking the control scrolls the textarea to its end", () => {
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();
    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);

    const scrollToSpy = vi.fn();
    textarea.scrollTo = scrollToSpy;

    fireEvent.click(screen.getByRole("button", { name: /гүйлгэх/i }));

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 400, behavior: "smooth" }),
    );
  });

  it("never moves the cursor or steals focus when the control is clicked", () => {
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();
    textarea.scrollTo = vi.fn();
    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);

    textarea.focus();
    textarea.setSelectionRange(3, 7);
    expect(document.activeElement).toBe(textarea);

    const button = screen.getByRole("button", { name: /гүйлгэх/i });
    // A real click fires mousedown before click — the component must
    // preventDefault on mousedown so focus never leaves the textarea.
    fireEvent.mouseDown(button);
    fireEvent.click(button);

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(7);
  });

  it("keeps the control keyboard-focusable with an accessible label", () => {
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={() => {}} />,
    );
    const textarea = getTextarea();
    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);

    const button = screen.getByRole("button", { name: /гүйлгэх/i });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")?.length).toBeGreaterThan(0);
    expect(button.hasAttribute("title")).toBe(true);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("preserves normal typing (onChange still fires) while the control is visible", () => {
    const handleChange = vi.fn();
    render(
      <SpellcheckTextarea value={"line\n".repeat(30)} suggestions={[]} onChange={handleChange} />,
    );
    const textarea = getTextarea();
    stubScrollMetrics(textarea, { scrollHeight: 400, clientHeight: 100, scrollTop: 0 });
    fireEvent.scroll(textarea);
    expect(screen.queryByRole("button", { name: /гүйлгэх/i })).not.toBeNull();

    fireEvent.change(textarea, { target: { value: "line\n".repeat(30) + "more" } });
    expect(handleChange).toHaveBeenCalledWith("line\n".repeat(30) + "more");
  });
});
