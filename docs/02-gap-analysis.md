# 2. Gap Analysis — Current vs Target MVP

| Field | Value |
|-------|-------|
| Document | Gap Analysis |
| Status | Draft for approval |
| Baseline | Sprint 1 codebase (`tore@0.1.0`) |
| Target | Approved SRS v1.0 MVP |

---

## 2.1 Legend

| Status | Meaning |
|--------|---------|
| **Done** | End-to-end usable in the running app |
| **Partial** | Schema and/or domain and/or UI stub present; not product-complete |
| **Missing** | Not started in application / infrastructure / UI |

---

## 2.2 Functional gap matrix

| SRS module | FR range | Schema | Domain | Infra | App / UI | Gap status | Priority |
|------------|----------|--------|--------|-------|----------|------------|----------|
| Auth & accounts | FR-AUTH-01…07 | Yes | Yes | User/Terms/Audit | Register, login, logout | **Partial** — no email verify, no password reset backend, no account settings | P0 |
| Lawyer profile & verification | FR-LAW-01…09 | Yes | Interfaces + eligibility/slug | No | Dashboard stub | **Partial** — no profile rows on register; no credentials upload/admin | P0 |
| Discovery | FR-DISC-01…06 | Indirect | `findListed` interface | No | Marketing landing only | **Missing** | P0 |
| Booking | FR-BOOK-01…08 | Yes | State machine + slots + booking# | No | None | **Partial** (rules only) | P0 |
| Payments / payouts | FR-PAY-01…08 | Yes | Fee + cancellation math | No | None | **Partial** (math only); provider TBD | P0 |
| Messaging / delivery | FR-COMM-01…07 | Yes | Interfaces | No | None | **Partial** (schema/domain only; no meeting URL fields yet — see Architecture Review HIGH-1) | P1 |
| Reviews / trust | FR-REV-01…05 | Yes | Rating aggregator | No | None | **Partial** | P1 |
| Notifications | FR-NOTIF-01…03 | Yes | Interface | No | None | **Missing** | P1 |
| Admin console | FR-ADM-01…06 | Supporting models | RBAC | No | Dashboard stub | **Partial** | P0→P1 by feature |
| Legal / policy | FR-LEGAL-01…04 | TermsAcceptance + settings | Constants | Wired at register | No public pages | **Partial** | P1 (go-live) |

---

## 2.3 Critical behavioral gaps

| ID | Gap | Impact |
|----|-----|--------|
| G1 | Registration creates `User` but **not** `ClientProfile` / `LawyerProfile` | Blocks onboarding (S2) |
| G2 | Email verification required before book/payout | Blocks trustworthy marketplace loop |
| G3 | Forgot-password page has no token/reset backend | Account recovery incomplete |
| G4 | No file-storage adapter | Blocks credential & attachment uploads |
| G5 | No email adapter | Blocks verify, reset, notifications |
| G6 | No payment provider adapter / webhook | Blocks S7 and paid MVP |
| G7 | No job runner | Blocks reminders & auto-complete |
| G8 | MN primary / EN fallback i18n not started | NFR & public UX risk |
| G9 | No automated tests or CI | Regression risk as booking/payments land |
| G10 | Empty law-firm folders remain | Confuses future implementers |
| G11 | Booking has no `meeting_url` / `meeting_instructions` | Blocks FR-COMM delivery instructions (external call link) |
| G12 | No optimistic `version` on bookings | Concurrency / double-book risk under load |

---

## 2.4 Layer coverage

| Layer | Present | Missing for MVP |
|-------|---------|-----------------|
| Presentation | Auth pages, role dashboard stubs, landing | Discovery, bookings, admin tools, messaging, legal pages |
| Application | Auth use-cases + actions only | All other use-case modules |
| Domain | Broad scaffold + pure services | Event contracts optional; else ready to wire |
| Infrastructure | 4 Prisma repos + Auth.js | Profile…dispute repos, storage, email, payments, jobs |

**Wired Prisma repositories today:** `User`, `AuditLog`, `TermsAcceptance`, `PlatformSetting`.

---

## 2.5 Sprint readiness

| Sprint | Theme | Readiness |
|--------|-------|-----------|
| S1 Platform foundation | Complete | **Done** |
| S2 Profiles & onboarding | Schema ready; app missing | Ready to build |
| S3 Verification | Schema ready | Ready after S2 |
| S4 Offerings & availability | Domain rules ready | Ready after S3 |
| S5 Public marketplace | Not started | After S4 |
| S6 Booking engine | Domain SM ready | After S5 |
| S7 Payments | Fee math ready; provider open | After S6 + provider lock |
| S8 Messaging | Schema only | After confirmed bookings |
| S9 Reviews & notifications | Aggregator ready | After complete path |
| S10 Admin & launch | Stub only | Final hardening |

---

## 2.6 Non-functional gaps

| Area | SRS target | Current |
|------|------------|---------|
| Performance | ≤3s pages; search ≤2s | Unmeasured; no search yet |
| Security | RBAC, hashed passwords, no card storage, audits, upload limits | Auth + audit baseline; uploads missing |
| Availability | 99.5%; backups | Ops not defined |
| Scale | Stateless; 10× without rewrite | Architecture OK |
| UX / i18n | MN/EN; ≤5 booking steps; WCAG A | EN-centric auth UI |
| Maintainability | Clean Arch; structured logs | Structure OK; logging incomplete |
| Compliance | Mongolian data rules; retention | Legal pages / export-delete deferred |

---

## 2.7 Out of scope (do not treat as gaps)

Per SRS: full matter/case management, e-sign/court filing, AI legal advice, multi-country, native apps, map routing, firm subscriptions, white-label, in-platform video (external call link is OK).

---

## 2.8 Gap verdict

The project is **schema-and-domain ahead, application-behind**. Closing the gap is mostly **wiring** approved models through Clean Architecture vertical slices — not inventing a new data model.
