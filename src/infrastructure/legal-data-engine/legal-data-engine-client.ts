import { z } from "zod";

export const retrieveRequestSchema = z.object({
  question: z.string().min(1).max(8000),
  citations: z
    .array(
      z.object({
        query: z.string().min(1),
        nodeId: z.string().nullable().optional(),
      }),
    )
    .optional(),
  asOf: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  nodeId: z.string().nullable().optional(),
  citationKey: z.string().nullable().optional(),
  locator: z.string().nullable().optional(),
});

export type LegalDataEngineRetrieveRequest = z.infer<
  typeof retrieveRequestSchema
>;

export const retrieveResponseSchema = z.object({
  authorities: z.array(
    z.object({
      nodeId: z.string(),
      documentId: z.string(),
      documentVersionId: z.string(),
      locator: z.string(),
      title: z.string(),
      excerpt: z.string(),
      contentHash: z.string(),
      sourceContentHash: z.string(),
      parserId: z.string(),
      archiveRecordId: z.string(),
      effectiveFrom: z.string().nullable(),
      effectiveTo: z.string().nullable(),
    }),
  ),
  retrievedAt: z.string(),
  status: z.enum(["placeholder", "ok", "AS_OF_UNAVAILABLE"]),
});

export type LegalDataEngineRetrieveResponse = z.infer<
  typeof retrieveResponseSchema
>;

export const verifyCitationsRequestSchema = z.object({
  citations: z
    .array(
      z.object({
        query: z.string().min(1),
        nodeId: z.string().nullable().optional(),
        documentId: z.string().nullable().optional(),
        locator: z.string().nullable().optional(),
      }),
    )
    .max(50),
});

export type LegalDataEngineVerifyRequest = z.infer<
  typeof verifyCitationsRequestSchema
>;

export const citationVerdictSchema = z.object({
  query: z.string(),
  status: z.enum(["VALID", "UNRESOLVED", "CONFLICT"]),
  nodeId: z.string().nullable(),
  documentVersionId: z.string().nullable(),
  locator: z.string().nullable(),
  reasons: z.array(z.string()),
});

export const verifyCitationsResponseSchema = z.object({
  results: z.array(citationVerdictSchema),
});

export type LegalDataEngineVerifyResponse = z.infer<
  typeof verifyCitationsResponseSchema
>;

export type LegalDataEngineClientConfig = {
  baseUrl: string;
  serviceToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type LegalDataEngineHttpFailure = {
  ok: false;
  kind:
    | "timeout"
    | "unauthorized"
    | "server_error"
    | "network"
    | "invalid_response";
  status: number | null;
};

export type LegalDataEngineRetrieveResult =
  | { ok: true; data: LegalDataEngineRetrieveResponse }
  | LegalDataEngineHttpFailure;

export type LegalDataEngineVerifyResult =
  | { ok: true; data: LegalDataEngineVerifyResponse }
  | LegalDataEngineHttpFailure;

/**
 * Server-only HTTP client for tore-legal-data-engine.
 * Does not log the service token or raw fetch errors for clients.
 */
export class LegalDataEngineClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LegalDataEngineClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.serviceToken = config.serviceToken;
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async retrieve(
    body: LegalDataEngineRetrieveRequest,
  ): Promise<LegalDataEngineRetrieveResult> {
    const parsedBody = retrieveRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return { ok: false, kind: "invalid_response", status: null };
    }

    return this.postJson(
      "/v1/retrieve",
      parsedBody.data,
      retrieveResponseSchema,
      "retrieve",
    );
  }

  async verify(
    body: LegalDataEngineVerifyRequest,
  ): Promise<LegalDataEngineVerifyResult> {
    const parsedBody = verifyCitationsRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return { ok: false, kind: "invalid_response", status: null };
    }

    return this.postJson(
      "/v1/citations/verify",
      parsedBody.data,
      verifyCitationsResponseSchema,
      "verify",
    );
  }

  private async postJson<T>(
    path: string,
    body: unknown,
    responseSchema: z.ZodType<T>,
    operation: string,
  ): Promise<{ ok: true; data: T } | LegalDataEngineHttpFailure> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        console.error(`legal-data-engine ${operation} unauthorized`, {
          status: response.status,
        });
        return { ok: false, kind: "unauthorized", status: response.status };
      }

      if (response.status >= 500) {
        console.error(`legal-data-engine ${operation} server error`, {
          status: response.status,
        });
        return { ok: false, kind: "server_error", status: response.status };
      }

      if (!response.ok) {
        console.error(`legal-data-engine ${operation} rejected`, {
          status: response.status,
        });
        return { ok: false, kind: "invalid_response", status: response.status };
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return { ok: false, kind: "invalid_response", status: response.status };
      }

      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        console.error(`legal-data-engine ${operation} payload invalid`);
        return { ok: false, kind: "invalid_response", status: response.status };
      }

      return { ok: true, data: parsed.data };
    } catch (error) {
      if (isAbortError(error)) {
        console.error(`legal-data-engine ${operation} timeout`);
        return { ok: false, kind: "timeout", status: null };
      }
      console.error(`legal-data-engine ${operation} network failure`);
      return { ok: false, kind: "network", status: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError")
  );
}
