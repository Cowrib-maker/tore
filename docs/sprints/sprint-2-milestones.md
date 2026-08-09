# Sprint 2 — Milestone Log

| Field | Value |
|-------|-------|
| Sprint | 2 — Profiles & onboarding |
| Status | **COMPLETE — Product approved 2026-08-09** |
| Release | `v0.2.0-alpha` |

---

## Sprint outcome

Sprint 2 delivered role profiles on register, orphan backfill, client/lawyer profile settings, enriched dashboards, Clean Architecture hygiene, and production-blocker / High audit remediations.

**Product-approved deferrals (not blocking Sprint 2 close):** email verification, password-reset backend, and marketplace unverified-user booking/payout gates. Tracked in the remaining roadmap for a follow-on auth hardening slice (or early Sprint 3 adjacent work)—**Sprint 3 itself is lawyer verification and is not started.**

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
- Vitest + unit tests for `slug-generator`
- Scripts: `typecheck`, `test`

### Verification

- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`

**Commit:** `feat(auth): create profiles on register via injected repositories`

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

**Commit:** `feat(profiles): add idempotent orphan profile backfill`

---

## Milestone 3 — Profile settings UI + richer dashboards

**Completed:** 2026-08-09

### Done

- Zod validators: `profile.schema.ts`
- `updateClientProfileUseCase` / `updateLawyerProfileUseCase` with port injection + audit
- Listing requires verified lawyer + active offering (post High remediaiton)
- Composition root: `profile.actions.ts`
- Settings pages: `/client/profile`, `/lawyer/profile`
- Dashboards show profile / verification / listing signals
- `DashboardShell` nav links

### Verification

- [x] `npm test`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`

**Commit:** `feat(profiles): add client and lawyer profile settings UI`

---

## Hardening — Production blockers + High audit remediations

**Completed:** 2026-08-09

### Done

- JWT role lock; transactional register (`UnitOfWork`); slug create-retry
- Use-case `ActorContext` authz; `revalidatePath` on profile updates
- Session status revoke; login/register rate limits; runtime env validation
- Soft-delete-safe partial unique indexes; CI workflow; profile-missing UX
- Listing eligibility aligned with active offerings

**Commits:**

- `fix(core): resolve production readiness blockers`
- `fix(core): remediate Sprint 2 audit High findings`

---

## Deferred (Product-approved)

| Item | Original milestone | Notes |
|------|-------------------|--------|
| `EmailSender` + verify-email flow | M4 | Follow-on auth hardening |
| Forgot-password / reset backend | M4 | UI stub remains |
| Unverified booking/payout gates | M4 | Needed before public booking |
| Remaining Medium audit backlog | M5 / hygiene | See final audit |

---

## Sprint 2 closed

**Product approval:** 2026-08-09  
**Tag:** `v0.2.0-alpha`  
**Next:** Sprint 3 — Lawyer verification (**not started**)
