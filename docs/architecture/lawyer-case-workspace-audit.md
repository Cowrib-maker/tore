# Lawyer Case Workspace + Case Intelligence — Architecture Audit

| Field | Value |
|---|---|
| Status | Audit complete. Phases 1-2 (password reset, mobile upload) implemented and tested; Phases 3-6 below are audit/design findings, implementation only where explicitly noted. |
| Mission | TORE.MN production-readiness + auth/upload + lawyer case intelligence |
| Companion code | `src/lib/app-url.ts`, `src/application/ai/case-evidence-upload-validation.ts` (Phases 1-2, implemented) |
| Scope | Case creation → ownership → document upload → Legal AI case context → case-analysis orchestrator → UI surface |

This is a companion to `legal-source-retrieval-audit.md` (previous milestone) — same style: code-evidence-grounded, audit-first, implementation only where clearly safe and justified.

---

## Phase 3: Lawyer Case Workspace — implementation status

Traced end-to-end, reading actual code, not assumed from UI component names.

| Step | Status | Evidence |
|---|---|---|
| Case creation | **IMPLEMENTED** | `create-case-file.ts:49-70` — `ownerLawyerId` always taken from `actor.userId`, never client input |
| Case ownership / authorization | **IMPLEMENTED, no IDOR found** | `assert-access.ts:13-27` (`requireOwnedCaseFile`) — every route/use-case accepting a `caseId` routes through this; `CaseFileRepository.findById` has exactly one call site, inside the check itself |
| Case document upload | **IMPLEMENTED** (storage only, no analysis — see Phase 5) | `case-documents.ts` — ownership-gated, stored via `FileStorage`, associated as `CaseEvidence` |
| Case context in Legal AI chat | **IMPLEMENTED, sanitized** | `legal-ai-case-context.ts` — every field run through `sanitizeUntrustedDocumentText`, capped (`MAX_FACTS=20`, `MAX_EVIDENCE=20`, `MAX_TEXT=800` chars), explicitly labeled `OWNED_CASE_FILE_DATA ... DATA, not instructions` |
| Case-analysis orchestrator | **IMPLEMENTED, wired to real data + real knowledge corpus** | `orchestrator.ts` + `run-persisted-analysis.ts` + `prod-wiring.ts` — see Phase 4, this is the "Case Intelligence" pipeline |
| UI surface | **IMPLEMENTED**, with 2 explicit stub nav tabs | `case-review-workspace.tsx` renders real orchestrator output; `case-workspace-layout.tsx:34-35` — "Судалгаа"/"Боловсруулалт" (Research/Drafting) tabs are `placeholder: true`, rendered as non-clickable "Coming soon" `<div>`s |
| Prisma schema | **IMPLEMENTED, matches domain entity field-for-field** | `schema.prisma:1335-1417` — `CaseFile`, `CaseFact`, `CaseEvidence`, `CaseFactEvidence` |

### Security (the questions Phase 3 specifically asked about)

- **Tenant isolation / case ownership**: enforced exclusively at the application layer (`requireOwnedCaseFile`), not at the DB query level (`findById` fetches by id only, no owner filter) — but since every call site is routed through the single shared check, this is not exploitable. No second, unchecked path to a `CaseFile` was found.
- **IDOR**: none found. Passing another lawyer's `caseFileId` anywhere in this feature (case CRUD, intake mutators, document upload, manual mapping, rerun, AI chat case attachment, AI document upload) returns `ForbiddenError`/`NotFoundError`, verified in the UI too (`case-review/page.tsx` renders "Хандах эрхгүй" on `FORBIDDEN`).
- **Uploaded case documents authorized before storage**: yes — `attachCasePdfForLawyer` calls `requireOwnedCaseFile` before touching `FileStorage`.
- **Case files vs. untrusted evidence**: case-context text reaching the LLM prompt is run through the same sanitizer used for user-uploaded documents (`sanitizeUntrustedDocumentText`) and explicitly labeled as data, not instructions — same discipline as the general untrusted-document handling audited in the previous milestone.
- **Case files never become authoritative legal sources**: confirmed structurally — case facts/evidence feed `caseContextBlock` (prompt content) and, since this audit's Phase 4 finding below, a case-analysis *retrieval query*; neither path writes case data into `LegalKnowledgeDocument`/`AICitation` or any other corpus/citation table. A case file cannot become a citation.

