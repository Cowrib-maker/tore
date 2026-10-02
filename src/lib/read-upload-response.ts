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
