# Architecture Review Report

| Field | Value |
|-------|-------|
| **Document** | Architecture Review Report |
| **Status** | Complete — awaiting Product approval before implementation |
| **Date** | 2026-08-09 |
| **Scope** | All documents under `/docs` vs approved SRS v1.0 + 10-Sprint Roadmap |
| **Code changes** | None (`src/` not touched) |
| **Baseline note** | **Sprint 1 is already complete** in the codebase. Next implementation phase is **Sprint 0 kickoff → Sprint 2**, not a second Sprint 1. |

---

## 1. Executive verdict

The documentation set is **broadly coherent** and aligned with the approved marketplace pivot: modular monolith, Clean Architecture intent, marketplace schema as SoT, and a sprint plan that covers the SRS must-have loop.

However, the review found **several Critical/High issues** that must be accepted (and that are partially corrected in docs in this pass) before implementation:

| Severity | Count | Theme |
|----------|------:|-------|
| Critical | 2 | Core-loop wording contradiction; unresolved S6↔S7 payment bridging |
| High | 5 | Schema gap for consultation delivery fields; Clean Architecture dependency direction; missing i18n ownership; Dispute BC ownership; concurrency control |
| Medium | 8 | Should-level SRS items underspecified; aggregate modeling; disclaimer/acceptance; etc. |
| Low | 5 | Naming/terminal-status clarity; photo via `User.image`; etc. |

**Recommendation:** Approve this review + the doc fixes below, resolve open Product decisions D5/D1, then authorize **Sprint 2 kickoff** (not Sprint 1).

---

## 2. Consistency verification (cross-document)

### 2.1 Consistent (good)

| Topic | Docs agree |
|-------|------------|
| Stack | Next 16, Prisma 7, Auth.js v5, Postgres, Zod |
| Architecture style | Modular monolith + Clean Architecture + DDD-lite |
| Roles | CLIENT / LAWYER / ADMIN |
| Currency / fee | MNT only; default 15% |
| Booking happy path statuses | DRAFT → PENDING_PAYMENT → PENDING_ACCEPTANCE → CONFIRMED → IN_PROGRESS → COMPLETED |
| Pay-then-accept order | Domain, Sprint 7, E2E, Testing agree |
| Out of scope | Workspace, AI, video product, multi-country |
| Schema model count | 28 models |
| S1 done / next is S2 | Exec, Gap, Sprint docs |

### 2.2 Inconsistencies found

| ID | Issue | Severity | Resolution |
|----|-------|----------|------------|
| C1 | Exec Summary core loop says `consult → pay → review`; SRS/domain/sprints say **pay before accept/confirm**, then consult | **Critical** | Fixed in `01-executive-summary.md` to `discover → book → pay → accept → consult → review` |
| C2 | `06`/`11` allow `application → infrastructure` imports; `03` says use-cases depend on **domain ports** only | **High** | Clarified DI/composition rule in `03`, `06`, `11` |
| C3 | Payments BC owns Disputes in module map, but Dispute is **Booking-scoped** in schema/domain | **High** | Clarified: Dispute aggregate under Booking; Payments owns Refund money-path; Admin orchestrates |
| C4 | Gap matrix marks Messaging **Missing** while domain interfaces exist (should be Partial for parity with Booking) | **Low** | Fixed in gap matrix note |
| C5 | Terminal statuses: domain service treats only `REFUNDED` as terminal; docs say COMPLETED/CANCELLED also “terminal-ish” | **Low** | Documented clarification in domain doc |
| C6 | User message asked to wait before “Sprint 1 implementation” but S1 is done | **Medium (process)** | Clarified throughout this report + README |

---

## 3. Missing modules / entities / duplicated responsibilities

### 3.1 Missing or underspecified vs SRS

