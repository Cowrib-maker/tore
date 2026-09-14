import { describe, expect, it } from "vitest";

import {
  LegalEvidenceSourceType,
  MODEL_KNOWLEDGE_PROVENANCE,
  toLegalEvidenceProvenance,
  userDocumentProvenance,
  type LegalEvidenceProvenance,
  type ModelKnowledgeProvenance,
  type OfficialWebProvenance,
} from "@/application/ai/legal-evidence-source";
import {
  classifyWebSourceHostname,
  isOfficialWebSourceClass,
  officialAuthorityNameForHostname,
  UnimplementedLegalWebResearchProvider,
  WebSourceClass,
} from "@/application/ai/legal-web-research-provider";

/**
 * Architecture-audit ("authoritative legal source retrieval + web source
 * fallback") Phase 7 tests for the two new, NOT-yet-wired-in modules this
 * audit proposes: legal-evidence-source.ts (formal provenance model) and
 * legal-web-research-provider.ts (controlled web-source allowlist +
 * provider port). Covers scenarios 4 (official-web source), 5 (disallowed
 * domain), 6 (secondary source), 9 (fabricated citation attempt), and 10
 * (provenance preservation) from the audit's Phase 7 list. Scenarios 1, 2,
 * 3, 7, 8 are already covered by the existing suite — see
 * tests/unit/legal-ai.service.test.ts, fallback-legal-corpus-retriever.test.ts,
 * and knowledge-legal-corpus-retriever.test.ts, referenced in the audit
 * report rather than duplicated here.
 */

describe("4. official-web source classification", () => {
  it("classifies each allowlisted domain to its declared WebSourceClass", () => {
    expect(classifyWebSourceHostname("legalinfo.mn")).toBe(WebSourceClass.OFFICIAL_LEGAL_SOURCE);
    expect(classifyWebSourceHostname("shuukh.mn")).toBe(WebSourceClass.OFFICIAL_COURT_SOURCE);
    expect(classifyWebSourceHostname("parliament.mn")).toBe(WebSourceClass.OFFICIAL_GOVERNMENT_SOURCE);
  });

  it("matches subdomains of an allowlisted host", () => {
    expect(classifyWebSourceHostname("www.legalinfo.mn")).toBe(WebSourceClass.OFFICIAL_LEGAL_SOURCE);
    expect(classifyWebSourceHostname("api.shuukh.mn")).toBe(WebSourceClass.OFFICIAL_COURT_SOURCE);
  });

  it("is case-insensitive and trims a trailing dot", () => {
    expect(classifyWebSourceHostname("LegalInfo.MN")).toBe(WebSourceClass.OFFICIAL_LEGAL_SOURCE);
    expect(classifyWebSourceHostname("legalinfo.mn.")).toBe(WebSourceClass.OFFICIAL_LEGAL_SOURCE);
  });

  it("isOfficialWebSourceClass is true only for the 3 OFFICIAL_* values", () => {
    expect(isOfficialWebSourceClass(WebSourceClass.OFFICIAL_LEGAL_SOURCE)).toBe(true);
    expect(isOfficialWebSourceClass(WebSourceClass.OFFICIAL_COURT_SOURCE)).toBe(true);
    expect(isOfficialWebSourceClass(WebSourceClass.OFFICIAL_GOVERNMENT_SOURCE)).toBe(true);
    expect(isOfficialWebSourceClass(WebSourceClass.SECONDARY_SOURCE)).toBe(false);
    expect(isOfficialWebSourceClass(WebSourceClass.UNKNOWN_SOURCE)).toBe(false);
  });

  it("a well-formed OfficialWebProvenance carries a non-null url and VERIFIED status", () => {
    const provenance: OfficialWebProvenance = {
      sourceType: LegalEvidenceSourceType.OFFICIAL_WEB,
      authority: officialAuthorityNameForHostname("legalinfo.mn"),
      verificationStatus: "VERIFIED",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      url: "https://legalinfo.mn/mn/detail?lawId=367",
      documentVersion: null,
    };
    expect(provenance.authority).toBe("LegalInfo.mn");
    expect(provenance.url).toContain("legalinfo.mn");
  });
});

