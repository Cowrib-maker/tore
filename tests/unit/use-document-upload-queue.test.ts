// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  useDocumentUploadQueue,
  type UploadOutcome,
} from "@/components/legal-ai/use-document-upload-queue";

afterEach(() => {
  cleanup();
});

function file(name: string): File {
  return new File(["x".repeat(16)], name, { type: "image/png" });
}

/** Flushes pending microtasks (the serial queue's internal `.then()` chain
 * runs on microtasks, not macrotasks) without assuming a fixed tick count. */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

/** Resolves performUpload only when the test calls the returned release().
 * Each call gets its own resolver (keyed by call index, not file name, so
 * two items for the same physical File don't collide). */
function deferredUploader() {
  const calls: Array<{ file: File; signal: AbortSignal }> = [];
  const resolvers: Array<(outcome: UploadOutcome) => void> = [];
  const aborted: boolean[] = [];

  const performUpload = vi.fn(
    (uploadedFile: File, signal: AbortSignal): Promise<UploadOutcome> => {
      const index = calls.length;
      calls.push({ file: uploadedFile, signal });
      aborted.push(false);
      return new Promise<UploadOutcome>((resolve, reject) => {
        resolvers[index] = resolve;
        signal.addEventListener("abort", () => {
          aborted[index] = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  );

  return {
    performUpload,
    calls,
    aborted,
    /** Waits (via microtask flushing) until performUpload has been called
     * for `name`, then releases that specific call with `outcome`. */
    async releaseByName(name: string, outcome: UploadOutcome): Promise<void> {
      for (let i = 0; i < 20; i += 1) {
        const index = calls.findIndex((c) => c.file.name === name);
        if (index !== -1 && resolvers[index]) {
          resolvers[index]!(outcome);
          return;
        }
        await Promise.resolve();
      }
      throw new Error(`performUpload was never called for ${name}`);
    },
    /** Waits until performUpload's (index+1)th call has happened, then
     * releases specifically that call — for cases with repeated file names. */
    async releaseByNameAt(index: number, outcome: UploadOutcome): Promise<void> {
      for (let i = 0; i < 20; i += 1) {
        if (calls.length > index && resolvers[index]) {
          resolvers[index]!(outcome);
          return;
        }
        await Promise.resolve();
      }
      throw new Error(`performUpload was never called for call index ${index}`);
    },
  };
}

describe("useDocumentUploadQueue — real serial-queue behavior", () => {
  it("uploads 1 file: item clears from the list once ready", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("a.png")]));
    expect(result.current.items.map((i) => i.file.name)).toEqual(["a.png"]);

    await act(async () => {
      await uploader.releaseByName("a.png", { status: "ready" });
      await result.current.settle();
    });
    expect(result.current.items).toEqual([]);
    expect(uploader.performUpload).toHaveBeenCalledTimes(1);
  });

  it("uploads 3 files strictly one at a time, in the order they were added", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("1.png"), file("2.png"), file("3.png")]));

    // Only the first upload has actually started — this IS the queue's
    // documented "strictly one at a time" contract, not a 3-concurrent pool.
    await act(async () => {
      await flushMicrotasks();
    });
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["1.png"]);

    await act(async () => {
      await uploader.releaseByName("1.png", { status: "ready" });
      await flushMicrotasks();
    });
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["1.png", "2.png"]);

    await act(async () => {
      await uploader.releaseByName("2.png", { status: "ready" });
      await uploader.releaseByName("3.png", { status: "ready" });
      await result.current.settle();
    });
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["1.png", "2.png", "3.png"]);
    expect(result.current.items).toEqual([]);
  });

  it("uploads 5 files: settle() waits for the entire chain, none skipped", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));
    const names = ["1.png", "2.png", "3.png", "4.png", "5.png"];

    act(() => result.current.addFiles(names.map(file)));

    await act(async () => {
      const settlePromise = result.current.settle();
      for (const name of names) {
        await uploader.releaseByName(name, { status: "ready" });
      }
      await settlePromise;
    });

    expect(uploader.calls.map((c) => c.file.name)).toEqual(names);
    expect(result.current.items).toEqual([]);
  });

  it("a failed upload keeps its card with the error message; later uploads in the chain still run", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("bad.png"), file("good.png")]));

    await act(async () => {
      await uploader.releaseByName("bad.png", {
        status: "error",
        message: "Файл хавсаргахад алдаа гарлаа.",
      });
      await flushMicrotasks();
    });
    expect(result.current.items.find((i) => i.file.name === "bad.png")?.status).toBe("error");

    await act(async () => {
      await uploader.releaseByName("good.png", { status: "ready" });
      await result.current.settle();
    });
    expect(result.current.items.map((i) => i.file.name)).toEqual(["bad.png"]);
    expect(result.current.items[0]?.errorMessage).toBe("Файл хавсаргахад алдаа гарлаа.");
  });

  it("retry re-queues a failed item, runs performUpload again, and clears its error on success", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("a.png")]));
    await act(async () => {
      await uploader.releaseByName("a.png", { status: "error", message: "network" });
      await flushMicrotasks();
    });
    expect(result.current.items[0]?.status).toBe("error");

    act(() => result.current.retry(result.current.items[0]!.id));
    expect(result.current.items[0]?.status).toBe("uploading");

    await act(async () => {
      // retry() runs performUpload a second time for the same file.
      await uploader.releaseByNameAt(1, { status: "ready" });
      await result.current.settle();
    });
    expect(uploader.calls).toHaveLength(2);
    expect(result.current.items).toEqual([]);
  });

  it("removing one attachment while another is mid-upload aborts only the removed one", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("first.png"), file("second.png")]));
    await act(async () => {
      await flushMicrotasks();
    });
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["first.png"]);

    // Remove the file that hasn't started uploading yet (still queued).
    const secondId = result.current.items.find((i) => i.file.name === "second.png")!.id;
    act(() => result.current.cancel(secondId));
    expect(result.current.items.map((i) => i.file.name)).toEqual(["first.png"]);

    await act(async () => {
      await uploader.releaseByName("first.png", { status: "ready" });
      await result.current.settle();
    });
    // second.png's queued run() is a no-op once its item is gone (see run()'s
    // "removed while still queued" guard) — it must never call performUpload.
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["first.png"]);
    expect(result.current.items).toEqual([]);
  });

  it("cancelling the file that is actively uploading aborts its signal", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("active.png")]));
    await act(async () => {
      await flushMicrotasks();
    });
    const activeId = result.current.items[0]!.id;

    act(() => result.current.cancel(activeId));
    await act(async () => {
      await result.current.settle();
    });
    expect(uploader.aborted[0]).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it("reset() aborts every in-flight upload and clears the list (conversation switch)", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("a.png"), file("b.png")]));
    await act(async () => {
      await flushMicrotasks();
    });

    act(() => result.current.reset());
    expect(result.current.items).toEqual([]);
    expect(uploader.aborted[0]).toBe(true);
  });

  it("deduplicates the same File selected twice in one batch", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));
    const same = file("dup.png");

    act(() => result.current.addFiles([same, same]));
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      await uploader.releaseByName("dup.png", { status: "ready" });
      await result.current.settle();
    });
    expect(uploader.performUpload).toHaveBeenCalledTimes(1);
  });

  it("dedup compares name+size+lastModified, not just name: a same-named different file is not skipped", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));
    const first = new File(["aaaa"], "scan.png", { type: "image/png", lastModified: 1 });
    const second = new File(["bbbbbbbb"], "scan.png", { type: "image/png", lastModified: 2 });

    act(() => result.current.addFiles([first, second]));
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      await uploader.releaseByNameAt(0, { status: "ready" });
      await uploader.releaseByNameAt(1, { status: "ready" });
      await result.current.settle();
    });
    expect(uploader.performUpload).toHaveBeenCalledTimes(2);
  });

  it("allows re-adding the same file after it was removed", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));
    const same = file("again.png");

    act(() => result.current.addFiles([same]));
    const firstId = result.current.items[0]!.id;
    act(() => result.current.cancel(firstId));
    expect(result.current.items).toEqual([]);

    // Re-adding it is NOT treated as a duplicate: nothing matching it is
    // in itemsRef.current any more (it was removed above).
    act(() => result.current.addFiles([same]));
    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      await uploader.releaseByName("again.png", { status: "ready" });
      await result.current.settle();
    });
    expect(result.current.items).toEqual([]);
  });
});
