# 1. Executive Summary

| Field | Value |
|-------|-------|
| Document | Executive Summary |
| Status | Draft for approval |
| Date | 2026-08-09 |
| Audience | Product, Engineering |

---

## 1.1 Product statement

**TORE** is Mongolia’s trusted legal marketplace: clients discover licensed lawyers, book paid consultations, communicate securely, and leave verified reviews. Lawyers onboard with credentials, publish offerings and availability, accept bookings, and receive payouts after platform fees.

Core loop (aligned with SRS booking/payment order):

> discover → book → pay → accept → consult → review

MVP vision (from approved SRS):

> TORE makes legal help accessible, transparent, and trustworthy in Mongolia.

---

## 1.2 Architectural decision

| Decision | Choice |
|----------|--------|
| Strategy | **Evolve in place** — do not rewrite |
| Style | **Modular monolith** + Clean Architecture + DDD-lite |
| App | Single Next.js 16 App Router application |
| Database | Single PostgreSQL database (Prisma 7) |
| Post-MVP | Extract Shared Platform Kernel; add Law Firm Workspace and Legal AI as separate bounded contexts |

---

## 1.3 Current state (Sprint 1)

**Done**

- Full marketplace Prisma schema (28 models, Auth.js-compatible)
- Seed data (practice areas, languages, platform settings)
- Client/lawyer registration with terms acceptance + audit
- Credentials auth, JWT sessions, middleware RBAC
- Role dashboard shells
- Domain scaffold: entities, repository interfaces, pure domain services

**Not done (majority of MVP)**

- Profiles created on register, email verification, password reset
- Lawyer credential verification & admin queue
- Offerings, availability, public discovery
- Booking engine application layer
- Payments, payouts, refunds, disputes (runtime)
- Messaging, reviews UI, notification delivery
- Legal pages, launch hardening, tests/CI

**Estimated MVP completion:** ~10% of product verticals runnable (Identity only). Schema/domain coverage is far ahead of application/UI.

---

## 1.4 What to reuse

- Marketplace schema + migrations + seed
- Domain services (booking state machine, fees, slots, eligibility, ratings, RBAC, slug/booking-number)
- Auth.js stack and identity repositories/mappers
- Clean Architecture folder conventions, shadcn UI kit, dashboard shell

## 1.5 What to remove (on implementation start)

Empty law-firm leftovers (no business logic):

- `src/app/(admin)`, `(client)`, `(lawyer)`, `(dashboard)/**`
- `src/application/use-cases/clients`, `matters`
- `src/components/clients`, `matters`, `dashboard`
- `src/lib/validations`

*(Removal is deferred until implementation is approved — documentation phase does not modify source.)*

---

## 1.6 Delivery shape

| Horizon | Scope |
|---------|--------|
| **MVP (Sprints 2–10)** | Two-sided consultation marketplace |
| **Post-MVP** | Shared platform hardening, Law Firm Workspace, Legal AI |

Default fee: **15%** platform fee (`platform_fee_percent` setting). Currency: **MNT only**.

Largest external blocker: **Mongolia payment provider selection** (must lock before Sprint 7).

---

## 1.7 Recommendation

1. Approve this documentation set as the implementation source of truth.  
2. On approval, start Sprint 2 kickoff: leftover cleanup → profile creation on register → email verify path.  
3. Keep AI and firm-workspace work **out of MVP**.

**No production code until approval.**
