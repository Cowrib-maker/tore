# 6. Folder Structure

| Field | Value |
|-------|-------|
| Document | Folder Structure |
| Status | Draft for approval |

---

## 6.1 Principles

1. **Grow by sprint** — create module folders when the owning sprint starts; avoid empty skeletons.  
2. Clean Architecture directories already exist; **extend**, don’t invent a second tree.  
3. Delete law-firm leftover empty dirs at implementation kickoff (not during this docs-only phase).  
4. Generated Prisma client stays under `src/generated/prisma` (do not hand-edit).

---

## 6.2 Target end-of-MVP tree

```text
tore/
├── docs/                          # This documentation set
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
├── tests/                         # Introduced from S2+
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Marketing
│   │   ├── globals.css
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── register/client/
│   │   │   ├── register/lawyer/
│   │   │   ├── forgot-password/
│   │   │   └── verify-email/
│   │   ├── (legal)/
│   │   │   ├── terms/
│   │   │   └── privacy/
│   │   ├── lawyers/
│   │   │   ├── page.tsx             # Directory
│   │   │   └── [slug]/page.tsx
│   │   ├── client/
│   │   │   ├── dashboard/
│   │   │   ├── profile/
│   │   │   ├── bookings/
│   │   │   └── notifications/
│   │   ├── lawyer/
│   │   │   ├── dashboard/
│   │   │   ├── profile/
│   │   │   ├── verification/
│   │   │   ├── offerings/
│   │   │   ├── availability/
│   │   │   ├── bookings/
│   │   │   └── earnings/
│   │   ├── admin/
│   │   │   ├── dashboard/
│   │   │   ├── lawyers/
│   │   │   ├── bookings/
│   │   │   ├── payouts/
│   │   │   ├── disputes/
│   │   │   ├── refunds/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       └── webhooks/payments/
│   ├── application/
│   │   ├── actions/
│   │   ├── validators/
│   │   ├── common/
│   │   └── use-cases/
│   │       ├── auth/                # Exists
│   │       ├── profiles/            # S2
│   │       ├── verification/        # S3
│   │       ├── catalog/             # S4
│   │       ├── discovery/           # S5
│   │       ├── bookings/            # S6
│   │       ├── payments/            # S7
│   │       ├── messaging/           # S8
│   │       ├── reviews/             # S9
│   │       ├── notifications/       # S9
│   │       └── admin/               # S3/S7/S10
│   ├── domain/
│   │   ├── constants/
│   │   ├── entities/
│   │   ├── enums/
│   │   ├── errors/
│   │   ├── events/                  # Optional typed events
│   │   ├── repositories/
│   │   ├── services/
│   │   └── value-objects/
│   ├── infrastructure/
│   │   ├── auth/
│   │   ├── database/
│   │   ├── mappers/
│   │   ├── repositories/
│   │   ├── email/
│   │   ├── storage/
│   │   ├── payments/
│   │   └── jobs/
│   ├── components/
│   │   ├── auth/
│   │   ├── layout/
│   │   ├── lawyers/
│   │   ├── bookings/
│   │   ├── messaging/
│   │   ├── reviews/
│   │   ├── admin/
│   │   └── ui/
│   ├── hooks/
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── env.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   └── generated/prisma/
├── package.json
├── prisma.config.ts
├── next.config.ts
└── README.md
```

---

## 6.3 Current leftovers to delete at kickoff

| Path | Action |
|------|--------|
| `src/app/(admin)/` | Delete |
| `src/app/(client)/` | Delete |
| `src/app/(lawyer)/` | Delete |
| `src/app/(dashboard)/` (+ clients, documents, matters) | Delete |
| `src/application/use-cases/clients/` | Delete |
| `src/application/use-cases/matters/` | Delete |
| `src/components/clients/` | Delete |
| `src/components/matters/` | Delete |
| `src/components/dashboard/` | Delete |
| `src/lib/validations/` | Delete |

Keep `src/app/(auth)/` — active.

---

## 6.4 Growth rule by sprint

| Sprint | New folders (typical) |
|--------|----------------------|
| S2 | `use-cases/profiles`, `verify-email` page, `infrastructure/email` |
| S3 | `use-cases/verification`, `admin/lawyers`, `infrastructure/storage` |
| S4 | `use-cases/catalog`, lawyer offerings/availability routes |
| S5 | `use-cases/discovery`, `app/lawyers` |
| S6 | `use-cases/bookings`, client/lawyer bookings UI |
| S7 | `use-cases/payments`, `infrastructure/payments`, webhook route |
| S8 | `use-cases/messaging`, messaging components |
| S9 | `use-cases/reviews`, `notifications`, jobs |
| S10 | legal pages, remaining admin, runbooks under `docs/runbooks/` |

---

## 6.5 Import aliases

Continue `@/` → `src/` via `tsconfig` paths.

Allowed cross-layer imports:

```text
app/components     → application actions, domain types, lib
application/actions → application use-cases + infrastructure adapters (composition/wiring)
application/use-cases → domain only (ports/interfaces, services, entities)
infrastructure     → domain
domain             → (nothing outside domain)
```

Server Actions and webhook route handlers are the **composition root**: they may construct or import concrete adapters and pass them into use-cases. Use-cases should not import `prisma` or concrete repository files long-term (Sprint 1 identity debt to tighten when touched).

Prefer injecting repository ports into use-cases rather than reaching for Prisma from React components.
