# 8. Sprint-by-Sprint Implementation Plan

| Field | Value |
|-------|-------|
| Document | Sprint Implementation Plan |
| Status | Draft for approval |
| Cadence | 10 × ~2 weeks ≈ 20 weeks |
| Baseline | Sprint 1 complete |

---

## 8.0 Sprint 0 — Kickoff (after doc approval)

**Duration:** 1–3 days  
**No product features beyond enablement**

| Task | Outcome |
|------|---------|
| Approve docs | Authorization to code |
| Delete law-firm leftover folders | Clean tree |
| Profile-on-register design lock | Prevent orphan users |
| Domain unit test harness (Vitest) | Safety net for SM/fees |
| Payment provider shortlist started | Parallel to S2–S5 |
| Seed admin user plan | Needed by S3 |

---

## 8.1 Sprint 1 — Platform foundation — COMPLETE

| Outcome | Status |
|---------|--------|
| Marketplace Prisma schema + migration | Done |
| Seed practice areas, languages, settings | Done |
| Client/lawyer register + terms + audit | Done |
| Auth.js credentials + RBAC middleware | Done |
| Role dashboard shells | Done |

---

## 8.2 Sprint 2 — Profiles & onboarding

**Goal:** Every user has a role profile; email verification gated for marketplace actions.

| Deliverables | Details |
|--------------|---------|
| Repos | ClientProfile, LawyerProfile, Language, LawyerLanguage |
| Register | Create profile in same flow as User |
| Legal | Accept ToS + Privacy + **Marketplace Disclaimer** versions |
| Backfill | Script for existing S1 users |
| UI | Profile settings; richer dashboards |
| Auth extend | Verify-email pages + token flow; wire forgot-password |
| Ports | Email console adapter |
| CA hygiene | When touching auth use-cases, prefer port injection over new infra imports |

**Exit criteria:** Client and lawyer can update profiles; disclaimer stored; unverified users blocked from booking/payout paths (even if booking UI not live yet).

---

## 8.3 Sprint 3 — Lawyer verification

| Deliverables | Details |
|--------------|---------|
| Credential submit | License number, authority, document upload |
| Storage | Local/S3 file port |
| Admin queue | Approve/reject with reason |
| Eligibility | Badge; listing still gated until offerings |

**Routes:** `/lawyer/verification`, `/admin/lawyers`

**Exit criteria:** Approved lawyer distinguishable; rejected has reason; audit logged.

---

## 8.4 Sprint 4 — Offerings & availability

| Deliverables | Details |
|--------------|---------|
| Offerings CRUD | MN titles, duration, price MNT |
| Availability | Weekly rules + exceptions |
| Practice areas | Lawyer M:N assignment |
| Listing rule | `isListed` only if APPROVED + ≥1 active offering + eligibility |

**Routes:** `/lawyer/offerings`, `/lawyer/availability`

---

## 8.5 Sprint 5 — Public marketplace

| Deliverables | Details |
|--------------|---------|
| Directory | Filter by practice area; optional language/sort |
| Public profile | `/lawyers/[slug]` with credentials, ratings placeholders, offerings |
| Slots read | Show available times from rules |
| i18n | MN/EN UI catalogs for public + shell strings (M13) |

**Exit criteria:** Guest can browse; only listable lawyers appear; book CTA visible to clients (wires to S6).

---

## 8.6 Sprint 6 — Booking engine

| Deliverables | Details |
|--------------|---------|
| Migration | Additive: `meeting_url`, `meeting_instructions`, `version` |
| Create booking | Issue summary + slot + offering → `PENDING_PAYMENT` |
| Stub payments | `PaymentGateway` stub + `PAYMENTS_MODE=stub` (staging/local only) |
| Lifecycle | Accept/decline/cancel/complete via state machine |
| Meeting fields | Lawyer sets external link/instructions on accept/confirm |
| History | Every transition recorded |
| Conflicts | Slot overlap prevention + optimistic `version` |
| Completion | Lawyer completes; optional client confirm; settings-based auto-complete job may land S9 |
| Reschedule | **Should** — implement if capacity; else explicit Product deferral |
| UI | Client & lawyer booking lists/detail |

**Payments:** Live provider is S7. S6 uses stub gateway only — never state-machine skip flags.

---

## 8.7 Sprint 7 — Payments & payouts

| Deliverables | Details |
|--------------|---------|
| Provider adapter | Sandbox first |
| Checkout | Before acceptance progression |
| Webhook | Idempotent on `providerPaymentId` |
| Fee split | Immutable snapshot |
| Earnings | Lawyer view |
| Admin payouts | Mark PAID manually |

**Hard gate:** Provider must be selected before sprint start.

---

## 8.8 Sprint 8 — Messaging

| Deliverables | Details |
|--------------|---------|
| Thread on CONFIRMED | Auto-create |
| Chat | Text + PDF/image attachments |
| Read receipts | `readAt` |

**UI:** Embedded on booking detail.

---

## 8.9 Sprint 9 — Reviews & notifications

| Deliverables | Details |
|--------------|---------|
| Reviews | After COMPLETED; denorm ratings |
| In-app notifications | Bell / list |
| Email delivery | Real adapter |
| Jobs | 24h / 1h reminders; review request; auto-complete after SLA if client did not confirm |

---

## 8.10 Sprint 10 — Admin ops & launch

| Deliverables | Details |
|--------------|---------|
| Disputes & refunds | Admin workflows (dispute on booking; refund on payment) |
| Settings UI | Fee, SLA, cancellation hours, auto-complete hours |
| Legal pages | `/terms`, `/privacy` (+ disclaimer content) |
| Export | CSV (Should); manual data-export/delete runbook (Should) |
| Ops note | Annual lawyer re-verify handled manually in MVP |
| Hardening | E2E, security review, runbook |
| Go-live checklist | ≥30 lawyers goal is ops; system readiness E2E |

**Final E2E:** register lawyer → admin approve → client book → pay → accept → message → complete → review.

---

## 8.11 Cross-sprint Definition of Done

Every sprint:

1. `npm run build` and `lint` green  
2. Roadmap acceptance criteria satisfied  
3. Sensitive mutations write AuditLog  
4. No Prisma outside `infrastructure/`  
5. Stakeholder demo  

---

## 8.12 Suggested Gantt (relative)

```text
S1 ██ done
S2 ░░ profiles / email
S3 ░░ verification
S4 ░░ catalog
S5 ░░ discovery
S6 ░░ booking
S7 ░░ payments   ← provider gate
S8 ░░ messaging
S9 ░░ reviews / notif
S10░░ launch
```
