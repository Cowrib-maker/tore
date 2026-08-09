# 14. Risk Analysis

| Field | Value |
|-------|-------|
| Document | Risk Analysis |
| Status | Draft for approval |

---

## 14.1 Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|------------|--------|------------|-------|
| R1 | Mongolia **payment provider** undecided / slow integration | High | High — blocks S7+ revenue path | Lock provider by end of S5; adapter port; sandbox in S7 | Product + Eng |
| R2 | S1 users exist **without profiles** | High (current) | High — broken onboarding | First S2 story: create on register + backfill | Eng |
| R3 | Domain rules **duplicated in UI** | Medium | High — inconsistent bookings/fees | Unit-test domain; use-cases must call domain services | Eng |
| R4 | Law-firm **leftover folders** confuse builders | Medium | Medium | Delete at kickoff; docs forbid Workspace in MVP | Eng |
| R5 | Email deliverability delays verify/reset | Medium | Medium | Console adapter first; production email early in S2 | Eng |
| R6 | **Double-booking** under concurrency | Medium | High | Slot checks + indexes + transaction/locking strategy | Eng |
| R7 | Webhook **non-idempotent** handling | Medium | High | Unique `providerPaymentId`; transactional updates | Eng |
| R8 | Scope creep into Workspace/AI | Medium | High — misses marketplace MVP | Hard out-of-scope list; reject CRM/AI tickets | Product |
| R9 | Late **i18n** (MN/EN) causes rework | High | Medium | Message catalogs by S5 public UI | Eng |
| R10 | No CI/tests until late | Medium | Medium | Vitest S2; CI by S4; Playwright golden path S10 | Eng |
| R11 | Upload abuse (credentials/attachments) | Medium | Medium | MIME/size limits; private bucket; signed URLs | Eng |
| R12 | Admin bottleneck for verify/payouts | Medium | Medium | Queue UX; runbook; seeded settings/SLA | Product + Ops |
| R13 | Legal pages / compliance unfinished | Medium | High at launch | Scheduled S10; versions already in settings | Product + Legal |
| R14 | Schema drift from approved ERD | Low–Med | Medium | Additive migrations; schema review each sprint | Eng |
| R15 | Premature microservice / package split | Low | Medium | Stay modular monolith until post-MVP | Architect |
| R16 | Next.js / Auth.js beta churn | Medium | Medium | Pin versions; read local Next docs before API changes | Eng |
| R17 | Insufficient verified lawyers at launch | Medium | High (biz) | Parallel recruiter ops track; not an engineering substitute | Product |
| R18 | Dispute/refund edge cases | Medium | Medium | Manual admin MVP; clear policy pages | Product |
| R19 | S6 bypasses payment state machine | High | High | **Required:** Stub `PaymentGateway` + `PAYMENTS_MODE`; forbid prod stub | Eng |
| R20 | Missing meeting URL/instructions fields | High | Medium | Additive migration before S6 | Eng |
| R21 | Booking lost updates / double-book under concurrency | Medium | High | `version` column + transactional conflict checks | Eng |
| R22 | Application layer imports concrete infra (CA drift) | High | Medium | Port injection when touching use-cases; actions as composition root | Eng |
| R23 | i18n deferred past public launch | High | Medium | M13 catalogs by S5 | Eng |

---

## 14.2 Open decisions (require approval)

| # | Decision | Needed by | Notes |
|---|----------|-----------|-------|
| D1 | Payment provider (QPay / SocialPay / bank / other) | Before S7 | Blocks money path |
| D2 | Email provider | S2 | Verify/reset |
| D3 | Object storage (S3-compatible region) | S3 | Credentials |
| D4 | Confirm hosting (Vercel + managed Postgres) | S2 | Affects cron/webhooks |
| D5 | S6 payment bridge | Before S6 | **Architecture Review recommends Stub PaymentGateway** (`PAYMENTS_MODE=stub`) |
| D6 | Email verify hard-gate for lawyer credential submit | S2/S3 | SRS emphasizes book/payout; confirm lawyer path |
| D7 | Soft-launch lawyer count target ops plan | S10 | ≥30 lawyers is business KPI |
| D8 | Reschedule in MVP (Should) | Before S6 | Implement in S6 or explicit deferral |

---

## 14.3 Risk heat (summary)

**Critical path risks:** R1 (payments), R2 (profiles), R6/R7/R21 (booking integrity), R8 (scope), R19 (S6 stub discipline), R22 (CA drift).

**Schedule risks:** R5, R9, R10, R23.

**Launch risks:** R12, R13, R17.

---

## 14.4 Contingency triggers

| Trigger | Contingency |
|---------|-------------|
| Provider not locked 2 weeks before S7 | Slip S7; keep S6 demo on **stub PaymentGateway** only |
| Pressure to “skip PENDING_PAYMENT” | Reject; use stub adapter instead |
| Email provider blocked | Magic-link delay; admin-assisted verify for early lawyers |
| Double-booking incident | Feature-flag new bookings; hotfix locking; audit impacted rows |
| Scope push for AI/Workspace mid-MVP | Park in doc 15 / future backlog; do not open schema |

---

## 14.5 Residual risk acceptance

MVP accepts:

- Manual payouts and dispute resolution  
- External call links instead of built-in video  
- Limited automation (reminders basic)  
- WCAG A rather than full AA  

These are intentional to protect schedule.
