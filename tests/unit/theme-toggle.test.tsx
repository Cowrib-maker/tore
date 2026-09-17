// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";

import { ThemeToggle } from "@/components/theme/theme-toggle";

beforeAll(() => {
  // jsdom does not implement matchMedia; next-themes needs it for
  // enableSystem's prefers-color-scheme listener.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

/**
 * Sprint 14 launch-critical UX — theme selection + persistence.
 *
 * next-themes owns persistence itself (localStorage under the "theme" key
 * by default, matching ThemeProvider's config in theme-provider.tsx — no
 * app-specific storage code to test separately). These tests exercise the
 * real ThemeProvider, not a mock, so a pass here means the actual
 * System/Light/Dark selection + persistence wiring works end to end at the
 * component level.
 */

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  cleanup();
});

describe("ThemeToggle", () => {
  it("opens and lists System, Light, and Dark options", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Систем/ })).not.toBeNull();
    });
    expect(screen.getByRole("option", { name: /Цайвар/ })).not.toBeNull();
    expect(screen.getByRole("option", { name: /Бараан/ })).not.toBeNull();
  });

  it("selecting Dark persists to localStorage and applies the .dark class", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    fireEvent.click(await screen.findByRole("option", { name: /Бараан/ }));

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("dark");
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("selecting Light persists to localStorage and removes the .dark class", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    fireEvent.click(await screen.findByRole("option", { name: /Цайвар/ }));

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("light");
    });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  it("selecting System persists 'system' rather than a resolved value", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    fireEvent.click(await screen.findByRole("option", { name: /Систем/ }));

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("system");
    });
  });

  it("persists across a fresh mount (survives a reload)", async () => {
    const first = renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    fireEvent.click(await screen.findByRole("option", { name: /Бараан/ }));
    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("dark");
    });
    first.unmount();

    renderToggle();
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("closes on Escape without changing the selection", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeNull();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("closes when clicking outside", async () => {
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeNull();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("the trigger has accessible attributes and is keyboard-focusable", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: "Харагдац" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.hasAttribute("title")).toBe(true);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  it("marks the currently-selected option with aria-selected", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    fireEvent.click(screen.getByRole("button", { name: "Харагдац" }));

    const darkOption = await screen.findByRole("option", { name: /Бараан/ });
    await waitFor(() => {
      expect(darkOption.getAttribute("aria-selected")).toBe("true");
    });
    const lightOption = screen.getByRole("option", { name: /Цайвар/ });
    expect(lightOption.getAttribute("aria-selected")).toBe("false");
  });
});