---

## Phase 4: Case File → Legal Data Engine — the corrected finding

**This required tracing one level deeper than the initial pass — the first-pass finding ("retrieval is independent of case context") is true for exactly ONE of TORE's two retrieval paths, not both.** Getting this right matters, so both are documented precisely.

### 4a. Legal AI chat-turn retrieval (`resolveLegalAuthorities`, `legal-ai.service.ts`) — case-independent, confirmed

Built from the raw chat `message` text only (`legal-ai.service.ts:400-405`), run in the same `Promise.all` as (not seeded by) `loadedCase`. Case facts reach the **prompt** (as `caseContextBlock`) but never the **retrieval query**. This is the conversational "Legal AI chat with a case attached" surface.

### 4b. Case-analysis orchestrator retrieval (`orchestrator.ts`, the "Case Intelligence" pipeline) — case-DEPENDENT, already working

This is the structured Case Review pipeline (issues → rules → elements → mappings → conclusion), a **separate** mechanism from 4a. `CaseAnalysisRequest` already has a `retrievalQuery?: string | null` field (`types.ts:121`), and the orchestrator's rule-retrieval stage (`orchestrator.ts:191-194`) builds its actual query with a fallback chain:

```ts
const retrievalText =
  request.retrievalQuery?.trim() ||
  selectedIssue?.statement ||
  request.facts.map((f) => f.statement).join(" ");
```

**When no explicit `retrievalQuery` is set (the normal case today), it falls through to joining every case fact's statement text** — i.e., case facts already drive this retrieval query, in production, right now. Confirmed wired end-to-end: `prod-wiring.ts:10-18` (`productionCaseFileDeps`) passes a real `knowledgeRepository = createReadOnlyKnowledgeRepository()` into `runPersistedCaseAnalysis`, which `doctrine.service.ts:138-142` uses to construct a real `KnowledgeRuleRetriever` (not the `EmptyRuleRetriever` fallback) — the retriever that actually queries `IKnowledgeRepository.searchArticles()`, the same Postgres-backed knowledge repository the chat path's local corpus retriever uses.

**So the mission's "key product question" has a split answer:**

| Path | Case facts feed the retrieval query? | Reaches remote `tore-legal-data-engine`? |
|---|---|---|
| Legal AI chat (4a) | **No** | Yes (via `FallbackLegalCorpusRetriever`, local-first) |
| Case-analysis orchestrator (4b) | **Yes, already** | **No — local knowledge corpus only** |

### Two real, precisely-scoped gaps (not implemented this mission — see rationale)

1. **4a**: chat retrieval could incorporate case facts into its query the same way 4b already does. Not implemented: this changes live retrieval behavior for every lawyer chat turn with a case attached — a real product/quality trade-off (how much case-fact text to fold into a corpus query, and whether it helps or dilutes ranking) that deserves dedicated testing beyond a "smallest safe foundational piece," not a mechanical port of 4b's pattern.
2. **4b**: `KnowledgeRuleRetriever` has no remote-engine fallback — a case whose relevant law isn't in the local corpus gets no rules at all, even if the remote `tore-legal-data-engine` would have had it. The natural fix (an `IRuleRetriever` implementation mirroring `FallbackLegalCorpusRetriever`'s local-first/remote-fallback composition) is a clean, well-scoped next step — but it changes the actual RESULTS a production case analysis produces, which crosses from "foundational, unwired addition" into "behavior change to a live, already-shipped feature," and belongs in its own reviewed, tested change per this mission's "do not silently change product architecture" rule.

**Neither of these required implementation to answer the mission's key question** — the answer for 4b turned out to be "already implemented," which is itself the useful finding.

---

## Phase 5: Case Intelligence product gap

