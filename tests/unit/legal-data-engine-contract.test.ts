import { describe, expect, it } from "vitest";

import {
  citationVerdictSchema,
  retrieveRequestSchema,
  retrieveResponseSchema,
  verifyCitationsRequestSchema,
  verifyCitationsResponseSchema,
} from "@/infrastructure/legal-data-engine/legal-data-engine-client";

/**
 * Contract-drift guard, not a live cross-repo test.
 *
 * These fixtures are a hand-copied snapshot of the documented request/response
 * shapes exposed by tore-legal-data-engine (src/api/contracts.ts) as of this
 * writing: /v1/retrieve and /v1/citations/verify. This file does NOT import
 * the sibling repo at runtime — it only exercises tore's own client-side
 * schemas (legal-data-engine-client.ts) against copies of the engine's
 * documented shapes.
 *
 * If tore-legal-data-engine's contracts.ts changes, this test does not
 * detect that automatically — it only catches drift between this fixture
 * and tore's client schemas. Whoever changes either contract must update
 * both this fixture and legal-data-engine-client.ts together.
 */

const RETRIEVE_REQUEST_FIXTURE = {
  question: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
  citations: [{ query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл", nodeId: null }],
  asOf: null,
  documentId: null,
  nodeId: null,
  citationKey: null,
  locator: null,
};

const RETRIEVE_RESPONSE_FIXTURE = {
  authorities: [
    {
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
    },
  ],
  retrievedAt: "2026-08-17T00:00:00.000Z",
  status: "ok",
};

const VERIFY_REQUEST_FIXTURE = {
  citations: [
    {
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      nodeId: "node-1",
      documentId: "doc-1",
      locator: "art-17/p-1",
    },
  ],
};

const VERIFY_RESPONSE_FIXTURE = {
  results: [
    {
      query: "Эрүүгийн хуулийн 17.1 дүгээр зүйл",
      status: "VALID",
      nodeId: "node-1",
      documentVersionId: "ver-1",
      locator: "art-17/p-1",
      reasons: ["citation_unique"],
    },
  ],
};

describe("legal-data-engine contract fixtures (documented snapshot, not a live cross-repo test)", () => {
  it("tore's client schema accepts the engine's documented /v1/retrieve request shape", () => {
    expect(retrieveRequestSchema.safeParse(RETRIEVE_REQUEST_FIXTURE).success).toBe(
      true,
    );
  });

  it("tore's client schema accepts the engine's documented /v1/retrieve response shape", () => {
    expect(retrieveResponseSchema.safeParse(RETRIEVE_RESPONSE_FIXTURE).success).toBe(
      true,
    );
  });

  it("tore's client schema accepts the engine's documented /v1/citations/verify request shape", () => {
    expect(
      verifyCitationsRequestSchema.safeParse(VERIFY_REQUEST_FIXTURE).success,
    ).toBe(true);
  });

  it("tore's client schema accepts the engine's documented /v1/citations/verify response shape", () => {
    expect(
      verifyCitationsResponseSchema.safeParse(VERIFY_RESPONSE_FIXTURE).success,
    ).toBe(true);
  });

  it("tore's verdict schema accepts every documented status enum value", () => {
    for (const status of ["VALID", "UNRESOLVED", "CONFLICT"] as const) {
      const verdict = { ...VERIFY_RESPONSE_FIXTURE.results[0], status };
      expect(citationVerdictSchema.safeParse(verdict).success).toBe(true);
    }
  });

  it("tore's retrieve response schema accepts every documented status enum value", () => {
    for (const status of ["placeholder", "ok", "AS_OF_UNAVAILABLE"] as const) {
      const response = { ...RETRIEVE_RESPONSE_FIXTURE, status };
      expect(retrieveResponseSchema.safeParse(response).success).toBe(true);
    }
  });

  it("rejects a retrieve response missing a documented required field (drift canary)", () => {
    const { contentHash: _contentHash, ...authorityWithoutContentHash } =
      RETRIEVE_RESPONSE_FIXTURE.authorities[0]!;
    const drifted = {
      ...RETRIEVE_RESPONSE_FIXTURE,
      authorities: [authorityWithoutContentHash],
    };
    expect(retrieveResponseSchema.safeParse(drifted).success).toBe(false);
  });

  it("rejects a verify response with an undocumented status value (drift canary)", () => {
    const drifted = {
      results: [{ ...VERIFY_RESPONSE_FIXTURE.results[0], status: "MAYBE" }],
    };
    expect(verifyCitationsResponseSchema.safeParse(drifted).success).toBe(false);
  });
});