| Item | SRS | Docs before review | Severity | Proposed solution |
|------|-----|--------------------|----------|-------------------|
| Consultation **meeting/instructions** (external call link) | FR-COMM schedule + instructions; video out-of-scope but external link OK | No `Bookings` column; not in sprint deliverables | **High** | Additive fields on `bookings`: `meeting_url`, `meeting_instructions` (nullable). Lawyer sets on accept/confirm. Documented in DB + Booking module + S6/S8 |
| **i18n** module ownership | NFR MN primary / EN fallback | Mentioned in risks/standards only | **High** | Add lightweight **M13 i18n** kernel capability; introduce catalogs by S5 |
| **Reschedule** | FR-BOOK Should | Absent from sprint plan | **Medium** | Schedule as Should in S6 if capacity; else explicit deferral to post-MVP with Product sign-off |
| Client **confirm completion** / auto-complete | FR-COMM | Auto-complete jobs in S9 only; client confirm underspecified | **Medium** | S6/S9: lawyer completes → client confirm optional → job auto-completes after SLA hours from settings |
| **Marketplace disclaimer** acceptance | FR-LEGAL | `TermsType` exists; register flow docs only ToS/Privacy | **Medium** | Collect disclaimer acceptance at register (S2) + page in S10 |
| Data export/delete | FR-LEGAL Should | Deferred | **Low** | Keep S10 manual workflow / admin runbook |
| Annual re-verify reminder | Business rule | Missing | **Low** | Post-MVP or S10 manual admin ops note |
| Booking `DRAFT` usage | Status exists | Sprints jump to create→PENDING_PAYMENT | **Low** | Treat DRAFT as optional hold; default create enters `PENDING_PAYMENT` |
| Optimistic concurrency on Booking | Architecture Transition mentioned | No `version` column | **High** | Add optional `version Int @default(1)` (or update `updatedAt` compare) in additive migration before S6 |

### 3.2 Duplicated / blurred responsibilities

| Overlap | Risk | Solution |
|---------|------|----------|
| **Admin Ops** vs **Payments** vs **Booking** for disputes/refunds | Duplicate use-cases | Booking owns dispute state; Payments owns refund money; Admin UI calls both |
| **Platform Settings & Audit** vs Admin Ops | Mild overlap | Keep settings writes in Admin; Audit is kernel sink |
| **Notifications** “stub early” vs “harden S9” | Scope drift | Persist rows from first emitting sprint; email delivery quality lands S9 |
| Catalog listing rules in Verification + Catalog + Eligibility | Three places | Single policy function: `lawyer-eligibility` + Catalog sets `isListed` |

### 3.3 No missing core MVP modules

Identity, Profiles, Verification, Catalog, Discovery, Booking, Payments, Messaging, Reviews, Notifications, Admin, Legal are all represented. AI correctly excluded.

---

## 4. Architectural & scalability risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| A1 | Direct use-case → Prisma singleton imports freeze dependencies | **High** | Composition: actions construct/import adapters; use-cases accept ports as params **or** application factories; never import Prisma in domain |
| A2 | Pay↔Book status coupling can create cyclic module calls | **High** | Orchestration only in application use-cases (`completePayment` updates payment then transitions booking). Domain services stay pure. |
| A3 | Slot conflict checks without row locking/`version` | **High** | Transaction + conflict query + optimistic version on `bookings` before S6 |
| A4 | Vercel serverless + Prisma connections | **Medium** | Keep `@prisma/adapter-pg` pooling; avoid opening N clients; monitor staging |
| A5 | In-process events lose work on crash after commit | **Medium** | Accept for MVP; critical money path is webhook-driven + DB state; outbox post-MVP |
| A6 | Full-table directory scan as lawyer count grows | **Medium** | Indexes already present; add pagination; search ≤2s NFR assumed ≤500 lawyers |
| A7 | File storage + webhook fan-out on single app | **Low–Med** | Fine for MVP; extract worker if cron/webhook latency hurts |
| A8 | JWT session vs DB `sessions` dual model | **Low** | Document Auth.js JWT as source of runtime auth; DB sessions may be unused — avoid assuming server-side revoke via Session table without design |

---

## 5. Sprint ↔ SRS coverage matrix

