// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import AppError from "@/app/error";
import GlobalError from "@/app/global-error";
import { ERROR_COPY, errorCopyFor } from "@/components/errors/error-copy";

/**
 * The app had no error.tsx / global-error.tsx, so any uncaught server or render error showed the framework's default page
 * (no Mongolian text, no retry, no way to quote the error). These boundaries give a clear message, a working retry action,
 * a way home and a reference code (digest) — and never the raw error message.
 */
const SECRET = "SECRET internal detail: table users column password_hash";
const makeError = (digest?: string) => Object.assign(new Error(SECRET), digest ? { digest } : {});

afterEach(() => {
  cleanup();
  document.documentElement.lang = "";
  vi.unstubAllGlobals();
});

describe("errorCopyFor", () => {
  it("defaults to Mongolian and uses English for every other language", () => {
    expect(errorCopyFor(undefined)).toBe(ERROR_COPY.mn);
    expect(errorCopyFor("")).toBe(ERROR_COPY.mn);
    expect(errorCopyFor("mn")).toBe(ERROR_COPY.mn);
    expect(errorCopyFor("mn-MN")).toBe(ERROR_COPY.mn);
    expect(errorCopyFor("MN")).toBe(ERROR_COPY.mn);
    expect(errorCopyFor("en")).toBe(ERROR_COPY.en);
    expect(errorCopyFor("en-US")).toBe(ERROR_COPY.en);
    expect(errorCopyFor("ko")).toBe(ERROR_COPY.en);
    expect(errorCopyFor("zh-Hans")).toBe(ERROR_COPY.en);
  });
});

describe("app/error.tsx (segment error boundary)", () => {
  it("announces a Mongolian alert (title, body, reference code) and offers retry and home outside it", () => {
    render(<AppError error={makeError("1234567890")} retry={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(ERROR_COPY.mn.title);
    expect(alert.textContent).toContain(ERROR_COPY.mn.body);
    expect(alert.textContent).toContain(`${ERROR_COPY.mn.reference}: 1234567890`);
    expect(within(alert).queryByRole("button")).toBeNull(); // the live region announces the message, not the controls
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(ERROR_COPY.mn.title);
    expect(screen.getByRole("main")).toBeTruthy();
    expect((screen.getByRole("link", { name: ERROR_COPY.mn.home }) as HTMLAnchorElement).getAttribute("href")).toBe("/");
  });

  it("the retry button calls retry() exactly once per click", () => {
    const retry = vi.fn();
    render(<AppError error={makeError()} retry={retry} />);
    const button = screen.getByRole("button", { name: ERROR_COPY.mn.retry });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("falls back to reset() when retry is not provided, and never throws when neither is", () => {
    const reset = vi.fn();
    render(<AppError error={makeError()} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: ERROR_COPY.mn.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    cleanup();

    render(<AppError error={makeError()} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: ERROR_COPY.mn.retry }))).not.toThrow();
  });

  it("prefers retry() over reset() when both are provided", () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<AppError error={makeError()} retry={retry} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: ERROR_COPY.mn.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("never renders the raw error message (it may contain internals), with or without a digest", () => {
    render(<AppError error={makeError("abc")} retry={vi.fn()} />);
    expect(document.body.textContent).not.toContain("SECRET");
    expect(document.body.textContent).not.toContain("password_hash");
    cleanup();
    render(<AppError error={makeError()} retry={vi.fn()} />);
    expect(document.body.textContent).not.toContain("SECRET");
  });

  it("omits the reference line when there is no digest", () => {
    render(<AppError error={makeError()} retry={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).not.toContain(ERROR_COPY.mn.reference);
  });

  it("follows the document language: English for en and other non-Mongolian locales, Mongolian for mn", () => {
    for (const [lang, expected] of [["en", ERROR_COPY.en], ["ko", ERROR_COPY.en], ["mn", ERROR_COPY.mn]] as const) {
      document.documentElement.lang = lang;
      render(<AppError error={makeError("d1")} retry={vi.fn()} />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(expected.title);
      expect(screen.getByRole("button", { name: expected.retry })).toBeTruthy();
      expect(screen.getByRole("link", { name: expected.home })).toBeTruthy();
      cleanup();
    }
  });
});

describe("app/global-error.tsx (root layout failure)", () => {
  it("renders its own document with Mongolian first, English underneath, an alert, two buttons and the reference code", () => {
    const html = renderToStaticMarkup(<GlobalError error={makeError("global-digest")} retry={vi.fn()} />);
    expect(html).toContain('<html lang="mn">');
    expect(html).toContain("<body");
    expect(html).toContain(ERROR_COPY.mn.title);
    expect(html).toContain(ERROR_COPY.mn.body);
    expect(html).toContain(ERROR_COPY.en.body);
    expect(html).toContain("global-digest");
    expect(html).toContain('role="alert"');
    expect((html.match(/<button type="button"/g) ?? []).length).toBe(2); // retry + home
    expect(html).toContain(`${ERROR_COPY.mn.home} / ${ERROR_COPY.en.home}`);
  });

  it("never renders the raw error message", () => {
    const html = renderToStaticMarkup(<GlobalError error={makeError("x")} retry={vi.fn()} />);
    expect(html).not.toContain("SECRET");
    expect(html).not.toContain("password_hash");
  });

  it("has no dependency on the app stylesheet: it uses no utility class names", () => {
    const html = renderToStaticMarkup(<GlobalError error={makeError("x")} retry={vi.fn()} />);
    expect(html).not.toMatch(/class="/);
  });
});
