"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One item per selected file. An item leaves the list when its upload is
 * ready (the caller then owns the attached document) or when it is removed,
 * so anything still listed is uploading or failed.
 */
export type UploadItem = {
  id: string;
  file: File;
  status: "uploading" | "error";
  errorMessage?: string;
};

/**
 * - "ready":   attached; the item is dropped from the list.
 * - "removed": no card to keep (access-gate/redirect handled by the caller).
 * - "error":   keep the card in the error state with this message.
 */
export type UploadOutcome =
  | { status: "ready" }
  | { status: "removed" }
  | { status: "error"; message: string };

const DEFAULT_MAX_CONCURRENT_UPLOADS = 3;

export type UseDocumentUploadQueueOptions = {
  /**
   * True once uploads no longer need to establish shared state serially —
   * concretely, once the conversation every upload attaches to already has
   * an id. While false, only the FIRST upload of a batch runs alone (it is
   * the one whose response creates/confirms that shared id); every later
   * upload in the same batch would otherwise race it and risk each
   * attaching to (or creating) a different conversation. Once true, there
   * is no such shared state left to race, so uploads run concurrently.
   * Checked once per `addFiles`/`retry` call, not cached — the caller's own
   * ref/state is the source of truth. Omitted (or returning true) preserves
   * full concurrency, matching the common case of attaching to an already
   * -open conversation.
   */
  hasEstablishedTarget?: () => boolean;
  /** Upper bound on simultaneous uploads once the target is established. */
  maxConcurrent?: number;
};

/**
 * Upload queue shared by the citizen chat and the lawyer workbench.
 *
 * Reproduced live: attaching ~5 images to one Legal Chat question took
 * close to a minute, with several attachment cards stuck on their spinner
 * the whole time. Root cause — this hook used to run EVERY upload strictly
 * one at a time via a single promise chain, even after the shared
 * conversation id was already known, so N uploads always cost N times one
 * upload's full duration no matter how independent they actually were.
 * Only the very FIRST upload of a brand-new conversation has a real reason
 * to run alone (see `hasEstablishedTarget` above); every upload after that
 * — within the same batch or a later one — targets an already-known
 * conversation and has no dependency on any other upload, so those now run
 * with bounded concurrency (`maxConcurrent`, default 3) instead of one at a
 * time. A failed upload only marks its own item as "error"; it never blocks
 * or cancels any other item, before or after this change.
 */
