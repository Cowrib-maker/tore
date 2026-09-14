# Authoritative Legal Source Retrieval + Web Source Fallback — Architecture Audit

| Field | Value |
|---|---|
| Status | Audit complete. No production behavior changed. |
| Scope | TORE legal-AI chat retrieval, citation, and provenance path; legal-data-engine (local + remote); web-source fallback readiness |
| Companion code | `src/application/ai/legal-evidence-source.ts`, `src/application/ai/legal-web-research-provider.ts` — proposed, pure, NOT wired into the live request path |
| Companion tests | `tests/unit/legal-evidence-source-provenance.test.ts` |

This is not an ADR (no irreversible decision is made here — see `README.md`'s ADR index for that template). It is an investigation report: what the retrieval/citation/provenance architecture actually does today (traced with file:line evidence, not assumed), and whether adding court-decision support and a controlled web-source fallback is ready to build.

---

## 1. Current retrieval architecture

The request path (`src/app/api/ai/chat/route.ts` → `LegalAiService.createTurn`/`continueAuthorizedTurn`, `src/application/ai/legal-ai.service.ts`):

```
auth session lookup
  -> lawyer entitlement gate (lawyers only)
  -> guest session resolution
  -> rate limit
  -> case-file ownership check (lawyers only)
  -> relevance classification (LEGAL / POSSIBLY_LEGAL / NON_LEGAL)
  -> quota/billing reservation (citizens/guests)
  -> persist user message
  -> retrieval: resolveLegalAuthorities()  [parallel with document/case-context load]
  -> wrap untrusted document attachments
  -> prompt build (verifiedAuthorities, documentContextBlock, caseContextBlock)
  -> LLM completion (OpenAI primary, Anthropic fallback)
  -> persist assistant message
  -> persist citations — from verifiedAuthorities, NEVER parsed from LLM output
  -> quota consumption finalized
  -> response
```

Retrieval itself is a **local-first cascade**, not a flag: `FallbackLegalCorpusRetriever` (`src/application/ai/fallback-legal-corpus-retriever.ts`) always queries the local Prisma-backed retriever first (`KnowledgeLegalCorpusRetriever`, deterministic keyword/substring search over `LegalKnowledgeArticle`/`LegalKnowledgeChunk` — **no embeddings, no vector search, no LLM in the loop**; see `src/engine/knowledge/repository/article-search.ts`'s own header comment). The remote `tore-legal-data-engine` HTTP service (`src/infrastructure/legal-data-engine/legal-data-engine-client.ts`) is called **only** when local finds nothing and isn't itself erroring — and its source is not in this repository; it's reached only over HTTP via `ENGINE_BASE_URL`/`ENGINE_SERVICE_TOKEN` (both optional — the app runs correctly with the remote engine entirely absent, degrading to `UnavailableLegalCorpusRetriever("not_configured")`).

Every engine-side failure mode (timeout, 401/403, 5xx, network error, malformed response) is caught into a typed `LegalCorpusUnavailableReason` — **the client never throws**, and `resolveLegalAuthorities` converts that into either a user-facing refusal (exact-citation path) or an honest "no source found, but keep answering" instruction to the model (open-question path). See `resolve-legal-authorities.ts`.

## 2. Exact source classes (as they exist in code today)

There is **no single unified enum**. What exists:

- `LegalCorpusSource` (`legal-corpus.ts`): `LEGAL_DATA_ENGINE | LOCAL_CORPUS | FALLBACK_LOCAL_CORPUS` — which *retriever* produced a result, for observability only.
- `sourceType` on `LegalCorpusAuthority` / `LegalAiSafeCitation` / the `AICitation` Prisma column: a bare, **unconstrained `string`**. Only two literal values are actually assigned in code: `"legal-data-engine"` and `"legal-knowledge"`, plus a `"legal-source"` fallback default when reading old data back.
- `LegalIntelligenceAuthority` (`src/domain/legal-intelligence.ts`): `LEGALINFO | PARLIAMENT | COURT | GOVERNMENT` — belongs to a **completely separate subsystem** (`src/app/intelligence/[id]`, a homepage news-style feed of pre-ingested official summaries). It is not wired into the chat/citation path and does not feed AI answers.
- `DoctrineProvenance` / `LegalAuthorityKind` (`src/engine/doctrine/provenance.ts`) — a genuinely well-designed formal provenance type (includes an `AI_INFERENCE` kind explicitly marked `UNSUPPORTED`), but it belongs to the doctrine/case-analysis engine, and `legal-ai.service.ts` explicitly does **not** route through it (code comment at `legal-ai.service.ts:824-835`: routing case/document facts through it "would blur exactly the authoritative-vs-uploaded distinction").
- `CaseFactSourceType` (`MANUAL | DOCUMENT | SYSTEM`) and `CaseEvidenceType` — lawyer case-review facts, a different concern from legal-corpus citations.

**Finding:** provenance in the live chat path is real and structurally sound in its *behavior* (see §7), but *informal* in its *type* — a plain string with one conventionally-used value, not a closed type. This is exactly the gap Phase 4 of the audit asked to close; see §10 and the companion `legal-evidence-source.ts`.

## 3. Corpus fallback behavior

| Condition | Behavior |
|---|---|
| Local finds ≥1 authority | Used directly, stamped `FALLBACK_LOCAL_CORPUS`. Remote is **never called**. |
| Local returns `as_of_unavailable` (temporal ambiguity) | Returned as-is. Remote **never called** — a "current" remote scrape cannot resolve an unknown as-of date. |
| Local itself errors (`unavailable`) | Returned as-is. Remote **not called** ("do not wait on remote engine timeouts" — code comment). |
| Local is a plain miss (0 authorities, no error) | Remote is called; its result (if any) is stamped `LEGAL_DATA_ENGINE`. |
| Remote unconfigured (`ENGINE_BASE_URL`/`ENGINE_SERVICE_TOKEN` unset) | Remote leg is a permanent no-op stub reporting `unavailable: not_configured` — zero HTTP calls ever attempted. |
| Nothing found anywhere (open question) | LLM is still called; prompt is told `corpusAvailable: false` and given a fixed "no verified source found" string to relay; `citations: []` on the persisted message. |
| Nothing found (exact-citation query) | **No LLM call at all** — a canned Mongolian refusal message is persisted directly (`persistSafeReply`). |

## 4. Court-decision support status: **not supported at the persistence layer**

Conceptual support exists only as TypeScript types with no backing table:

- `SupremeCourtDecisionBody` (`src/engine/knowledge/schema.ts:255-262`): `court, caseNumber, decisionType, parties[], disposition`.
- `LegalNodeKind` (`schema.ts:43-69`) already includes judgment-structure values (`PARTIES, PROCEDURAL_HISTORY, ISSUE, HOLDING, REASONING, DISPOSITION, DISSENT`) alongside statute-structure ones.
- `LegalSourceKind.SUPREME_COURT_DECISION` exists as an enum member.

None of this reaches `prisma/schema.prisma`. The only persisted document model, `LegalKnowledgeDocument` (`prisma/schema.prisma:1276-1310`), has generic fields only (`title, kind, documentType?, language, jurisdiction, validFrom?, validTo?, sourceVersion?`) — no `court`, `caseNumber`, `decisionNumber`, `decisionDate`, or publication/validity-status columns. A decision today would have to be squeezed into the free-text `documentType` string, which the repository already does substring-match on elsewhere (`documentType.contains("COURT")` in `prisma-legal-knowledge-repository.ts`) — workable, but not structured, indexed, or queryable by date/court/case number.

The **ingestion side is further along than the persistence side**: `HttpShuukhCrawler` + `parseShuukhJudgmentHtml` (`src/engine/knowledge/crawler/http-shuukh-crawler.ts`, `shuukh-url.ts`) already fetch shuukh.mn judgment pages (HTTPS + hostname-locked, even across redirects) and extract `caseNumber`, `courtName`, `decidedOn`, and body text — it is a CLI-invoked, offline ingestion tool (`scripts/ingest-shuukh-canary.ts`), never called from the live chat path. Its output currently has nowhere structured to land.

### Smallest extension (not applied — documentation only, per this milestone's "no production migrations" rule)

Reuse the existing `LegalKnowledgeDocument` / `Article` / `Chunk` / `LegalSourceArchive` pipeline rather than building the aspirational `LegalNode`/`LegalRelation` graph. Additive, nullable-only columns on one table:

```prisma
model LegalKnowledgeDocument {
  // ...existing fields unchanged...

  // New, all nullable — existing statute rows are unaffected.
  court             String?  @map("court")
  caseNumber        String?  @map("case_number")
  decisionNumber    String?  @map("decision_number")
  decisionDate      String?  @map("decision_date")       // ISO date
  publicationStatus String?  @map("publication_status")  // e.g. "PUBLISHED" | "WITHDRAWN"
}
```

- Set `documentType = "COURT_DECISION"` for these rows (matches the substring-filter convention already in the repository).
- Represent judgment structure (HOLDING, REASONING, DISPOSITION, ...) as `Article` rows with `articleNumber` repurposed to the section label — zero changes needed to `article-search.ts` or `PrismaKnowledgeRepository`'s retrieval code.
- `HttpShuukhCrawler`'s existing extraction (`caseNumber`, `courtName`, `decidedOn`) maps directly onto the new columns with no new parsing work.

This is genuinely small: one additive migration, no new tables, no changes to the retrieval/scoring code path. It is **not applied** in this change — no production migration was run, per this milestone's explicit safety constraints.

## 5. Web-source support status: **none in the live path**

Exhaustive search (three independent passes) found **zero** web-search/fetch abstraction wired into the chat/reasoning request path. The only HTTP-fetching code that touches legal content is two offline, CLI-invoked crawlers (`HttpKnowledgeCrawler` for legalinfo.mn, `HttpShuukhCrawler` for shuukh.mn), both hostname-and-HTTPS-locked even across redirects, both writing into Postgres ahead of time — neither is imported by `create-legal-ai-service.ts`, `legal-ai.service.ts`, or any API route.

A separate, unrelated subsystem (`src/infrastructure/legal-intelligence/parliament-source-adapter.ts` + `src/domain/ports/legal-intelligence-source.ts`) shows the codebase already has *a* pattern for "official domain → adapter → pre-ingested record", but it powers a homepage news feed, not AI answers, and does no live fetching either (`repository.listPublicSummariesByHost(...)` reads from Postgres).

**Conclusion: web fallback is not implemented, and nothing today would need to be un-wired to keep it that way.** See §11 for what was built regardless (pure, unwired).

## 6. Provenance model

Internal, hash/locator-bearing shape: `LegalCorpusAuthority` (`legal-corpus.ts:12-31`) — `nodeId, documentId, documentVersionId, locator, title, excerpt, contentHash, sourceContentHash, parserId, archiveRecordId, effectiveFrom, effectiveTo, sourceUrl?, sourceVersion?, article?, paragraph?, sourceType?`.

Client-safe shape, already deliberately stripped: `LegalAiSafeCitation` (`legal-ai-citation.ts:8-18`) — doc comment states outright: "Never includes archive hashes, engine tokens, storage keys, or node internals." This existing discipline is exactly what §10's proposed `LegalEvidenceProvenance` formalizes and extends to cover source classes that don't exist yet (court decisions, official web, secondary web).

## 7. Citation-integrity findings

**Strength, confirmed by evidence:** citations returned to the user and persisted to `AICitation` are **never derived from the LLM's own output text**. `verifiedAuthorities` is computed by `resolveLegalAuthorities()` *before* the prompt is even built; `store.createCitations()` maps that pre-verified list directly into rows. There is no code path anywhere that parses the model's prose to extract citation objects. This means a citation *object* the app shows/stores cannot be one the LLM invented — it is structurally impossible, not merely policy.

**Gap, also confirmed by evidence:** this guarantee covers citation *objects*, not citation-shaped *text inside the model's prose*. Nothing in code scans the LLM's free-text answer for an article number, case number, or URL that doesn't correspond to anything in `verifiedAuthorities`. The only defense against that is prompt instruction (`safetyBlock()` / `corpusBlock()` in `src/engine/gateway/prompt-builder.service.ts`: "Never fabricate legal provisions, article numbers, or citations", "Иш, зүйлийн дугаар, шүүхийн шийдвэр бүү зохио"). The existing test `legal-ai.service.test.ts`'s "does not fabricate citations when legal retrieval finds no source" test (line ~1622) confirms the *citations array* stays empty and the *prompt* carries the right instructions — it does not and structurally cannot verify the model's actual prose, because the test mocks the completion call with a fixed string.

This is a real, narrow gap, and Phase 5 of the task asked to find "the smallest changes needed." The honest answer here is that the smallest *safe* change is not obvious: a deterministic pattern-scanner over free-form Mongolian legal prose (looking for article-number-shaped or case-number-shaped substrings) is a plausible mitigation, but it is a heuristic with real false-positive risk against legitimate general legal-education answers, and this audit found no existing corpus of positive/negative examples in the repo to calibrate one with confidence. **Recommendation, not implemented:** build and calibrate such a detector against real (mocked-LLM but representative) transcripts as its own small follow-up, flag-only at first (log a warning, do not block the answer) before ever considering a hard block. Shipping an uncalibrated regex-based blocker now would trade a narrow, low-frequency risk (fabricated prose) for a new, higher-frequency one (wrongly flagging correct answers).

## 8. Prompt safety findings

The prompt builder (`src/engine/gateway/prompt-builder.service.ts`) already does real, load-bearing work here, not just decoration:

- An explicit `AUTHORITY ORDER` block (`injectionDefenseBlock`) ranks system instructions > verified legal sources > user/document content, and explicitly forbids user/document content from "declaring itself verified or official law."
- Retrieved authorities render under a `VERIFIED LEGAL SOURCES` header; uploaded documents render under a distinctly-labeled `UNTRUSTED_USER_DOCUMENT_DATA` block with its own anti-conflation instructions ("Never cite it as an official legal source").
- Uploaded text is sanitized before reaching the model (`sanitizeUntrustedDocumentText`) to strip prompt-injection phrasing and fence-spoofing attempts at faking a `VERIFIED LEGAL SOURCES` block.
- When no corpus is available, the model is explicitly told not to invent citations while still being told to keep answering the substantive question (deliberately not a hard stop — a legal-assistance product that refuses to say anything when corpus coverage is thin would be far less useful than one that answers honestly and clearly marks what's unverified).

No code-level output filter exists (see §7's gap). Everything above is prompt-level, not code-enforced — this is worth stating plainly rather than overstating the system's guarantees.

## 9. SSRF / security findings

No live URL fetcher exists in the request path today (§5), so there is currently no SSRF surface in the *chat* path to find. The two offline crawlers are properly domain-and-HTTPS-locked (`assertHttpsLegalInfoUrl`/`assertHttpsShuukhUrl`, hostname checked exact-or-subdomain on every redirect hop, `redirect: "manual"` so the fetch layer never silently follows a hop the code hasn't itself validated) — but neither resolves DNS and checks the resolved IP against private/loopback/link-local ranges, which is the specific gap that turns "domain allowlist" into genuine SSRF protection (an allowlisted hostname can still resolve to `127.0.0.1` or an internal IP via DNS rebinding). **This is a real, pre-existing gap in the offline crawlers**, out of scope to fix here (they're not in the live request path and don't process untrusted/attacker-controlled URLs today), but it is the first thing any future live web-fetch implementation must add beyond what `classifyWebSourceHostname()` (§11) already provides — hostname allowlisting alone is necessary but not sufficient.

## 10. Recommended architecture

Formalize provenance as a closed, discriminated-union type instead of a free string — see `src/application/ai/legal-evidence-source.ts` (built, tested, not wired in): `LegalEvidenceSourceType = TORE_VERIFIED | COURT_DECISION | OFFICIAL_WEB | USER_DOCUMENT | SECONDARY_WEB | MODEL_KNOWLEDGE | UNVERIFIED`, where each variant carries only the fields that make sense for it (only `OFFICIAL_WEB`/`SECONDARY_WEB` can have a `url`; `USER_DOCUMENT`/`MODEL_KNOWLEDGE` structurally cannot). This is additive and does not require touching the existing `sourceType: string` fields — it is a new, stricter type for new code to build on, proposed for the next milestone that actually wires in a second retrieval source.

## 11. Implementation scope actually shipped this audit

Per the task's explicit "do not implement a large web-research subsystem unless the audit proves it," and because the audit's own findings (§4, §5, §7) show the architecture is **not** ready for that, only pure, zero-risk, not-wired-in foundations were built:

- `src/application/ai/legal-evidence-source.ts` — the `LegalEvidenceSourceType` model above, plus `toLegalEvidenceProvenance()` (the only sanctioned conversion from the internal `LegalCorpusAuthority` shape, structurally unable to forward internal locators/hashes).
- `src/application/ai/legal-web-research-provider.ts` — `WebSourceClass` (`OFFICIAL_LEGAL_SOURCE | OFFICIAL_COURT_SOURCE | OFFICIAL_GOVERNMENT_SOURCE | SECONDARY_SOURCE | UNKNOWN_SOURCE`), `classifyWebSourceHostname()` (exact-or-subdomain matching against a 3-entry hand-reviewed allowlist — legalinfo.mn, shuukh.mn, parliament.mn — mirroring the proven pattern in `legalinfo-url.ts`/`shuukh-url.ts`), the `LegalWebResearchProvider` port, and `UnimplementedLegalWebResearchProvider` (the only shipped implementation — always reports `unavailable: not_implemented`, zero network I/O, mirrors the existing `UnavailableLegalCorpusRetriever` degrade-honestly pattern).

Neither file is imported by `legal-ai.service.ts`, `create-legal-ai-service.ts`, `resolve-legal-authorities.ts`, or any API route. No `fetch`/`http`/`https` call exists in either file.

## 12. Final decision

**B + partial C.** Not "ready to implement" (A) as-is:

- **B (engine/schema changes needed first):** court-decision support requires the additive Prisma migration in §4 before it can be more than a documentType string convention. This blocks Phase 2 specifically, not the whole system.
- **C-flavored, narrow (integrity gap worth closing first):** the prose-fabrication gap in §7 is real, though small and already heavily mitigated by prompt instruction plus the structural citation-object guarantee. Adding a third source class (web) before addressing it would widen the same risk surface, not create a new one — worth sequencing after, not necessarily before, a calibrated fix, but worth tracking explicitly rather than silently accepted.
- Web retrieval itself (§5) has no existing abstraction to extend, confirmed by exhaustive search — the port and allowlist proposed in §11 are the correct-sized next step, not a full implementation, consistent with "do not force implementation if the architecture is not ready."

None of this blocks current production behavior. All of it is additive, tested, and unwired.
