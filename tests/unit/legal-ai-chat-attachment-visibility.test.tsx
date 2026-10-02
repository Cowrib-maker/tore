// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";

/**
 * On a narrow screen the attachment strip scrolls horizontally, so a failed
 * attachment must lead the strip instead of sitting after the ready ones.
 */

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver ??= ResizeObserverStub;
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

it("the failed attachment card comes first in the strip, ahead of ready ones", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/ai/documents")) {
        const file = (init?.body as FormData).get("file") as File;
        if (file.name === "bad.docx") {
          return new Response(JSON.stringify({ error: "Файлыг уншиж чадсангүй." }), { status: 500 });
        }
        return new Response(
          JSON.stringify({ id: `d-${file.name}`, conversationId: "c1", fileName: file.name, mimeType: DOCX, sizeBytes: 4, extractStatus: "OK", pageCount: null }),
          { status: 201 },
        );
      }
      return new Response(null, { status: 404 });
    }),
  );

  const { container } = render(
    <LegalAiChat documentUploadEnabled dashboardHref={null} signInLabel="a" getStartedLabel="b" dashboardLabel="c" />,
  );
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const mk = (n: string) => new File([new Uint8Array([0x50, 0x4b])], n, { type: DOCX });
  await act(async () => {
    fireEvent.change(input, { target: { files: [mk("one.docx"), mk("two.docx"), mk("bad.docx")] } });
  });
  await waitFor(() => expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull());

  const strip = container.querySelector('[aria-label="Хавсаргасан баримт"]') as HTMLElement;
  const order = Array.from(strip.children).map((card) => card.textContent ?? "");
  expect(order[0]).toContain("bad.docx");
  expect(order[0]).toContain("Файлыг уншиж чадсангүй.");
  expect(order.slice(1).join("|")).toContain("one.docx");
  expect(order.slice(1).join("|")).toContain("two.docx");
});
