// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LawyerWorkspaceAiComposer } from "@/components/case-review/lawyer-workspace-ai-composer";
import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LawyerAiWorkbench — upload goes through the shared response reader", () => {
  it("a platform 413 with a plain-text body shows a readable error, not a JSON parse error", async () => {
    const uploadCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/lawyer/ai/documents")) {
          uploadCalls.push(url);
          return new Response("Request Entity Too Large", { status: 413 });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const { container } = render(<LawyerAiWorkbench caseContext={null} history={[]} />);
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("file input not found");
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "big.pdf", {
      type: "application/pdf",
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(screen.getByText(/HTTP 413/)).not.toBeNull());
    expect(uploadCalls).toHaveLength(1);
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
    expect(screen.queryByText(/Request En/)).toBeNull();
  });
});

describe("LawyerWorkspaceAiComposer — launcher, not a composer", () => {
  it("has a single link to /legal-ai and no textarea or file input of its own", () => {
    const { container } = render(<LawyerWorkspaceAiComposer />);

    const link = screen.getByRole("link", { name: /AI чат нээх/ });
    expect(link.getAttribute("href")).toBe("/legal-ai");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/Файл хавсаргах/)).toBeNull();
  });
});
