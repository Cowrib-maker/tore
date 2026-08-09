# Sprint 2 — Implementation Checklist

| Field | Value |
|-------|-------|
| Sprint | 2 — Profiles & onboarding |
| Status | **COMPLETE — Product approved 2026-08-09** |
| Release | `v0.2.0-alpha` |
| Goal (delivered) | Every user has a role profile; profile update capability; disclaimer on register; production auth/data hardening for staging |
| Original exit notes | Email verify + booking gates Product-deferred; tracked in remaining roadmap |

---

## Clean Architecture rules (sprint)

- [x] Use-cases depend on domain ports only (no new Prisma / concrete repo imports in use-cases)
- [x] Prisma only in `infrastructure/`
- [x] Server Actions wire adapters (composition root)
- [x] Domain stays free of Next.js / Auth.js / Prisma
- [x] Lint + typecheck + build green at close

---

## Milestone 1 — Profile repos + register creates profiles — DONE

- [x] Implement `PrismaClientProfileRepository` + mapper
- [x] Implement `PrismaLawyerProfileRepository` + mapper (`slugExists`, create, find*)
- [x] Refactor `registerClientUseCase` / `registerLawyerUseCase` to **port injection**
- [x] On register: create `ClientProfile` or `LawyerProfile` (lawyer slug via domain `slug-generator`)
- [x] Load `marketplace_disclaimer_version` and record disclaimer acceptance with correct version
- [x] Wire composition root in `auth.actions.ts`
- [x] Unit tests for `slug-generator` (validation / slug logic)
- [x] lint · typecheck · build

**Commit:** `feat(auth): create profiles on register via injected repositories`

---

## Milestone 2 — Backfill orphan users + Vitest harness — DONE

- [x] Script/use-case: backfill missing Client/Lawyer profiles for existing users
- [x] Expand domain unit tests (fee/cancellation/state-machine)
- [x] lint · typecheck · build

**Commit:** `feat(profiles): add idempotent orphan profile backfill`

---

## Milestone 3 — Profile settings UI + richer dashboards — DONE

- [x] Client/lawyer profile update use-cases + validators + Server Actions
- [x] Settings pages under `/client/profile`, `/lawyer/profile`
- [x] Dashboards show profile / verification status signals
- [x] lint · typecheck · build

**Commit:** `feat(profiles): add client and lawyer profile settings UI`

---

## Hardening — Blockers + High audit items — DONE

- [x] Production blockers (JWT role lock, UoW register, slug race, use-case authz, revalidate)
- [x] High audit remediations (status revoke, rate limits, env validation, partial uniques, CI, listing gate, profile-missing UX)
- [x] lint · typecheck · build · test

---

## Deferred from original M4 / M5 — Product-approved

- [ ] `EmailSender` port + console adapter *(follow-on)*
- [ ] Verification token flow + `/verify-email` page *(follow-on)*
- [ ] Forgot-password + reset flow *(follow-on)*
- [ ] Gate: unverified users blocked from booking/payout paths *(follow-on)*
- [x] Audit coverage for profile **update** (create-on-register still User-only — residual Medium)
- [x] Register forms still accept terms (disclaimer covered by bundle)
- [x] Update `docs/sprints/sprint-2-milestones.md` completion
- [ ] Full stakeholder demo checklist *(ops)*

---

## Traceability to docs

| Checklist item | Source |
|----------------|--------|
| Profiles on register | Gap G1, Sprint plan §8.2 |
| Disclaimer version | Architecture Review MED-3, seed key |
| Port injection | Target Architecture §3.4, Coding Conventions §11.2 |
| Email / verify | Deferred — Remaining roadmap |
| Slug on lawyer profile | Domain `slug-generator`, FR public URLs |
