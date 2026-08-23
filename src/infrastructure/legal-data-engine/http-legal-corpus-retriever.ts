import type {
  LegalCitationVerifyResult,
  LegalCorpusRetriever,
  LegalCorpusRetrieveInput,
  LegalCorpusRetrieveResult,
  LegalCorpusUnavailableReason,
  LegalCorpusVerifyInput,
} from "@/application/ai/legal-corpus";
import { inspectRetrieveShape } from "@/application/ai/legal-corpus";
import { LegalDataEngineClient } from "@/infrastructure/legal-data-engine/legal-data-engine-client";

export class HttpLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(private readonly client: LegalDataEngineClient) {}

  async retrieveExactCitation(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const result = await this.client.retrieve({
      question: input.question,
      citations: [{ query: input.query }],
    });

    if (!result.ok) {
      return unavailable(result.kind);
    }

    return inspectRetrieveShape({
      status: result.data.status,
      authorities: result.data.authorities,
      retrievedAt: result.data.retrievedAt,
    });
  }
  async retrieveLegalQuestion(
    input: LegalCorpusRetrieveInput,
  ): Promise<LegalCorpusRetrieveResult> {
    const result = await this.client.retrieve({
      question: input.question || input.query,
      asOf: null,
    });

    if (!result.ok) {
      return unavailable(result.kind);
    }

    return inspectRetrieveShape({
      status: result.data.status,
      authorities: result.data.authorities,
      retrievedAt: result.data.retrievedAt,
    });
  }
  async verifyCitation(
    input: LegalCorpusVerifyInput,
  ): Promise<LegalCitationVerifyResult> {
    const result = await this.client.verify({
      citations: [
        {
          query: input.query,
          nodeId: input.nodeId,
          documentId: input.documentId,
          locator: input.locator,
        },
      ],
    });

    if (!result.ok) {
      return { ok: false, reason: result.kind };
    }

    const verdict = result.data.results[0];
    if (!verdict) {
      return { ok: false, reason: "invalid_response" };
    }

    return { ok: true, verdict };
  }
}

export class UnavailableLegalCorpusRetriever implements LegalCorpusRetriever {
  constructor(
    private readonly reason: LegalCorpusUnavailableReason = "not_configured",
  ) {}

  async retrieveExactCitation(): Promise<LegalCorpusRetrieveResult> {
    return unavailable(this.reason);
  }
  async retrieveLegalQuestion(): Promise<LegalCorpusRetrieveResult> {
    return unavailable(this.reason);
  }
  async verifyCitation(): Promise<LegalCitationVerifyResult> {
    return { ok: false, reason: this.reason };
  }
}

function unavailable(
  reason: LegalCorpusUnavailableReason,
): LegalCorpusRetrieveResult {
  return {
    kind: "unavailable",
    reason,
    authorities: [],
    retrievedAt: null,
  };
}
