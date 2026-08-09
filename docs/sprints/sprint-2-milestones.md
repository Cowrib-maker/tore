# Sprint 2 — Milestone Log

| Field | Value |
|-------|-------|
| Sprint | 2 — Profiles & onboarding |
| Status | **Milestone 1 complete — awaiting approval** |

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

**STOP — awaiting approval before Milestone 2.**
