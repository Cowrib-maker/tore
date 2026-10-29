export type UploadResponseResult<T> = {
  status: number;
  ok: boolean;
  /** Parsed JSON body when the response was JSON, otherwise null. */
  data: T | null;
  /** User-safe message for a failed response; null when ok. Never a raw parse error. */
  errorMessage: string | null;
};

/**
 * Drop-in for `(await response.json()) as T` at upload call sites: always
 * resolves to an object, with `error` set to a user-safe message when the
 * body wasn't JSON.
 */
export async function readUploadJson<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const result = await readUploadResponse<T>(response);
  if (result.data) return result.data;
  return { error: result.errorMessage ?? undefined } as T;
}

export const UPLOAD_GENERIC_ERROR = "Баримт хавсаргахад алдаа гарлаа.";
export const UPLOAD_TOO_LARGE_ERROR =
  "Файл серверт хүлээн авахад хэт том байна (HTTP 413). Жижиг файл сонгоно уу.";
export const UPLOAD_TIMEOUT_ERROR =
  "Файл хавсаргах хүсэлт удаж байна. Сүлжээгээ шалгаад дахин оролдоно уу.";
export const UPLOAD_TIMEOUT_MS = 45_000;

/**
 * fetch() with an upload-specific timeout layered on top of the caller's own
 * AbortSignal (the upload queue's own controller — a card's remove button).
 * Reproduced live: a real-world DOCX attachment left the tile stuck on its
 * loading spinner indefinitely, with no way to retry or remove it — neither
 * useDocumentUploadQueue nor the raw `fetch()` call at either upload call
 * site had ANY bound on how long to wait for a response, so a slow or
 * hung request (see docx-text-extractor.ts's own new timeout for the
 * server-side half of this fix) had nothing to turn it into a recoverable
 * error.
 *
 * A timeout-triggered abort is deliberately NOT surfaced as a DOMException
 * "AbortError": useDocumentUploadQueue's run() already treats any
 * AbortError as "the user removed this card themselves via the controller
 * it owns, nothing to show" and silently returns without ever marking the
 * item as failed. A genuinely hung request must instead reach the caller as
 * a plain Error, so it flows into run()'s other catch branch and becomes a
 * visible, retryable "error" item — never conflating the two by reusing the
 * same AbortSignal/AbortError path for both.
 */
export async function fetchWithUploadTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { signal: AbortSignal },
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<Response> {
  const localController = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => localController.abort();
  if (externalSignal.aborted) {
    localController.abort();
  } else {
    externalSignal.addEventListener("abort", onExternalAbort);
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    localController.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: localController.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(UPLOAD_TIMEOUT_ERROR);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Upload endpoints answer with JSON, but a platform/proxy layer in front of
 * them (body-size limit, gateway error) answers with plain text. Calling
 * response.json() on that throws "Unexpected token 'R', "Request En"…",
 * which then leaks into the UI. Read the body as text and only treat it as
 * JSON when it actually parses; keep the HTTP status either way.
 */
export async function readUploadResponse<T extends { error?: string }>(
  response: Response,
): Promise<UploadResponseResult<T>> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    raw = "";
  }

  let data: T | null = null;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      data = parsed as T;
    }
  } catch {
    data = null;
  }

  if (response.ok) {
    return { status: response.status, ok: true, data, errorMessage: null };
  }

  const serverMessage =
    data && typeof data.error === "string" && data.error.trim()
      ? data.error
      : null;
  const errorMessage =
    serverMessage ??
    (response.status === 413 ? UPLOAD_TOO_LARGE_ERROR : UPLOAD_GENERIC_ERROR);

  return { status: response.status, ok: false, data, errorMessage };
}