| SRS area | Must/Should | Covered by sprint(s) | Verdict |
|----------|-------------|----------------------|---------|
| FR-AUTH-01…07 | Must | S1 + S2 (verify/reset/profile) | **OK** after S2 |
| FR-LAW-01…09 | Must (+ pause Should) | S2–S4 (`isListed` = pause) | **OK**; pause via unlist |
| FR-DISC-01…06 | Must (+ sort/lang Should) | S5 | **OK** |
| FR-BOOK-01…08 | Must (+ reschedule Should) | S6 (+ S7 pay gate) | **OK** musts; reschedule **gap** (Should) |
| FR-PAY-01…08 | Must | S7 + S10 refunds/disputes admin | **OK** if provider locked |
| FR-COMM-01…07 | Must (+ reminders Should) | S8 + S9 | **Partial** until meeting fields added |
| FR-REV-01…05 | Must | S9 | **OK** |
| FR-NOTIF-01…03 | Must email / Should in-app | S2 email port + S9 | **OK** |
| FR-ADM-01…06 | Must (+ CSV Should) | S3/S7/S10 | **OK** |
| FR-LEGAL-01…04 | Must (+ export Should) | S2 disclaimer accept + S10 pages | **Needs S2 disclaimer** |
| NFR i18n | Must MN/EN | By S5 | **Needs explicit module** |
| NFR security/backups | Must | S10 + deploy doc | **OK** as plan |

### Sprint 6 / 7 payment bridge — Critical process risk

Docs leave **D5** open: how S6 demos move past `PENDING_PAYMENT` without a live provider.

**Best solution (recommended):**

1. Implement a **`PaymentGateway` Fake/Stub adapter** in S6 (infrastructure), behind the same port as S7.  
2. Stub marks payment `SUCCEEDED` and transitions booking to `PENDING_ACCEPTANCE` **only when `PAYMENTS_MODE=stub`** (local/staging).  
3. Production forbids stub.  
4. S7 replaces stub with real provider — **no booking rewrite**.

This removes the temptation to violate the state machine or invent skip flags that leak to prod.

---

## 6. Database vs required features

| Feature | Supported by current schema? | Notes |
|---------|------------------------------|-------|
| Auth / roles / terms | Yes | |
| Profiles / credentials / taxonomy | Yes | Photo via `users.image_url` — acceptable |
| Offerings / availability | Yes | |
| Discovery listing flags + ratings denorm | Yes | |
| Booking + history | Yes | Add meeting fields + version |
| Payments / payouts / refunds / disputes | Yes | |
| Messaging + attachments metadata | Yes | Bytes/MIME present |
| Reviews / notifications / audit / settings | Yes | |
| External meeting link / instructions | **No** | **Add columns** (doc updated) |
| Optimistic lock | **No** | **Add `version`** (doc updated) |
| AI / matters | Correctly absent | |

**Verdict:** Schema supports MVP **after two additive extensions** (meeting fields + booking version). No rewrite required.

---

## 7. Clean Architecture boundary review

### 7.1 Documented intent (correct)

```text
Presentation → Application → Domain ← Infrastructure
```

Domain: entities, VOs, domain services, repository **interfaces**.  
Infrastructure: Prisma, Auth.js, email, storage, payments.  
Presentation: no business rules.

### 7.2 Violations / risks in the plan

| Finding | Severity | Fix |
|---------|----------|-----|
| Allowing `application → infrastructure` as a general import rule | **High** | Use-cases depend on **interfaces**; wiring happens in Server Actions / factories |
| Current S1 code already imports infra repos inside use-cases (observed in planning baseline) | **High (implementation debt)** | Refactor toward port injection when touching those files in S2 — **not done now** |
| Webhook route must call application use-case, not Prisma directly | **Medium** | Encode in standards (done in this review’s doc updates) |
| Middleware importing domain RBAC | **OK** | Domain pure helpers are fine at edge |

### 7.3 Boundary score

**Design:** Pass with corrections.  
**Current code (informational):** Partial compliance; identity use-cases couple to infra singletons — address during S2 without big-bang rewrite.

---

## 8. Findings register (full)

### Critical

