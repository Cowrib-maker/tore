// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LegalAiChat } from "@/components/legal-ai/legal-ai-chat";
import { readUploadJson, readUploadResponse } from "@/lib/read-upload-response";

/**
 * Text + attachment must be ONE turn: Send waits for an in-flight upload,
 * never submits text-only past a failed attachment, and a non-JSON upload
 * response (e.g. a platform 413) never surfaces a JSON parse error.
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

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

function docxFile(name = "contract.docx") {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, {
    type: DOCX_MIME,
  });
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  fireEvent.change(input, { target: { files: [file] } });
}

function typeMessage(text: string) {
  const textarea = screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө/);
  fireEvent.change(textarea, { target: { value: text } });
}

function clickSend() {
  fireEvent.click(screen.getByRole("button", { name: /Илгээх|Хавсралтыг хүлээж/ }));
}

function uploadOk(id = "doc-1") {
  return new Response(
    JSON.stringify({
      id,
      conversationId: "conv-1",
      fileName: "contract.docx",
      mimeType: DOCX_MIME,
      sizeBytes: 4,
      extractStatus: "OK",
      pageCount: null,
    }),
    { status: 201 },
  );
}

function stubFetch(handlers: {
  upload: () => Promise<Response> | Response;
  chat?: () => Promise<Response> | Response;
}) {
  const chatCalls: { body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/ai/documents")) return handlers.upload();
    if (url.includes("/api/ai/chat")) {
      chatCalls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
      return handlers.chat
        ? handlers.chat()
        : new Response(JSON.stringify({ error: "stub" }), { status: 500 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { chatCalls };
}

describe("LegalAiChat — text + attachment as one turn", () => {
  it("Send waits for the in-flight upload, then submits ONE turn on the attachment's conversation", async () => {
    let resolveUpload!: (response: Response) => void;
    const uploadPromise = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const { chatCalls } = stubFetch({ upload: () => uploadPromise });

    const { container } = renderChat();
    typeMessage("Энэ гэрээг шалгаж өгнө үү");
    await act(async () => {
      selectFile(container, docxFile());
    });
    await waitFor(() => {
      expect(screen.getByText("TORE боловсруулж байна…")).not.toBeNull();
    });

    // Send while the upload is still processing: nothing may be submitted yet.
    await act(async () => {
      clickSend();
    });
    expect(chatCalls).toHaveLength(0);

    // Second click while waiting must not double-send either.
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    expect(chatCalls).toHaveLength(0);

    await act(async () => {
      resolveUpload(uploadOk());
    });

    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(chatCalls[0].body.message).toBe("Энэ гэрээг шалгаж өгнө үү");
    expect(chatCalls[0].body.conversationId).toBe("conv-1");
  });

  it("a failed attachment prevents a text-only send and keeps the card retryable", async () => {
    const { chatCalls } = stubFetch({
      upload: () =>
        new Response(JSON.stringify({ error: "Файлыг уншиж чадсангүй." }), {
          status: 500,
        }),
    });

    const { container } = renderChat();
    typeMessage("Энэ гэрээг шалгаж өгнө үү");
    await act(async () => {
      selectFile(container, docxFile());
    });
    await waitFor(() => {
      expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull();
    });

    await act(async () => {
      clickSend();
    });

    expect(chatCalls).toHaveLength(0);
    expect(screen.getByText(/Хавсралт бэлэн болоогүй байна/)).not.toBeNull();
    expect(
      (screen.getByPlaceholderText(/Асуудлаа өөрийнхөөрөө/) as HTMLTextAreaElement)
        .value,
    ).toBe("Энэ гэрээг шалгаж өгнө үү");
    expect(screen.getByRole("button", { name: /дахин/i })).not.toBeNull();
  });

  it("a non-JSON upload response shows a useful message, never a JSON parse error", async () => {
    stubFetch({
      upload: () => new Response("Request Entity Too Large", { status: 413 }),
    });

    const { container } = renderChat();
    await act(async () => {
      selectFile(container, docxFile());
    });

    await waitFor(() => {
      expect(screen.getByText(/HTTP 413/)).not.toBeNull();
    });
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
    expect(screen.queryByText(/Request En/)).toBeNull();
  });

  it("a successful DOCX attachment becomes a ready card and the following Send includes it", async () => {
    const { chatCalls } = stubFetch({ upload: () => uploadOk() });

    const { container } = renderChat();
    await act(async () => {
      selectFile(container, docxFile());
    });
    await waitFor(() => {
      expect(screen.queryByText("TORE боловсруулж байна…")).toBeNull();
    });
    expect(screen.getByText("contract.docx")).not.toBeNull();

    typeMessage("Дүгнэлт гарга");
    await act(async () => {
      clickSend();
    });

    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(chatCalls[0].body.conversationId).toBe("conv-1");
  });
});

function pdfFile(name = "contract.pdf") {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], name, {
    type: "application/pdf",
  });
}

function selectFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  fireEvent.change(input, { target: { files } });
}

/** Upload stub that records each request and answers per file name. */
function stubUploads(
  answer: (fileName: string, attempt: number) => Response | Promise<Response>,
) {
  const uploads: { fileName: string; conversationId: string | null }[] = [];
  const chatCalls: { body: Record<string, unknown> }[] = [];
  const attempts = new Map<string, number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/ai/documents")) {
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        const conversationId = form.get("conversationId");
        uploads.push({
          fileName: file.name,
          conversationId: typeof conversationId === "string" ? conversationId : null,
        });
        const attempt = (attempts.get(file.name) ?? 0) + 1;
        attempts.set(file.name, attempt);
        return answer(file.name, attempt);
      }
      if (url.includes("/api/ai/chat")) {
        chatCalls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
        return new Response(JSON.stringify({ error: "stub" }), { status: 500 });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return { uploads, chatCalls };
}

