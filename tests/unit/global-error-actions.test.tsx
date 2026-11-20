// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const goToSiteRoot = vi.fn();
vi.mock("@/components/errors/go-to-site-root", () => ({ goToSiteRoot: () => goToSiteRoot() }));

import GlobalError from "@/app/global-error";

/**
 * Behaviour of app/global-error.tsx's buttons when it is mounted as a real document root (it replaces the root layout).
 * Kept in its own file: React attaches document-level event listeners once per document, and other test files in this
 * environment mount their own roots first, which would leave a root created on `document` without click handling.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const makeError = (digest?: string) => Object.assign(new Error("SECRET internal detail"), digest ? { digest } : {});

afterEach(() => goToSiteRoot.mockClear());

describe("app/global-error.tsx buttons", () => {
  it("retry calls retry() (not reset) and home does a full page load of the site root", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const root = createRoot(document);
    await act(async () => root.render(<GlobalError error={makeError("d")} retry={retry} reset={reset} />));
    const buttons = [...document.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(document.documentElement.lang).toBe("mn");
    expect(document.body.textContent).not.toContain("SECRET");

    await act(async () => buttons[0]!.click());
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();

    await act(async () => buttons[1]!.click());
    expect(goToSiteRoot).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1); // home does not retry
    await act(async () => root.unmount());
  });

  it("falls back to reset() when retry is not provided", async () => {
    const reset = vi.fn();
    const root = createRoot(document);
    await act(async () => root.render(<GlobalError error={makeError("d")} reset={reset} />));
    await act(async () => document.querySelectorAll("button")[0]!.click());
    expect(reset).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it("does not throw when neither retry nor reset is provided", async () => {
    const root = createRoot(document);
    await act(async () => root.render(<GlobalError error={makeError()} />));
    await expect(act(async () => document.querySelectorAll("button")[0]!.click())).resolves.not.toThrow();
    await act(async () => root.unmount());
  });
});