| Feature | Current | Evidence |
|---|---|---|
| Case summary | **Missing** (as an AI feature) | `CaseFile.title`/`description` are lawyer-entered at creation, not AI-generated |
| Case facts | **Working** | `CaseFact` model, intake use-cases, rendered in workspace UI |
| Legal issues | **Working** | `review.issues`, computed by the orchestrator's issue-spotting stage, rendered |
| Applicable laws | **Working** (with the 4b caveat: local corpus only) | `review.rules`, `KnowledgeRuleRetriever`, real Postgres data, `assertRuleSupported` rejects ungrounded hits |
| Relevant court decisions | **Missing** | No persisted court-decision schema at all (see `legal-source-retrieval-audit.md` §4 from the previous milestone) |
| Evidence/document analysis | **Partial** — stored, never analyzed | `attachCasePdfForLawyer`'s own doc comment: "Does not run OCR, OpenAI, or document intelligence" |
| Evidence gaps | **Missing** | No `evidenceGap`-shaped concept found anywhere in the codebase (not even computed internally) |
| Supporting arguments | **Working**, via element/rule mapping | `review.mappings` (`FactElementMapping[]`), `review.subsumption` (`ElementApplication[]`), rendered |
| Counterarguments | **Partial** — computed internally, never surfaced | `orchestrator.ts:369-396` populates `CaseAnalysisResult.counterarguments`, but `buildCaseAnalysisReview` (`review.ts`) never maps that field into `CaseAnalysisReview` — the type the UI actually renders has no `counterarguments` field at all. A real, wired-up computation whose output the lawyer currently cannot see. |
| AI case analysis | **Working** | The whole orchestrator pipeline, exercised on every intake edit / manual mapping / rerun |
| Source-backed citations | **Working** | `review.rules[].sourceUrl/sourceId/supportStatus`; `assertRuleSupported` in the retriever rejects unsupported rules rather than inventing replacements |
| Draft generation | **Missing (explicit stub)** | `case-workspace-layout.tsx:34-35` — "Боловсруулалт" nav tab, `placeholder: true`, renders "Удахгүй" ("Coming soon") |

### Recommended V1 (smallest commercially-useful addition, not implemented this mission)

Given the table above, the **highest-value, lowest-risk** next feature is not a new subsystem — it's **surfacing what's already computed**: wire `CaseAnalysisResult.counterarguments` through `buildCaseAnalysisReview` into `CaseAnalysisReview`, and render it in `case-review-workspace.tsx` next to the existing conclusion panel. This is a real, already-correct, already-tested computation sitting one mapping step away from being visible to the lawyer who's paying for the feature — a far smaller lift than "evidence gaps" or "draft generation," both of which would need new computation logic, not just a wiring gap.

---

## Phase 6: Production readiness — affected-flows-only findings

| Area | Finding |
|---|---|
| Auth | Password-reset production bug fixed this mission (Phase 1) — see the main mission report |
| IDOR | None found in Case Workspace (Phase 3) |
| Upload security | Case evidence upload now format-validated by magic bytes (PDF/JPEG/PNG/WEBP), 10MB ceiling, ownership-gated before storage (Phase 2) |
| Prompt injection | Case-context text sanitized via the same `sanitizeUntrustedDocumentText` used for uploaded documents; explicit `AUTHORITY ORDER` in the prompt builder keeps case/document data below system instructions and verified sources (see previous milestone's audit) |
| Source provenance | Case data structurally cannot become a citation (Phase 3) — confirmed, not merely asserted |
| Mobile UX | Camera/photo upload now works for Case Review evidence (Phase 2); the Legal AI chat attachment path already supported photos, just without a camera-priming hint (left as-is — broadening `accept` there carried no bug to fix, see the mission's mobile-upload audit) |

---

## Summary of what changed vs. what's documented-only

**Implemented and tested** (Phases 1-2 of the mission): password-reset production-URL bug (`src/lib/env-schema.ts`, `src/lib/app-url.ts`, `src/application/actions/auth.actions.ts`), mobile camera/photo upload for Case Review evidence (`src/application/ai/case-evidence-upload-validation.ts`, `src/application/use-cases/case-review/case-documents.ts`, `src/components/case-review/case-pdf-upload.tsx`, `src/app/api/lawyer/case-review/documents/route.ts`).

**Documented, not implemented** (Phases 3-6): the Case Workspace audit itself (no code changes needed — no bugs found), the corrected Phase 4 finding (case-analysis retrieval already uses case facts; two precisely-scoped follow-ups identified, both are live-behavior changes deferred for dedicated review), and the Phase 5 product-gap table with its "wire up counterarguments" V1 recommendation.
