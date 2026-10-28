// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import {
  useDocumentUploadQueue,
  type UploadOutcome,
} from "@/components/legal-ai/use-document-upload-queue";

/**
 * Two complementary fixes to this hook, reconciled here:
 *
 * 1. Concurrency (regression for a real reported bug: attaching ~5 images
 *    to one Legal Chat question took close to a minute, with attachment
 *    cards stuck spinning the whole time — every upload used to chain
 *    strictly one at a time even once the shared conversation id was
 *    already known). Only the very first upload of a brand-new
 *    conversation has a real reason to run alone; every upload after that
 *    runs with bounded concurrency instead.
 * 2. Dedup: a file that's an exact match (name/size/lastModified) for one
 *    already queued, uploading, or failed-and-still-listed must never be
 *    queued twice — a rapid double-click or duplicate drag-drop shouldn't
 *    upload the same attachment twice. A file re-selected after its
 *    earlier item was removed is unaffected and still allowed.
 *
 * These two concerns are orthogonal: dedup decides which files are ever
 * queued; concurrency decides how the queued ones run. The "concurrency"
 * describe block below is unchanged from the concurrency fix's own tests.
 * The "dedup and lifecycle" block covers the duplicate-file guard plus
 * cancel/retry/reset/settle behavior under the new scheduler.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function file(name: string): File {
  return new File(["x".repeat(16)], name, { type: "image/png" });
}

afterEach(() => {
  cleanup();
});

describe("useDocumentUploadQueue — concurrency", () => {
  it("runs independent uploads concurrently (bounded) once the target is already established", async () => {
    const pending = new Map<string, { resolve: (o: UploadOutcome) => void }>();
    let peakConcurrent = 0;
    let currentConcurrent = 0;

    const performUpload = async (f: File): Promise<UploadOutcome> => {
      currentConcurrent += 1;
      peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
      const d = deferred<UploadOutcome>();
      pending.set(f.name, { resolve: d.resolve });
      const outcome = await d.promise;
      currentConcurrent -= 1;
      return outcome;
    };

    const { result } = renderHook(() =>
      useDocumentUploadQueue(performUpload, {
        hasEstablishedTarget: () => true,
        maxConcurrent: 3,
      }),
    );

    act(() => {
      result.current.addFiles([file("a.png"), file("b.png"), file("c.png"), file("d.png"), file("e.png")]);
    });

    // Give the microtask queue a turn so every eligible upload actually starts.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // All 5 are independent and the target is already established, so at
    // least `maxConcurrent` of them should be running at once — strictly
    // serial execution (the old bug) would mean peakConcurrent === 1.
    expect(peakConcurrent).toBe(3);
    expect(pending.size).toBe(3);

    // Resolve the first wave; the remaining 2 queued uploads should start.
    for (const name of [...pending.keys()]) {
      pending.get(name)!.resolve({ status: "ready" });
      pending.delete(name);
    }
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pending.size).toBe(2);

    for (const name of [...pending.keys()]) {
      pending.get(name)!.resolve({ status: "ready" });
      pending.delete(name);
    }
    await act(async () => {
      await result.current.settle();
    });

    expect(result.current.items).toEqual([]);
    expect(peakConcurrent).toBe(3);
  });

  it("runs only the first upload alone while the target is not yet established, then runs the rest concurrently", async () => {
    const pending = new Map<string, { resolve: (o: UploadOutcome) => void }>();
    const startOrder: string[] = [];
    let established = false;

    const performUpload = async (f: File): Promise<UploadOutcome> => {
      startOrder.push(f.name);
      const d = deferred<UploadOutcome>();
      pending.set(f.name, { resolve: d.resolve });
      return d.promise;
    };

    const { result } = renderHook(() =>
      useDocumentUploadQueue(performUpload, {
        hasEstablishedTarget: () => established,
        maxConcurrent: 3,
      }),
    );

    act(() => {
      result.current.addFiles([file("first.png"), file("second.png"), file("third.png")]);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only the establishing upload has started — the other two are held
    // back until it resolves, so they never race it.
    expect(startOrder).toEqual(["first.png"]);

    // The first upload "creates the conversation" — the caller would flip
    // its own hasEstablishedTarget() to true right about here, exactly as
    // legal-ai-chat.tsx/lawyer-ai-workbench.tsx do from performUpload's own
    // success path before this hook's run() returns.
    established = true;
    pending.get("first.png")!.resolve({ status: "ready" });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Both remaining uploads started concurrently once the target was established.
    expect(startOrder).toEqual(["first.png", "second.png", "third.png"]);

    for (const name of [...pending.keys()]) {
      pending.get(name)!.resolve({ status: "ready" });
    }
    await act(async () => {
      await result.current.settle();
    });
    expect(result.current.items).toEqual([]);
  });

  it("a failed upload only marks its own item as error and never blocks the others", async () => {
    const outcomes: Record<string, UploadOutcome> = {
      "ok-1.png": { status: "ready" },
      "bad.png": { status: "error", message: "Файл хэт том байна." },
      "ok-2.png": { status: "ready" },
    };
    const performUpload = async (f: File): Promise<UploadOutcome> => outcomes[f.name]!;

    const { result } = renderHook(() =>
      useDocumentUploadQueue(performUpload, { hasEstablishedTarget: () => true }),
    );

    act(() => {
      result.current.addFiles([file("ok-1.png"), file("bad.png"), file("ok-2.png")]);
    });

    await act(async () => {
      await result.current.settle();
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      status: "error",
      errorMessage: "Файл хэт том байна.",
    });
  });
});

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

/** Flushes pending microtasks without assuming a fixed tick count. */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe("useDocumentUploadQueue — dedup and lifecycle (no options passed: legacy always-serial scheduling)", () => {
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

  it("backward compatibility: with no options object passed at all, uploads run strictly one at a time, never concurrently — not just the first", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("1.png"), file("2.png"), file("3.png")]));

    // Only the first upload has actually started — this is the original,
    // unconditional "every upload, forever, one at a time" contract that
    // legacy callers (that never pass an options object) still depend on.
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

  it("a failed upload keeps its card with the error message; other uploads in the batch still run", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() => useDocumentUploadQueue(uploader.performUpload));

    act(() => result.current.addFiles([file("bad.png"), file("good.png")]));

    await act(async () => {
      await uploader.releaseByName("bad.png", {
        status: "error",
        message: "Файл хавсаргахад алдаа гарлаа.",
      });
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

  it("removing a not-yet-started attachment prevents it from ever calling performUpload (forced serial via maxConcurrent: 1)", async () => {
    const uploader = deferredUploader();
    const { result } = renderHook(() =>
      useDocumentUploadQueue(uploader.performUpload, { maxConcurrent: 1 }),
    );

    act(() => result.current.addFiles([file("first.png"), file("second.png")]));
    await act(async () => {
      await flushMicrotasks();
    });
    // Bounded to 1 concurrent upload, so only the first has actually started.
    expect(uploader.calls.map((c) => c.file.name)).toEqual(["first.png"]);

    // Remove the file that hasn't started uploading yet (still pending).
    const secondId = result.current.items.find((i) => i.file.name === "second.png")!.id;
    act(() => result.current.cancel(secondId));
    expect(result.current.items.map((i) => i.file.name)).toEqual(["first.png"]);

    await act(async () => {
      await uploader.releaseByName("first.png", { status: "ready" });
      await result.current.settle();
    });
    // second.png was removed from the pending queue before the pump ever
    // reached it — it must never call performUpload.
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
      // The first item's chained run() is a microtask that hasn't fired
      // yet when cancel() removes it (no options passed ⇒ legacy serial
      // scheduling), so it sees no matching item and skips without ever
      // calling performUpload — only the re-added file produces a real call.
      await uploader.releaseByName("again.png", { status: "ready" });
      await result.current.settle();
    });
    expect(result.current.items).toEqual([]);
    expect(uploader.performUpload).toHaveBeenCalledTimes(1);
  });
});
