# Sprint 2 — Milestone Log

| Field | Value |
|-------|-------|
| Sprint | 2 — Profiles & onboarding |
| Status | **Milestone 3 complete — awaiting approval** |

---

## Milestone 1 — Profile repos + register creates profiles

**Completed:** 2026-08-09

### Done

- `PrismaClientProfileRepository` + `PrismaLawyerProfileRepository` + profile mappers
- Register use-cases refactored to **port injection** (no infra imports in use-cases)
- Composition root in `auth.actions.ts` wires concrete repositories
- Client/lawyer registration creates matching profile rows
- Lawyer slug via domain `slug-generator` with uniqueness retry
- Marketplace disclaimer recorded with `marketplace_disclaimer_version` from settings
- Vitest + unit tests for `slug-generator` (5 passing)
- Scripts: `typecheck`, `test`

### Verification

- [x] `npm test` — pass (5)
- [x] `npm run lint` — pass
- [x] `npm run typecheck` — pass
- [x] `npm run build` — pass

### Out of scope (later milestones)

- Profile settings UI
- Email / verify / password reset
- Backfill script for orphan S1 users
- Dashboard enrichment

### Suggested commit (when requested)

`feat(auth): create profiles on register via injected repositories`

---

## Milestone 2 — Backfill orphan users + domain unit tests

**Completed:** 2026-08-09

### Done

- `backfillMissingProfilesUseCase` (port-injected) creates missing Client/Lawyer profiles
- CLI composition root: `scripts/backfill-missing-profiles.ts` (`npm run db:backfill-profiles`)
- Domain unit tests: fee-calculator, cancellation-policy, booking-state-machine
- Audit entries on backfilled profiles

### Verification

- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run db:backfill-profiles` (idempotent)

### Out of scope (Milestone 3+)

- Profile settings UI
- Email / verify / password reset

---

## Milestone 3 — Profile settings UI + richer dashboards

**Completed:** 2026-08-09

### Done

- Zod validators: `profile.schema.ts` (client phone/company; lawyer headline/bio/experience/timezone/listing)
- `updateClientProfileUseCase` / `updateLawyerProfileUseCase` with port injection + `AuditAction.UPDATE`
- Listing requires verified lawyer (`isLawyerVerified`); otherwise ValidationError
- Composition root: `profile.actions.ts` (session/role assert, FormData parse, load helpers)
- Settings pages: `/client/profile`, `/lawyer/profile` + profile forms
- Dashboards show profile completeness, email verification, lawyer verification + listing signals
- `DashboardShell` nav links to dashboard/profile

### Verification

- [x] `npm test` — pass (18)
- [x] `npm run lint` — pass
- [x] `npm run typecheck` — pass
- [x] `npm run build` — pass

### Out of scope (Milestone 4+)

- Email port / verify-email / password reset
- Gate unverified users from booking/payout paths

**STOP — awaiting approval before Milestone 4.**

### Suggested commit (when requested)

`feat(profiles): add client and lawyer profile settings UI`
