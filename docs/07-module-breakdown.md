# 7. Module Breakdown

| Field | Value |
|-------|-------|
| Document | Module Breakdown |
| Status | Draft for approval |

---

## 7.1 Module map

| Module | Owner sprint | Primary actors | Depends on |
|--------|--------------|----------------|------------|
| Identity & Auth | S1 (done) / extend S2 | All | — |
| Profiles & Onboarding | S2 | Client, Lawyer | Identity |
| Verification | S3 | Lawyer, Admin | Profiles, Storage |
| Catalog (Offerings + Availability) | S4 | Lawyer | Verification |
| Discovery | S5 | Guest, Client | Catalog |
| Booking | S6 | Client, Lawyer | Discovery, Profiles |
| Payments | S7 | Client, Lawyer, Admin | Booking, Settings |
| Messaging | S8 | Client, Lawyer | Booking (CONFIRMED) |
| Reviews | S9 | Client | Booking (COMPLETED) |
| Notifications | S9 (stub earlier) | All | Email + many events |
| Admin Ops | S3/S7/S10 | Admin | Cross-cutting |
| Legal & Policy | S10 (+ disclaimer accept S2) | Guest, All | Settings |
| Platform Settings & Audit | S1+ | Admin / system | Kernel |
| i18n (M13) | Introduce by S5 | All | Kernel |

---

## 7.2 Module specifications

### M1 — Identity & Auth

**Responsibilities:** register, login, logout, session, RBAC middleware, terms acceptance, audit on auth events.

**Key artifacts:** Auth.js config, auth use-cases, auth actions, middleware.

**Extend in S2:** email verification, password reset, ensure profile creation.

### M2 — Profiles & Onboarding

**Responsibilities:** ClientProfile/LawyerProfile CRUD, languages on lawyer, slug, dashboard profile status.

**Repos to implement:** ClientProfile, LawyerProfile, Language, LawyerLanguage.

**Backfill:** S1 users missing profiles.

### M3 — Verification

**Responsibilities:** credential upload, admin approve/reject, verification badge, listing eligibility inputs.

**Ports:** FileStorage, LawyerCredential repository.

**Admin UI:** `/admin/lawyers` queue.

### M4 — Catalog

**Responsibilities:** offerings (MNT), weekly availability, exceptions, practice area links, `isListed` gating.

**Domain:** slot-availability, lawyer-eligibility.

### M5 — Discovery

**Responsibilities:** public directory filters (practice area; should: language, sort), public profile by slug, available slots read model.

**Routes:** `/lawyers`, `/lawyers/[slug]`.

### M6 — Booking

**Responsibilities:** create booking, accept/decline (SLA), cancel, complete, status history, conflict checks, meeting URL/instructions, optional reschedule (Should).

**Domain:** booking-state-machine, booking-number, slot-availability.

**Schema prerequisites:** `meeting_url`, `meeting_instructions`, `version` (additive migration).

**S6 without live payments (D5 — recommended):**

- Implement `PaymentGateway` **Stub** adapter behind the same port used in S7.  
- Enable only when `PAYMENTS_MODE=stub` (local/staging).  
- Stub succeeds payment and transitions `PENDING_PAYMENT → PENDING_ACCEPTANCE`.  
- Production must refuse stub mode.  
- Do **not** invent state-machine skip flags.

### M7 — Payments

**Responsibilities:** checkout session, webhook idempotency, fee split, receipts, lawyer earnings view, admin payouts, **refunds** (money path).

**Ports:** PaymentGateway (replace stub).

**Route:** `/api/webhooks/payments` → application use-case (no direct Prisma in route).

**Disputes:** not owned here as aggregate — see Booking + Admin.

### M8 — Messaging

**Responsibilities:** create thread on confirm, send text, attach PDF/image, read state; surface meeting instructions on booking detail.

**Ports:** FileStorage for attachments.

### M9 — Reviews

**Responsibilities:** post-complete review, visibility, rating denormalization, admin moderate.

**Domain:** rating-aggregator.

### M10 — Notifications

**Responsibilities:** persist in-app notifications; email delivery; reminders 24h/1h.

**Ports:** EmailSender, Jobs.

### M11 — Admin Ops

**Responsibilities:** user/booking search, suspend, **dispute resolution UI**, refund approval UI, settings, CSV export (Should), audit visibility.

Orchestrates Booking dispute state + Payments refund use-cases.

### M12 — Legal & Policy

**Responsibilities:** `/terms`, `/privacy`, marketplace disclaimer content, version keys in settings.

**S2:** collect `MARKETPLACE_DISCLAIMER` acceptance at register (with ToS/Privacy).

### M13 — i18n

**Responsibilities:** MN primary / EN fallback message catalogs for UI strings (and reuse `nameMn`/`nameEn` on taxonomy).

**Due:** catalogs in place by S5 public marketplace.

---

## 7.3 Shared kernel capabilities

| Capability | Used by |
|------------|---------|
| AuditLog | Identity, Verification, Booking, Payments, Admin |
| PlatformSetting | Fees, SLA, cancellation, terms versions |
| Email | Identity, Notifications |
| FileStorage | Verification, Messaging |
| RBAC | All route surfaces |

---

## 7.4 Module Definition of Ready / Done

**Ready:** SRS acceptance criteria known; domain service exists or scoped; schema columns exist; sprint dependency satisfied.

**Done:** use-case + tests for critical rules; Server Action; authorized UI; audit where sensitive; no Prisma outside infrastructure; demo-able.

---

## 7.5 Explicit non-modules (MVP)

| Not a module now | When |
|------------------|------|
| Law Firm Workspace (matters, documents, org) | Post-MVP |
| Legal AI | Post-MVP (doc 15) |
| Video conferencing product | Out of scope (external link OK) |
| Multi-currency | Out of scope |
