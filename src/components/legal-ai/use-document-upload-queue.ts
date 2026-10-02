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

/**
 * Serial upload queue shared by the citizen chat and the lawyer workbench.
 * Strictly one upload at a time: the first upload of a new conversation
 * creates it and every later one must see that conversationId — running them
 * in parallel would split one thread across several conversations.
 */
export function useDocumentUploadQueue(
  performUpload: (file: File, signal: AbortSignal) => Promise<UploadOutcome>,
) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const seqRef = useRef(0);
  const performRef = useRef(performUpload);

  useEffect(() => {
    performRef.current = performUpload;
  }, [performUpload]);

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

  const enqueue = useCallback(
    (itemId: string) => {
      chainRef.current = chainRef.current.then(() => run(itemId));
    },
    [run],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const added: UploadItem[] = files.map((file) => ({
        id: `upload-${(seqRef.current += 1)}`,
        file,
        status: "uploading",
      }));
      update((current) => [...current, ...added]);
      for (const item of added) {
        enqueue(item.id);
      }
    },
    [update, enqueue],
  );

  const retry = useCallback(
    (itemId: string) => {
      if (!itemsRef.current.some((item) => item.id === itemId)) return;
      update((current) =>
        current.map((item) =>
          item.id === itemId ? { ...item, status: "uploading", errorMessage: undefined } : item,
        ),
      );
      enqueue(itemId);
    },
    [update, enqueue],
  );

  const cancel = useCallback(
    (itemId: string) => {
      controllersRef.current.get(itemId)?.abort();
      controllersRef.current.delete(itemId);
      update((current) => current.filter((item) => item.id !== itemId));
    },
    [update],
  );

  /** Resolves once every queued upload (including retries queued meanwhile) is done. */
  const settle = useCallback(async (): Promise<void> => {
    let tail: Promise<void>;
    do {
      tail = chainRef.current;
      await tail;
    } while (tail !== chainRef.current);
  }, []);

  /** True when a failed (or otherwise unfinished) attachment is still listed. */
  const hasUnready = useCallback(() => itemsRef.current.length > 0, []);

  const reset = useCallback(() => {
    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();
    itemsRef.current = [];
    setItems([]);
  }, []);

  const uploading = items.some((item) => item.status === "uploading");

  return { items, uploading, addFiles, retry, cancel, settle, hasUnready, reset };
}
