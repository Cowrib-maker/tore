# TORE — Legal Marketplace (Mongolia)

Two-sided LegalTech marketplace connecting clients with licensed lawyers in Mongolia.

## Tech Stack

- **Next.js 16** · App Router · Server Actions
- **TypeScript** · **Tailwind CSS v4** · **shadcn/ui**
- **PostgreSQL** · **Prisma 7** · **Auth.js v5**
- **Clean Architecture** (Domain → Application → Infrastructure → Presentation)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Set `DATABASE_URL`, `AUTH_SECRET` (min 32 chars), and `AUTH_URL`.

### 3. Database setup

```bash
npx prisma migrate dev
npm run db:seed
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sprint 1 — Complete (core) + Milestone cleanup

- Marketplace Prisma schema + migration
- Seed data (practice areas, languages, platform settings)
- Client & lawyer registration with terms acceptance
- Role-based auth (CLIENT, LAWYER, ADMIN)
- Role-scoped dashboards and middleware guards
- Audit logging on registration and login
- **Milestone 1:** removed obsolete empty law-firm route groups and leftover folders (see `docs/sprints/sprint-1-milestones.md`)

## Docs

Implementation planning and architecture review live under [`docs/`](./docs/README.md).

## Routes

| Route | Access |
|-------|--------|
| `/` | Public |
| `/login` | Guest |
| `/register/client` | Guest |
| `/register/lawyer` | Guest |
| `/forgot-password` | Guest (placeholder) |
| `/client/dashboard` | Client |
| `/lawyer/dashboard` | Lawyer |
| `/admin/dashboard` | Admin |

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run db:migrate   # Run migrations
npm run db:seed      # Seed reference data
npm run db:studio    # Prisma Studio
```