export function useDocumentUploadQueue(
  performUpload: (file: File, signal: AbortSignal) => Promise<UploadOutcome>,
  options?: UseDocumentUploadQueueOptions,
) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  // Only ever used to serialize a batch's single "establishing" upload
  // ahead of the rest — see addFiles/retry below. Not the general queue.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const performRef = useRef(performUpload);
  const optionsRef = useRef(options);
  const activeRef = useRef(new Set<Promise<void>>());
  const pendingRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const maxConcurrent = Math.max(1, options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT_UPLOADS);

  useEffect(() => {
    performRef.current = performUpload;
    optionsRef.current = options;
  }, [performUpload, options]);

  // The ref mirrors state so an awaiting Send reads the latest lifecycle.
  const update = useCallback((updater: (current: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = updater(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  /** Never rejects: failure is recorded on the item itself. */
  const run = useCallback(
    async (itemId: string): Promise<void> => {
      const item = itemsRef.current.find((candidate) => candidate.id === itemId);
      if (!item) {
        return; // removed while still queued
      }
      const controller = new AbortController();
      controllersRef.current.set(itemId, controller);
      let outcome: UploadOutcome;
      try {
        outcome = await performRef.current(item.file, controller.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // cancelled via the card's remove button; already removed
        }
        outcome = {
          status: "error",
          message: err instanceof Error ? err.message : "Баримт хавсаргахад алдаа гарлаа.",
        };
      } finally {
        controllersRef.current.delete(itemId);
      }
      if (outcome.status === "error") {
        update((current) =>
          current.map((candidate) =>
            candidate.id === itemId
              ? { ...candidate, status: "error", errorMessage: outcome.message }
              : candidate,
          ),
        );
      } else {
        update((current) => current.filter((candidate) => candidate.id !== itemId));
      }
    },
    [update],
  );

  /** Tracks a promise for `settle()` below, regardless of which path started it. */
  const track = useCallback((promise: Promise<void>) => {
    activeRef.current.add(promise);
    void promise.finally(() => {
      activeRef.current.delete(promise);
    });
    return promise;
  }, []);

  // `pump` recurses (each finished upload calls it again to pick up the
  // next pending one). Kept accessible via a ref so the recursive call
  // always reaches the current version without depending on `pump`'s own
  // `const` binding (unsafe: still mid-initialization on its own first
  // run) — the ref itself is written in the effect below, never during
  // render, since writing a ref's `.current` while rendering is unsafe.
  const pumpRef = useRef<() => void>(() => {});

  /** Bounded-concurrency pool: independent uploads with no shared-state race. */
  const pump = useCallback(() => {
    while (inFlightRef.current < maxConcurrent && pendingRef.current.length > 0) {
      const id = pendingRef.current.shift();
      if (id === undefined) break;
      inFlightRef.current += 1;
      track(
        run(id).finally(() => {
          inFlightRef.current -= 1;
          pumpRef.current();
        }),
      );
    }
  }, [run, track, maxConcurrent]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueueParallel = useCallback((itemId: string) => {
    pendingRef.current.push(itemId);
    pumpRef.current();
  }, []);

  const enqueueSerial = useCallback(
    (itemId: string) => {
      const promise = chainRef.current.then(() => run(itemId));
      chainRef.current = promise;
      track(promise);
      return promise;
    },
    [run, track],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      // Skip a file that's an exact match (name/size/lastModified) for one
      // already queued, uploading, or failed-and-still-listed — a rapid
      // double-click on the picker or a duplicate drag-drop must not queue
      // the same attachment twice. A file re-selected after being removed
      // (no longer in itemsRef.current) is unaffected and still allowed.
      const isDuplicate = (candidate: File, existing: File) =>
        candidate.name === existing.name &&
        candidate.size === existing.size &&
        candidate.lastModified === existing.lastModified;

      const seen = [...itemsRef.current.map((item) => item.file)];
      const deduped: File[] = [];
      for (const file of files) {
        if (seen.some((existing) => isDuplicate(file, existing))) {
          continue;
        }
        seen.push(file);
        deduped.push(file);
      }
      if (deduped.length === 0) return;

      const added: UploadItem[] = deduped.map((file) => ({
        id: `upload-${(seqRef.current += 1)}`,
        file,
        status: "uploading",
      }));
      update((current) => [...current, ...added]);

      // Backward compatibility: a caller that never passes an options
      // object at all doesn't know about `hasEstablishedTarget` and has no
      // way to opt into the newer scheduling — it is relying on this
      // hook's original contract, where EVERY upload (not just the first)
      // runs strictly one at a time via the serial chain, forever. Only a
      // caller that explicitly passes options gets the newer "first alone
      // while establishing, then bounded-concurrent" behavior below.
      if (optionsRef.current === undefined) {
        for (const item of added) enqueueSerial(item.id);
        return;
      }

      const established = optionsRef.current?.hasEstablishedTarget?.() ?? true;
      if (established) {
        for (const item of added) enqueueParallel(item.id);
        return;
      }

      const [first, ...rest] = added;
      if (!first) return;
      const establishing = enqueueSerial(first.id);
      if (rest.length > 0) {
        track(
          establishing.then(() => {
            for (const item of rest) enqueueParallel(item.id);
          }),
        );
      }
    },
    [update, enqueueParallel, enqueueSerial, track],
  );

  const retry = useCallback(
    (itemId: string) => {
      if (!itemsRef.current.some((item) => item.id === itemId)) return;
      update((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, status: "uploading", errorMessage: undefined } : item,
        ),
      );
      // Same backward-compatibility rule as addFiles above.
      if (optionsRef.current === undefined) {
        enqueueSerial(itemId);
        return;
      }
      const established = optionsRef.current?.hasEstablishedTarget?.() ?? true;
      if (established) {
        enqueueParallel(itemId);
      } else {
        enqueueSerial(itemId);
      }
    },
    [update, enqueueParallel, enqueueSerial],
  );

  const cancel = useCallback(
    (itemId: string) => {
      controllersRef.current.get(itemId)?.abort();
      controllersRef.current.delete(itemId);
      pendingRef.current = pendingRef.current.filter((id) => id !== itemId);
      update((current) => current.filter((item) => item.id !== itemId));
    },
    [update],
  );

  /** Resolves once every queued upload (including retries queued meanwhile) is done. */
  const settle = useCallback(async (): Promise<void> => {
    while (activeRef.current.size > 0) {
      await Promise.all([...activeRef.current]);
    }
  }, []);

  /** True when a failed (or otherwise unfinished) attachment is still listed. */
  const hasUnready = useCallback(() => itemsRef.current.length > 0, []);

  const reset = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    pendingRef.current = [];
    itemsRef.current = [];
    setItems([]);
  }, []);

  const uploading = items.some((item) => item.status === "uploading");

  return { items, uploading, addFiles, retry, cancel, settle, hasUnready, reset };
}