describe("5. disallowed domain — classification defenses against spoofing", () => {
  it("a non-allowlisted real domain classifies as UNKNOWN_SOURCE, not official", () => {
    expect(classifyWebSourceHostname("example.com")).toBe(WebSourceClass.UNKNOWN_SOURCE);
    expect(classifyWebSourceHostname("gov.mn")).toBe(WebSourceClass.UNKNOWN_SOURCE); // not pre-approved by this audit
  });

  it("a hostname merely containing an official domain as a substring is never misclassified as official", () => {
    // The classic hostname-spoofing shapes: prefix and suffix substring
    // tricks that a naive .includes() check would wrongly accept.
    expect(classifyWebSourceHostname("legalinfo.mn.attacker.example")).toBe(WebSourceClass.UNKNOWN_SOURCE);
    expect(classifyWebSourceHostname("notlegalinfo.mn")).toBe(WebSourceClass.UNKNOWN_SOURCE);
    expect(classifyWebSourceHostname("attacker-legalinfo.mn.example.com")).toBe(WebSourceClass.UNKNOWN_SOURCE);
  });

  it("officialAuthorityNameForHostname returns null for a disallowed domain", () => {
    expect(officialAuthorityNameForHostname("example.com")).toBeNull();
    expect(officialAuthorityNameForHostname("legalinfo.mn.attacker.example")).toBeNull();
  });

  it("empty or malformed hostname input classifies as UNKNOWN_SOURCE, never throws", () => {
    expect(classifyWebSourceHostname("")).toBe(WebSourceClass.UNKNOWN_SOURCE);
    expect(classifyWebSourceHostname("   ")).toBe(WebSourceClass.UNKNOWN_SOURCE);
  });
});

describe("6. secondary source", () => {
  it("a real, working, non-official domain is SECONDARY_SOURCE-eligible, never OFFICIAL_*", () => {
    const webSourceClass = classifyWebSourceHostname("some-law-firm-blog.example");
    expect(webSourceClass).toBe(WebSourceClass.UNKNOWN_SOURCE);
    expect(isOfficialWebSourceClass(webSourceClass)).toBe(false);
    // A caller building evidence from this hostname must use
    // SecondaryWebProvenance (UNVERIFIED), never TrustedCorpusProvenance
    // or OfficialWebProvenance (both VERIFIED) — enforced by
    // LegalEvidenceProvenance's discriminated union, not by this test
    // alone (see the compile-time proofs below).
  });
});

describe("9. fabricated citation attempt — no web source can be injected today", () => {
  it("the only shipped LegalWebResearchProvider implementation always reports unavailable, never a result", async () => {
    const provider = new UnimplementedLegalWebResearchProvider();
    expect(provider.ready).toBe(false);
    const result = await provider.search("зорилтот хайлт");
    expect(result).toEqual({ kind: "unavailable", reason: "not_implemented" });
  });

  it("MODEL_KNOWLEDGE provenance is always UNVERIFIED — there is no VERIFIED variant of it to construct", () => {
    expect(MODEL_KNOWLEDGE_PROVENANCE.verificationStatus).toBe("UNVERIFIED");
    expect(MODEL_KNOWLEDGE_PROVENANCE.authority).toBeNull();
  });

  it("compile-time proof: MODEL_KNOWLEDGE can never be constructed with VERIFIED status (type-level, not just a runtime check)", () => {
    const invalid: ModelKnowledgeProvenance = {
      sourceType: LegalEvidenceSourceType.MODEL_KNOWLEDGE,
      authority: null,
      // @ts-expect-error — verificationStatus for MODEL_KNOWLEDGE is fixed to "UNVERIFIED" in the type; "VERIFIED" is a type error, not merely a bad value this test would need to catch at runtime.
      verificationStatus: "VERIFIED",
    };
    expect(invalid).toBeDefined(); // never reached in a real build: tsc fails first
  });

  it("compile-time proof: OFFICIAL_WEB provenance cannot omit its url (unlike USER_DOCUMENT, which cannot have one)", () => {
    // @ts-expect-error — OfficialWebProvenance.url is required (string, not optional/nullable); omitting it is a type error.
    const invalid: OfficialWebProvenance = {
      sourceType: LegalEvidenceSourceType.OFFICIAL_WEB,
      authority: "LegalInfo.mn",
      verificationStatus: "VERIFIED",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      documentVersion: null,
    };
    expect(invalid).toBeDefined();
  });
});

