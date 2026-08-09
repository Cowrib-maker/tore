# 8. Sprint-by-Sprint Implementation Plan

| Field | Value |
|-------|-------|
| Document | Sprint Implementation Plan |
| Status | Active — Sprint 4 **COMPLETE**; Sprint 5 payments next |
| Cadence | 10 × ~2 weeks ≈ 20 weeks |
| Baseline | Sprint 1 + Sprint 2 complete (`v0.2.0-alpha`) |

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

## 8.2 Sprint 2 — Profiles & onboarding — COMPLETE

**Goal:** Every user has a role profile; profile settings live; platform auth/data hardening for staging.

| Deliverables | Status |
|--------------|--------|
| Repos | ClientProfile, LawyerProfile — Done |
| Register | Profile in same flow as User (UoW) — Done |
| Legal | ToS + Privacy + Marketplace Disclaimer versions — Done |
| Backfill | Script for existing S1 users — Done |
| UI | Profile settings; richer dashboards — Done |
| Auth extend (email verify / forgot-password) | **Deferred** (Product) — see remaining roadmap |
| Ports (Email console) | **Deferred** (Product) |
| CA hygiene | Port injection + UnitOfWork — Done |
| Production High remediations | Status revoke, rate limits, env, CI, listing gate — Done |

**Exit (delivered):** Client and lawyer can update profiles; disclaimer stored; orphans backfilled; listing requires verification + active offering.

**Deferred from original exit:** Unverified users blocked from booking/payout paths; verify-email; password-reset wire.

**Release:** `v0.2.0-alpha` (2026-08-09)

---

## 8.3 Sprint 3 — Lawyer verification — COMPLETE

| Deliverables | Status |
|--------------|--------|
| Credential submit | Done — `/lawyer/verification` |
| Storage | Done — `FileStorage` port; `FILE_STORAGE=local\|s3` |
| Admin queue | Done — `/admin/lawyers` approve/reject + audit + notification |
| Eligibility | Done — badge; listing still gated until offerings |
| Seed admin | Done — optional via seed env |

**Exit (delivered):** Approved lawyer distinguishable; rejected has reason; audit logged; storage abstracted.

**Routes:** `/lawyer/verification`, `/admin/lawyers`, `/api/files/[...key]`

---

## 8.4 Sprint 4 — Public marketplace MVP (demand validation) — COMPLETE

> **Reshuffle (startup):** Former S4 catalog + S5 discovery + S6 booking-request are **one sprint**.  
> Full detail: [sprint-4-mvp-plan.md](./sprints/sprint-4-mvp-plan.md) · [milestones](./sprints/sprint-4-milestones.md).  
> **Payment decision:** Option A — **request/accept only**; no gateway/escrow/invoices/payouts in S4.

| Deliverables | Details |
|--------------|---------|
| Public directory | `/lawyers` — search, practice area, language, location, verified badge; listable only |
| Public profile | `/lawyers/[slug]` — bio, areas, languages, offerings, reviews placeholder, slot preview |
| Offerings CRUD | Duration, fixed MNT price, online / in-person; listing gate unchanged |
| Availability | Weekly rules + manual exceptions → bookable slots |
| Booking requests | Create → `PENDING_ACCEPTANCE` → lawyer accept (`CONFIRMED`) / reject (`CANCELLED`) + client notification |
| Payments | **Out of scope** — keep `PENDING_PAYMENT` in domain for a later sprint |

**Routes:** `/lawyers`, `/lawyers/[slug]`, `/lawyer/offerings`, `/lawyer/availability`, `/lawyer/bookings`, `/client/bookings`, notification inboxes.

**Exit criteria:** Guest discovers verified lawyers; client requests consultation; lawyer accepts/rejects; status tracked; **no payment** required to demo. **Met.**

**Explicitly deferred:** AI Client, TORE Pro/Harvey, Contract/Litigation AI, CRM, DMS, Enterprise, Uulen.ai, payment provider.

---

## 8.5 Sprint 5 — Payments (was S7; moved up after MVP loop)

| Deliverables | Details |
|--------------|---------|
| Insert pay step | Use existing `PENDING_PAYMENT` without renaming statuses |
| Stub then provider | Stub for staging; live provider when selected |
| Webhooks / fees / payouts | As former S7 |

**Hard gate:** Provider selected before production payment go-live.

> Former **S5 Public marketplace** and **S6 Booking engine** content is absorbed into **Sprint 4** (request path only).

---

## 8.6 Sprint 6 — Messaging

| Deliverables | Details |
|--------------|---------|
| Thread on CONFIRMED | Auto-create |
| Chat | Text + PDF/image attachments |
| Read receipts | `readAt` |

**UI:** Embedded on booking detail.

---

## 8.7 Sprint 7 — Reviews & notifications

| Deliverables | Details |
|--------------|---------|
| Reviews | After COMPLETED; denorm ratings (replace S4 placeholders) |
| In-app notifications | Bell / list |
| Email delivery | Real adapter |
| Jobs | Reminders; review request; optional auto-complete |

---

## 8.8 Sprint 8 — Admin ops & launch

| Deliverables | Details |
|--------------|---------|
| Disputes & refunds | Admin workflows (after payments exist) |
| Settings UI | Fee, SLA, cancellation hours |
| Legal pages | `/terms`, `/privacy` (+ disclaimer content) |
| Hardening | E2E, security review, runbook |
| Go-live checklist | Supply/ops readiness |

**Final E2E (post-payments):** register lawyer → admin approve → offerings → list → client request → pay → accept → message → complete → review.

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
S2 ██ done (v0.2.0-alpha)
S3 ██ done (verification + FileStorage)
S4 ▓▓ public MVP: directory + offerings + availability + booking requests (no pay)
S5 ░░ payments (PENDING_PAYMENT path)
S6 ░░ messaging
S7 ░░ reviews / richer notifications
S8 ░░ admin ops & launch
```
