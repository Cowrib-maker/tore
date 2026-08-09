# 3. Target Architecture

| Field | Value |
|-------|-------|
| Document | Target Architecture |
| Status | Draft for approval |

---

## 3.1 Architecture style

**Modular monolith** hosted as one Next.js application with **Clean Architecture** layering and **DDD-lite** domain modeling.

```text
┌─────────────────────────────────────────────────────────┐
│ Presentation  app/, components/, middleware             │
├─────────────────────────────────────────────────────────┤
│ Application   actions, use-cases, validators            │
├─────────────────────────────────────────────────────────┤
│ Domain        entities, VOs, services, repo interfaces  │
├─────────────────────────────────────────────────────────┤
│ Infrastructure Prisma, Auth.js, email, storage, pay GW  │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** outer layers depend inward. Domain has **zero** imports of Next.js, Prisma, Auth.js, or UI.

---

## 3.2 Long-term platform map

```text
TORE Platform
├── Marketplace              ← MVP (now)
├── Law Firm Workspace       ← future
├── Legal AI                 ← future (see doc 15)
├── Payments / Messaging / Notifications
└── Shared Platform Kernel   (identity, audit, settings, files, events, i18n)
```

MVP ships Marketplace + Shared Kernel capabilities inside one deployable. Workspace and AI must not couple into marketplace tables.

---

## 3.3 Bounded contexts (logical)

| Context | Responsibility |
|---------|----------------|
| **Identity** | Users, auth, sessions, terms, RBAC, account status |
| **Marketplace** | Profiles, verification, catalog, availability, discovery, bookings, reviews |
| **Payments** | Checkout, fees, payouts, refunds, disputes |
| **Messaging** | Threads, messages, attachments (per booking) |
| **Notifications** | In-app + email fan-out |
| **Platform Ops** | Settings, audit, admin tooling |

Contexts are folders/modules, not separate services in MVP.

---

## 3.4 Request flow (mutations)

```text
UI form
  → Server Action / webhook handler (composition root)
    → Zod validation
      → Use-case (depends on domain ports + domain services)
        → Domain services + repository interfaces
          → Adapters passed in / resolved at composition root
            → Prisma repository / Email / Storage / PaymentGateway
        → Side effects (audit, notification persist)
```

**Dependency rule (strict):**

| Layer | May depend on |
|-------|----------------|
| Domain | Domain only |
| Application use-cases | Domain (entities, services, **repository interfaces**, ports) |
| Infrastructure | Domain interfaces (implements them) |
| Presentation / Server Actions | Application + infrastructure **wiring only** |

Use-cases must **not** import Prisma clients or concrete `prisma-*-repository` modules directly long-term. Prefer constructor/parameter injection or a thin application factory. Existing Sprint 1 identity use-cases that import infra singletons are **known debt** to tighten when those files are touched (Sprint 2+).

**API exceptions allowed in MVP**

- `/api/auth/[...nextauth]` — Auth.js
- `/api/webhooks/payments` — provider webhooks (idempotent)

No public REST surface for app CRUD in MVP.

---

## 3.5 Adapter ports (infrastructure)

| Port | Purpose | MVP adapters |
|------|---------|--------------|
| `UserRepository` et al. | Persistence | Prisma |
| `EmailSender` | Verify, reset, notifications | Console (dev) → SMTP/Resend/SES (prod) |
| `FileStorage` | Credentials, attachments, profile photos, contracts, evidence | `FILE_STORAGE=local` (default) → `s3` via config; same port |
| `PaymentGateway` | Checkout + refunds | Provider TBD (Mongolia/MNT) |
| `Clock` / jobs | Reminders, auto-complete | Vercel Cron or worker |

---

## 3.6 Auth & session

| Topic | Decision |
|-------|----------|
| Library | Auth.js v5 |
| Provider | Credentials (email/password) for MVP |
| Sessions | JWT + edge-compatible config split |
| Adapter | PrismaAdapter for Account/Session/VerificationToken |
| Roles | `CLIENT` \| `LAWYER` \| `ADMIN` |
| Guards | Middleware for route prefixes; use-cases re-check authorization |

---

## 3.7 Events

| Stage | Mechanism |
|-------|-----------|
| MVP | In-process side effects from use-cases |
| Post-MVP | Transactional outbox if cross-module reliability requires it |

Suggested event names: `UserRegistered`, `LawyerApproved`, `BookingCreated`, `PaymentSucceeded`, `BookingConfirmed`, `BookingCompleted`, `ReviewSubmitted`, `MessageSent`.

---

## 3.8 Anti-patterns (forbidden)

- Prisma in pages/components
- Merging marketplace `ClientProfile` with future firm CRM `Client`
- God “composition root” wiring every module into one mega factory
- Building Workspace/AI tables into MVP schema without product approval
- Skipping `BookingStatusHistory` on transitions
- Storing raw card data (always provider-hosted / tokenized)

---

## 3.9 Tech stack (locked for MVP)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind v4, shadcn / Base UI |
| Language | TypeScript strict |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| DB | PostgreSQL |
| Auth | Auth.js v5 + bcryptjs |
| Validation | Zod |
| Hosting (planned) | Vercel + managed PostgreSQL |

---

## 3.10 Evolution path

1. **MVP:** vertical modules under `src/application/use-cases/*` + matching infra.  
2. **Hardening:** clearer `modules/` or packages for Kernel vs Marketplace.  
3. **Scale-out only if needed:** extract Payments/Messaging services — not assumed for launch.