describe("10. provenance preservation — internal locators never leak into evidence provenance", () => {
  it("toLegalEvidenceProvenance's output contains only the documented fields, even if the caller's object has extra internal ones", () => {
    // Cast through `as` specifically to simulate a caller accidentally
    // passing the full internal LegalCorpusAuthority (with nodeId,
    // contentHash, etc.) instead of the narrowed Pick<> this function
    // actually requires — proving the OUTPUT strips them at runtime, not
    // merely that the function's parameter type would reject them.
    const internalAuthority = {
      nodeId: "internal-node-123",
      documentId: "internal-doc-456",
      contentHash: "sha256:deadbeef",
      sourceContentHash: "sha256:cafebabe",
      parserId: "legalinfo-parser-v3",
      archiveRecordId: "archive-789",
      sourceUrl: "https://legalinfo.mn/mn/detail?lawId=367",
      sourceVersion: "2024-01-01",
      effectiveFrom: "1992-02-12",
    };

    const provenance = toLegalEvidenceProvenance(
      internalAuthority,
      LegalEvidenceSourceType.TORE_VERIFIED,
      "2026-01-01T00:00:00.000Z",
      "LegalInfo.mn",
    );

    const keys = Object.keys(provenance);
    expect(keys).not.toContain("nodeId");
    expect(keys).not.toContain("documentId");
    expect(keys).not.toContain("contentHash");
    expect(keys).not.toContain("sourceContentHash");
    expect(keys).not.toContain("parserId");
    expect(keys).not.toContain("archiveRecordId");
    expect(provenance.url).toBe("https://legalinfo.mn/mn/detail?lawId=367");
    expect(provenance.documentVersion).toBe("2024-01-01");
  });

  it("userDocumentProvenance() never carries a url, authority, or retrieval timestamp field", () => {
    const provenance: LegalEvidenceProvenance = userDocumentProvenance();
    expect(provenance.sourceType).toBe(LegalEvidenceSourceType.USER_DOCUMENT);
    expect(provenance.authority).toBeNull();
    expect("url" in provenance).toBe(false);
    expect("retrievedAt" in provenance).toBe(false);
  });

  it("every LegalEvidenceSourceType value round-trips through an exhaustively-checked switch (compile-time proof, not just a runtime default)", () => {
    function describeSourceType(p: LegalEvidenceProvenance): string {
      switch (p.sourceType) {
        case LegalEvidenceSourceType.TORE_VERIFIED:
        case LegalEvidenceSourceType.COURT_DECISION:
          return `trusted-corpus:${p.url ?? "no-url"}`;
        case LegalEvidenceSourceType.OFFICIAL_WEB:
          return `official-web:${p.url}`;
        case LegalEvidenceSourceType.SECONDARY_WEB:
          return `secondary-web:${p.url}`;
        case LegalEvidenceSourceType.USER_DOCUMENT:
          return "user-document";
        case LegalEvidenceSourceType.MODEL_KNOWLEDGE:
          return "model-knowledge";
        case LegalEvidenceSourceType.UNVERIFIED:
          return `unverified:${p.reason}`;
        default: {
          // If a new LegalEvidenceSourceType member is ever added without
          // a case above, `p` no longer narrows to `never` here and tsc
          // fails this file — the standard TS exhaustiveness pattern,
          // independent of any particular tsconfig flag.
          const exhaustive: never = p;
          return exhaustive;
        }
      }
    }
    expect(describeSourceType(userDocumentProvenance())).toBe("user-document");
    expect(describeSourceType(MODEL_KNOWLEDGE_PROVENANCE)).toBe("model-knowledge");
  });
});
