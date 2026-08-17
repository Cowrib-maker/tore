import { describe, expect, it, vi } from "vitest";

import {
  inspectRetrieveShape,
  selectOfficiallyVerifiedAuthorities,
  CitationVerificationStatus,
} from "@/application/ai/legal-corpus";
import { LegalDataEngineClient } from "@/infrastructure/legal-data-engine/legal-data-engine-client";
import { HttpLegalCorpusRetriever } from "@/infrastructure/legal-data-engine/http-legal-corpus-retriever";

const authority = {
  nodeId: "node-1",
  documentId: "doc-1",
  documentVersionId: "ver-1",
  locator: "art-17/p-1",
  title: "Эрүүгийн хууль",
  excerpt: "excerpt",
  contentHash: "n",
  sourceContentHash: "s",
  parserId: "legalinfo-html-v1",
  archiveRecordId: "arch-1",
  effectiveFrom: "2017-07-01T00:00:00.000Z",
  effectiveTo: null,
};

const validVerdict = {
  query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
  status: "VALID" as const,
  nodeId: "node-1",
  documentVersionId: "ver-1",
  locator: "art-17/p-1",
  reasons: ["citation_unique"],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LegalDataEngineClient", () => {
  it("POSTs /v1/retrieve with a Bearer token and the exact citation payload", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe("http://engine.test/v1/retrieve");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
        citations: [{ query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл" }],
      });
      return jsonResponse(200, {
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
        status: "ok",
      });
    });

    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test/",
      serviceToken: "secret-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.retrieve({
      question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      citations: [{ query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.authorities).toHaveLength(1);
    }
  });

  it("POSTs /v1/citations/verify with a Bearer token", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe("http://engine.test/v1/citations/verify");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        citations: [
          {
            query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
            nodeId: "node-1",
            documentId: "doc-1",
            locator: "art-17/p-1",
          },
        ],
      });
      return jsonResponse(200, { results: [validVerdict] });
    });

    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.verify({
      citations: [
        {
          query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
          nodeId: "node-1",
          documentId: "doc-1",
          locator: "art-17/p-1",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.results[0]?.status).toBe("VALID");
    }
  });

  it("maps verify 401 and 403 to unauthorized without exposing the token", async () => {
    for (const status of [401, 403]) {
      const client = new LegalDataEngineClient({
        baseUrl: "http://engine.test",
        serviceToken: "secret-token",
        fetchImpl: vi.fn(async () =>
          jsonResponse(status, { error: "unauthorized" }),
        ) as unknown as typeof fetch,
      });
      await expect(
        client.verify({
          citations: [{ query: "Эрүүгийн хуулийн 17.1" }],
        }),
      ).resolves.toEqual({
        ok: false,
        kind: "unauthorized",
        status,
      });
    }
  });

  it("maps verify 500 to server_error", async () => {
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: vi.fn(async () =>
        jsonResponse(500, { error: "fail" }),
      ) as unknown as typeof fetch,
    });
    await expect(
      client.verify({ citations: [{ query: "Эрүүгийн хуулийн 17.1" }] }),
    ).resolves.toMatchObject({
      ok: false,
      kind: "server_error",
      status: 500,
    });
  });

  it("maps verify abort to timeout", async () => {
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as unknown as typeof fetch,
    });
    await expect(
      client.verify({ citations: [{ query: "Эрүүгийн хуулийн 17.1" }] }),
    ).resolves.toEqual({ ok: false, kind: "timeout", status: null });
  });

  it("maps 401 and 403 to unauthorized without exposing the token", async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => jsonResponse(status, { error: "unauthorized" }));
      const client = new LegalDataEngineClient({
        baseUrl: "http://engine.test",
        serviceToken: "secret-token",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await expect(
        client.retrieve({ question: "Эрүүгийн хуулийн 17.1" }),
      ).resolves.toEqual({
        ok: false,
        kind: "unauthorized",
        status,
      });
    }
  });

  it("maps 500 to server_error", async () => {
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: vi.fn(async () =>
        jsonResponse(500, { error: "fail" }),
      ) as unknown as typeof fetch,
    });
    await expect(
      client.retrieve({ question: "Эрүүгийн хуулийн 17.1" }),
    ).resolves.toMatchObject({ ok: false, kind: "server_error", status: 500 });
  });

  it("maps abort to timeout", async () => {
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: vi.fn(async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as unknown as typeof fetch,
    });
    await expect(
      client.retrieve({ question: "Эрүүгийн хуулийн 17.1" }),
    ).resolves.toEqual({ ok: false, kind: "timeout", status: null });
  });

  it("maps network failure without leaking the raw error", async () => {
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNREFUSED secret-token");
      }) as unknown as typeof fetch,
    });
    await expect(
      client.retrieve({ question: "Эрүүгийн хуулийн 17.1" }),
    ).resolves.toEqual({ ok: false, kind: "network", status: null });
  });
});

