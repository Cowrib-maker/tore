// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LawyerAiWorkbench } from "@/components/legal-ai/lawyer-ai-workbench";

/**
 * Lawyer /legal-ai workbench: same attachment lifecycle as the citizen chat.
 * Send waits for uploads, never goes out text-only past a failed attachment,
 * uploads run serially on ONE conversation, and non-JSON failures are readable.
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

const docx = (name: string) => new File([new Uint8Array([0x50, 0x4b, 3, 4])], name, { type: DOCX });
const pdf = (name: string) =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, { type: "application/pdf" });

function okFor(name: string, mime = DOCX) {
  return new Response(
    JSON.stringify({ id: `doc-${name}`, conversationId: "conv-1", fileName: name, mimeType: mime, sizeBytes: 5, extractStatus: "OK", pageCount: null }),
    { status: 201 },
  );
}

function stub(answer: (name: string, attempt: number) => Response | Promise<Response>) {
  const uploads: { name: string; conversationId: string | null }[] = [];
  const chats: Record<string, unknown>[] = [];
  const attempts = new Map<string, number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/lawyer/ai/documents")) {
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        const conv = form.get("conversationId");
        uploads.push({ name: file.name, conversationId: typeof conv === "string" ? conv : null });
        const attempt = (attempts.get(file.name) ?? 0) + 1;
        attempts.set(file.name, attempt);
        return answer(file.name, attempt);
      }
      if (url.includes("/api/ai/chat")) {
        chats.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ error: "stub" }), { status: 500 });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return { uploads, chats };
}

const renderWb = () => render(<LawyerAiWorkbench caseContext={null} history={[]} />);
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const select = (c: HTMLElement, files: File[]) => fireEvent.change(fileInput(c), { target: { files } });
const type = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText("Юу дээр ажиллах вэ?"), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole("button", { name: /Илгээх/ }));

describe("LawyerAiWorkbench — attachment lifecycle", () => {
  it("Send waits for the pending upload, then sends ONE turn on its conversation (double submit ignored)", async () => {
    let release!: (r: Response) => void;
    const { uploads, chats } = stub(() => new Promise<Response>((r) => (release = r)));
    const { container } = renderWb();
    type("Гэрээг шинжил");
    await act(async () => select(container, [docx("a.docx")]));
    await waitFor(() => expect(uploads).toHaveLength(1));

    await act(async () => send());
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    expect(chats).toHaveLength(0);

    await act(async () => release(okFor("a.docx")));
    await waitFor(() => expect(chats).toHaveLength(1));
    expect(chats[0].message).toBe("Гэрээг шинжил");
    expect(chats[0].conversationId).toBe("conv-1");
  });

  it("a failed attachment blocks the text-only send, keeps text, and shows a retry/remove chip", async () => {
    const { chats } = stub(() => new Response(JSON.stringify({ error: "Файлыг уншиж чадсангүй." }), { status: 500 }));
    const { container } = renderWb();
    type("Шинжил");
    await act(async () => select(container, [docx("bad.docx")]));
    await waitFor(() => expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull());

    await act(async () => send());
    expect(chats).toHaveLength(0);
    expect(screen.getByText(/Хавсралт бэлэн болоогүй байна/)).not.toBeNull();
    expect((screen.getByPlaceholderText("Юу дээр ажиллах вэ?") as HTMLTextAreaElement).value).toBe("Шинжил");
    expect(screen.getByRole("button", { name: /bad\.docx дахин оролдох/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /bad\.docx хасах/ })).not.toBeNull();
  });

  it("a non-JSON 413 is readable; retry re-uploads the file and unblocks Send", async () => {
    const s = stub((name, attempt) =>
      attempt === 1 ? new Response("Request Entity Too Large", { status: 413 }) : okFor(name),
    );
    const { container } = renderWb();
    type("Шинжил");
    await act(async () => select(container, [docx("a.docx")]));
    await waitFor(() => expect(screen.getByText(/HTTP 413/)).not.toBeNull());
    expect(screen.queryByText(/Unexpected token|Request En/)).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /a\.docx дахин оролдох/ })));
    await waitFor(() => expect(screen.queryByText(/HTTP 413/)).toBeNull());
    expect(s.uploads).toHaveLength(2);
    await act(async () => send());
    await waitFor(() => expect(s.chats).toHaveLength(1));
  });

  it("removing a failed attachment lets a text-only send through", async () => {
    const { chats } = stub(() => new Response("Bad Gateway", { status: 502 }));
    const { container } = renderWb();
    type("Асуулт");
    await act(async () => select(container, [docx("x.docx")]));
    await waitFor(() => expect(screen.getByRole("button", { name: /x\.docx хасах/ })).not.toBeNull());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /x\.docx хасах/ })));
    await act(async () => send());
    await waitFor(() => expect(chats).toHaveLength(1));
  });

  it("one PDF + text: one turn on the PDF's conversation", async () => {
    const { uploads, chats } = stub((n) => okFor(n, "application/pdf"));
    const { container } = renderWb();
    await act(async () => select(container, [pdf("c.pdf")]));
    await waitFor(() => expect(screen.getByText("c.pdf")).not.toBeNull());
    type("Хураангуйл");
    await act(async () => send());
    await waitFor(() => expect(chats).toHaveLength(1));
    expect(uploads).toEqual([{ name: "c.pdf", conversationId: null }]);
    expect(chats[0].conversationId).toBe("conv-1");
  });

  it("multiple files upload one at a time into ONE conversation, then ONE turn", async () => {
    const releases: Array<() => void> = [];
    const { uploads, chats } = stub((name) => new Promise<Response>((r) => releases.push(() => r(okFor(name)))));
    const { container } = renderWb();
    type("Бүгдийг нэгтгэ");
    await act(async () => select(container, [docx("1.docx"), docx("2.docx"), docx("3.docx")]));
    await waitFor(() => expect(uploads).toHaveLength(1));
    await act(async () => send());
    expect(chats).toHaveLength(0);
    for (let i = 0; i < 3; i += 1) {
      await waitFor(() => expect(releases).toHaveLength(i + 1));
      await act(async () => releases[i]());
    }
    await waitFor(() => expect(chats).toHaveLength(1));
    expect(uploads.map((u) => u.conversationId)).toEqual([null, "conv-1", "conv-1"]);
    expect(chats[0].conversationId).toBe("conv-1");
  });

  it("a send right after the upload carries the NEW conversation, never a stale/undefined one", async () => {
    const { chats } = stub((n) => okFor(n));
    const { container } = renderWb();
    type("Асуулт");
    await act(async () => select(container, [docx("n.docx")]));
    await act(async () => send());
    await waitFor(() => expect(chats).toHaveLength(1));
    expect(chats[0].conversationId).toBe("conv-1");
  });
});