| ID | Finding | Best solution | Doc update |
|----|---------|---------------|------------|
| CRIT-1 | Core loop wording contradicts pay-then-accept | Align all docs to pay → accept → consult → review | `01` fixed |
| CRIT-2 | S6 without payments can break state machine / pollute prod | Mandatory stub `PaymentGateway` + `PAYMENTS_MODE` | `07`, `08`, `14` updated |

### High

| ID | Finding | Best solution | Doc update |
|----|---------|---------------|------------|
| HIGH-1 | No booking meeting URL/instructions | Additive schema fields; S6/S8 UX | `04`, `05`, `07`, `08` |
| HIGH-2 | CA dependency direction ambiguous | Ports-in / adapters-out wiring rule | `03`, `06`, `11` |
| HIGH-3 | i18n not owned as module | Add M13; due by S5 | `07`, `08` |
| HIGH-4 | Dispute ownership split unclear | Booking owns dispute; Payments owns refund; Admin UI | `04`, `07` |
| HIGH-5 | Missing optimistic concurrency on bookings | Add `version` before S6 | `05`, `14` |

### Medium

| ID | Finding | Best solution | Doc update |
|----|---------|---------------|------------|
| MED-1 | Reschedule Should not planned | Explicit S6 Should or defer with Product OK | `08`, `14` |
| MED-2 | Client confirm / auto-complete underspecified | Settings-driven auto-complete + optional client confirm | `08` |
| MED-3 | Marketplace disclaimer not in register | Accept at register S2 | `08`, `07` |
| MED-4 | Availability modeled as many roots | Treat rules/exceptions as Catalog entities under lawyer consistency boundary | `04` note |
| MED-5 | In-process events reliability | Accept MVP; outbox later | already in `03` |
| MED-6 | Prisma pooling on serverless | Document ops check | `13` |
| MED-7 | Process confusion “Sprint 1 next” | Next = Sprint 2 | README + this report |
| MED-8 | Pay↔Book cycle | Application orchestration only | `09` |

### Low

| ID | Finding | Best solution | Doc update |
|----|---------|---------------|------------|
| LOW-1 | Messaging gap status | Mark Partial | `02` |
| LOW-2 | Terminal status definition | Clarify non-refund terminals | `04` |
| LOW-3 | Lawyer photo | Use `User.image` | `05` |
| LOW-4 | DRAFT status rarely used | Document default entry status | `04` |
| LOW-5 | Annual re-verify | Runbook note S10 | `08` |

---

## 9. Documentation updates made in this review

| File | Change |
|------|--------|
| `docs/16-architecture-review-report.md` | This report |
| `docs/README.md` | Link + clarify next phase = Sprint 2 |
| `docs/01-executive-summary.md` | Fix core loop order |
| `docs/02-gap-analysis.md` | Messaging Partial; meeting-field gap |
| `docs/03-target-architecture.md` | CA wiring / composition rule |
| `docs/04-domain-model.md` | Meeting fields; dispute ownership; terminals; DRAFT |
| `docs/05-database-design.md` | Planned additive columns |
| `docs/06-folder-structure.md` | Import rules |
| `docs/07-module-breakdown.md` | i18n; meeting fields; stub payments; dispute ownership |
| `docs/08-sprint-implementation-plan.md` | S2 disclaimer; S6 stub pay; meeting fields; reschedule/auto-complete; i18n |
| `docs/09-dependency-graph.md` | Pay/Book orchestration note |
| `docs/11-coding-conventions.md` | Port injection convention |
| `docs/13-deployment-strategy.md` | Prisma pooling note |
| `docs/14-risk-analysis.md` | New risks from review |

---

## 10. Approval gate

**Stop here.** No `src/` work until Product approves:

- [ ] Architecture Review Report accepted  
- [ ] Doc corrections accepted  
- [ ] **D5** resolved as Stub PaymentGateway (recommended) or alternative written  
- [ ] **D1** payment provider shortlist still running in parallel  
- [ ] Authorization for **Sprint 0 / Sprint 2 kickoff** (Sprint 1 remains complete)

**Explicitly not authorized yet:** production code, schema migrations in repo, leftover folder deletion commits.