describe("HttpLegalCorpusRetriever", () => {
  it("returns retrieved authorities without declaring them VALID", async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe("http://engine.test/v1/retrieve");
      expect(JSON.parse(String(init?.body))).toEqual({
        question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
        citations: [{ query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл" }],
      });
      expect(JSON.parse(String(init?.body)).locator).toBeUndefined();
      return jsonResponse(200, {
        authorities: [authority],
        retrievedAt: "2026-08-17T00:00:00.000Z",
        status: "ok",
      });
    });
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const retriever = new HttpLegalCorpusRetriever(client);
    const result = await retriever.retrieveExactCitation({
      question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      locator: "art-17/p-1",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities[0]?.nodeId).toBe("node-1");
    }
  });

  it("returns the official verify verdict", async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe("http://engine.test/v1/citations/verify");
      return jsonResponse(200, { results: [validVerdict] });
    });
    const client = new LegalDataEngineClient({
      baseUrl: "http://engine.test",
      serviceToken: "secret-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const retriever = new HttpLegalCorpusRetriever(client);
    const result = await retriever.verifyCitation({
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      nodeId: "node-1",
    });
    expect(result).toEqual({ ok: true, verdict: validVerdict });
  });
});

describe("inspectRetrieveShape", () => {
  it("does not treat a unique retrieve match as VALID", () => {
    const result = inspectRetrieveShape({
      status: "ok",
      authorities: [authority],
      retrievedAt: "t",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities).toHaveLength(1);
    }
  });

  it("does not treat two retrieve nodes as a legal CONFLICT verdict", () => {
    const result = inspectRetrieveShape({
      status: "ok",
      authorities: [
        authority,
        { ...authority, nodeId: "node-2", documentVersionId: "ver-2" },
      ],
      retrievedAt: "t",
    });
    expect(result.kind).toBe("retrieved");
    if (result.kind === "retrieved") {
      expect(result.authorities).toHaveLength(2);
    }
  });

  it("treats AS_OF_UNAVAILABLE as a version-safety refusal", () => {
    expect(
      inspectRetrieveShape({
        status: "AS_OF_UNAVAILABLE",
        authorities: [authority],
        retrievedAt: "t",
      }).kind,
    ).toBe("as_of_unavailable");
  });
});

describe("selectOfficiallyVerifiedAuthorities", () => {
  it("keeps only the officially VALID node", () => {
    const selected = selectOfficiallyVerifiedAuthorities(
      [
        authority,
        { ...authority, nodeId: "node-2", documentVersionId: "ver-2" },
      ],
      validVerdict,
    );
    expect(selected).toEqual([authority]);
  });

  it("returns nothing for UNRESOLVED or CONFLICT", () => {
    expect(
      selectOfficiallyVerifiedAuthorities([authority], {
        ...validVerdict,
        status: CitationVerificationStatus.UNRESOLVED,
        nodeId: null,
        documentVersionId: null,
        locator: null,
      }),
    ).toEqual([]);
  });
});