function okFor(fileName: string, mimeType = DOCX_MIME) {
  return new Response(
    JSON.stringify({
      id: `doc-${fileName}`,
      conversationId: "conv-1",
      fileName,
      mimeType,
      sizeBytes: 6,
      extractStatus: "OK",
      pageCount: null,
    }),
    { status: 201 },
  );
}

describe("LegalAiChat — text-only, PDF, and multiple attachments", () => {
  it("text-only send submits one turn with no conversation and no upload", async () => {
    const { uploads, chatCalls } = stubUploads(() => okFor("x"));
    renderChat();
    typeMessage("Хөдөлмөрийн гэрээ цуцлах нөхцөл юу вэ?");
    await act(async () => {
      clickSend();
    });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(uploads).toHaveLength(0);
    expect(chatCalls[0].body.conversationId).toBeUndefined();
  });

  it("one PDF + text: the turn runs on the conversation the PDF created", async () => {
    const { uploads, chatCalls } = stubUploads((name) => okFor(name, "application/pdf"));
    const { container } = renderChat();
    await act(async () => {
      selectFile(container, pdfFile());
    });
    await waitFor(() => expect(screen.queryByText("TORE боловсруулж байна…")).toBeNull());
    typeMessage("Дүгнэлт гарга");
    await act(async () => {
      clickSend();
    });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(uploads).toEqual([{ fileName: "contract.pdf", conversationId: null }]);
    expect(chatCalls[0].body.conversationId).toBe("conv-1");
  });

  it.each([2, 3])(
    "%i files + text: uploads run serially on ONE conversation, then ONE turn is sent",
    async (count) => {
      const names = Array.from({ length: count }, (_, i) => `doc-${i + 1}.docx`);
      const releases: Array<() => void> = [];
      const { uploads, chatCalls } = stubUploads(
        (name) =>
          new Promise<Response>((resolve) => {
            releases.push(() => resolve(okFor(name)));
          }),
      );
      const { container } = renderChat();
      typeMessage("Бүх баримтыг нэгтгэн дүгнэ");
      await act(async () => {
        selectFiles(container, names.map((n) => docxFile(n)));
      });

      // Only the first upload is in flight; the rest wait so they can join
      // the conversation the first one creates.
      await waitFor(() => expect(uploads).toHaveLength(1));
      await act(async () => {
        clickSend();
      });
      expect(chatCalls).toHaveLength(0);

      for (let i = 0; i < count; i += 1) {
        await waitFor(() => expect(releases).toHaveLength(i + 1));
        await act(async () => {
          releases[i]();
        });
      }

      await waitFor(() => expect(chatCalls).toHaveLength(1));
      expect(uploads.map((u) => u.fileName)).toEqual(names);
      expect(uploads[0].conversationId).toBeNull();
      for (const upload of uploads.slice(1)) {
        expect(upload.conversationId).toBe("conv-1");
      }
      expect(chatCalls[0].body.conversationId).toBe("conv-1");
      for (const name of names) {
        expect(screen.getByText(name)).not.toBeNull();
      }
    },
  );

  it("one failed file blocks the send; removing it lets the rest go through", async () => {
    const { chatCalls } = stubUploads((name) =>
      name === "bad.docx"
        ? new Response(JSON.stringify({ error: "Файлыг уншиж чадсангүй." }), { status: 500 })
        : okFor(name),
    );
    const { container } = renderChat();
    typeMessage("Шалгаж өгнө үү");
    await act(async () => {
      selectFiles(container, [docxFile("good.docx"), docxFile("bad.docx")]);
    });
    await waitFor(() => expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull());

    await act(async () => {
      clickSend();
    });
    expect(chatCalls).toHaveLength(0);
    expect(screen.getByText(/Хавсралт бэлэн болоогүй байна/)).not.toBeNull();

    // The failed card is the one that also offers a retry action.
    const retryButton = screen.getByRole("button", { name: /дахин/i });
    const failedCard = retryButton.closest("div[class]")!.parentElement as HTMLElement;
    const removeButtons = Array.from(failedCard.querySelectorAll("button")).filter(
      (button) => button !== retryButton,
    );
    await act(async () => {
      fireEvent.click(removeButtons[removeButtons.length - 1]);
    });
    expect(screen.queryByText("Файлыг уншиж чадсангүй.")).toBeNull();

    await act(async () => {
      clickSend();
    });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
  });

  it("retry after a failed upload re-uploads that file and unblocks the send", async () => {
    const { uploads, chatCalls } = stubUploads((name, attempt) =>
      attempt === 1
        ? new Response(JSON.stringify({ error: "Файлыг уншиж чадсангүй." }), { status: 500 })
        : okFor(name),
    );
    const { container } = renderChat();
    typeMessage("Шалгаж өгнө үү");
    await act(async () => {
      selectFile(container, docxFile());
    });
    await waitFor(() => expect(screen.getByText("Файлыг уншиж чадсангүй.")).not.toBeNull());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /дахин/i }));
    });
    await waitFor(() => expect(screen.queryByText("Файлыг уншиж чадсангүй.")).toBeNull());
    expect(uploads).toHaveLength(2);

    await act(async () => {
      clickSend();
    });
    await waitFor(() => expect(chatCalls).toHaveLength(1));
    expect(chatCalls[0].body.conversationId).toBe("conv-1");
  });
});

