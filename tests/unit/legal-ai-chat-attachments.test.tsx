// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";

/**
 * Composer attachment card redesign — covers the uploading/ready/error
 * states of the document attachment card (replacing the old tiny raw
 * filename chip), including remove-during-upload (real abort, not just a
 * hidden card) and retry-after-error.
 */

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

function renderChat() {
  return render(
    <LegalAiChat
      documentUploadEnabled
      dashboardHref={null}
      signInLabel="Нэвтрэх"
      getStartedLabel="Эхлэх"
      dashboardLabel="Хяналтын самбар"
    />,
  );
}

function pdfFile(name = "contract.pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], name, {
    type: "application/pdf",
  });
}

function getFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

function selectFile(container: HTMLElement, file: File) {
  const input = getFileInput(container);
  fireEvent.change(input, { target: { files: [file] } });
}

describe("LegalAiChat — document attachment card", () => {
  it("shows a processing state immediately, then a ready card with type and size", async () => {
    let resolveUpload!: (response: Response) => void;
    const uploadPromise = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/documents")) return uploadPromise;
        return new Response(null, { status: 404 });
      }),
    );

    const { container } = renderChat();
    await act(async () => {
      selectFile(container, pdfFile());
    });

    // Processing state appears before the server responds.
    await waitFor(() => {
      expect(screen.getByText("TORE боловсруулж байна…")).not.toBeNull();
    });
    expect(screen.getByText("contract.pdf")).not.toBeNull();

    await act(async () => {
      resolveUpload(
        new Response(
          JSON.stringify({
            id: "doc-1",
            conversationId: "conv-1",
            fileName: "contract.pdf",
            mimeType: "application/pdf",
            sizeBytes: 245_000,
            extractStatus: "OK",
            pageCount: 3,
          }),
          { status: 201 },
        ),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("TORE боловсруулж байна…")).toBeNull();
    });
    expect(screen.getByText("contract.pdf")).not.toBeNull();
    expect(screen.getByText(/PDF/)).not.toBeNull();
    expect(screen.getByText(/239 KB/)).not.toBeNull();
  });

  it("shows the error inline on the card with a working retry action", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/documents")) {
          attempt += 1;
          if (attempt === 1) {
            return new Response(
              JSON.stringify({ error: "Файлыг уншиж чадсангүй." }),
              { status: 500 },
            );
          }
          return new Response(
            JSON.stringify({
              id: "doc-1",
              conversationId: "conv-1",
              fileName: "contract.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1000,
              extractStatus: "OK",
              pageCount: 1,
            }),
            { status: 201 },
          );
        }
        return new Response(null, { status: 404 });
      }),
    );

    const { container } = renderChat();
    await act(async () => {
      selectFile(container, pdfFile());
    });

    await waitFor(() => {
      expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull();
    });

    const retryButton = screen.getByRole("button", {
      name: "contract.pdf дахин оролдох",
    });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => {
      expect(screen.queryByText("Файлыг уншиж чадсангүй.")).toBeNull();
    });
    expect(attempt).toBe(2);
    expect(screen.getByText("contract.pdf")).not.toBeNull();
  });

  it("removing an in-flight upload aborts the request instead of leaving a stuck card", async () => {
    let sawAbort = false;
    const neverResolves = new Promise<Response>(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        if (url.includes("/api/ai/documents")) {
          init?.signal?.addEventListener("abort", () => {
            sawAbort = true;
          });
          return neverResolves;
        }
        return new Response(null, { status: 404 });
      }),
    );

    const { container } = renderChat();
    await act(async () => {
      selectFile(container, pdfFile());
    });

    await waitFor(() => {
      expect(screen.getByText("TORE боловсруулж байна…")).not.toBeNull();
    });

    const removeButton = screen.getByRole("button", {
      name: "contract.pdf хасах",
    });
    await act(async () => {
      fireEvent.click(removeButton);
    });

    expect(sawAbort).toBe(true);
    await waitFor(() => {
      expect(screen.queryByText("contract.pdf")).toBeNull();
    });
  });

  it("rejects an unsupported file client-side and shows the error on its own card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/ai/entitlement")) return new Response(null, { status: 204 });
        return new Response(null, { status: 404 });
      }),
    );

    const { container } = renderChat();
    const badFile = new File([new Uint8Array([1, 2, 3])], "malware.exe", {
      type: "application/x-msdownload",
    });
    await act(async () => {
      selectFile(container, badFile);
    });

    await waitFor(() => {
      expect(screen.getByText("malware.exe")).not.toBeNull();
    });
    expect(
      screen.getByText(/Зөвхөн PDF, DOCX, XLSX, JPG, JPEG, PNG, WEBP, TXT, CSV/),
    ).not.toBeNull();
    // Never reached the network — rejected purely client-side.
    const fetchMock = vi.mocked(fetch);
    const documentCalls = fetchMock.mock.calls.filter(([input]) =>
      (typeof input === "string" ? input : input.toString()).includes(
        "/api/ai/documents",
      ),
    );
    expect(documentCalls).toHaveLength(0);
  });
});