describe("readUploadResponse", () => {
  it("parses JSON bodies and keeps the status", async () => {
    const result = await readUploadResponse<{ error?: string }>(
      new Response(JSON.stringify({ error: "Файл том байна" }), { status: 422 }),
    );
    expect(result.status).toBe(422);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe("Файл том байна");
  });

  it("maps a non-JSON 413 to a safe message without throwing", async () => {
    const result = await readUploadResponse(
      new Response("Request Entity Too Large", { status: 413 }),
    );
    expect(result.status).toBe(413);
    expect(result.data).toBeNull();
    expect(result.errorMessage).toMatch(/413/);
    expect(result.errorMessage).not.toMatch(/Unexpected token|Request En/);
  });

  it("maps any other non-JSON failure to the generic upload error", async () => {
    const result = await readUploadResponse(
      new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    expect(result.status).toBe(502);
    expect(result.errorMessage).toBe("Баримт хавсаргахад алдаа гарлаа.");
  });
});

describe("readUploadJson (shared by workbench / workspace upload surfaces)", () => {
  it("returns an error object for non-JSON bodies instead of throwing", async () => {
    const data = await readUploadJson<{ error?: string }>(new Response("Request Entity Too Large", { status: 413 }));
    expect(data.error).toMatch(/413/);
  });

  it("returns the parsed body for JSON responses", async () => {
    const data = await readUploadJson<{ error?: string; id?: string }>(new Response(JSON.stringify({ id: "doc-1" }), { status: 201 }));
    expect(data.id).toBe("doc-1");
  });
});
