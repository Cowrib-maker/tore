# Sprint 2 — Implementation Checklist

| Field | Value |
|-------|-------|
| Sprint | 2 — Profiles & onboarding |
| Goal | Every user has a role profile; email verification gated for marketplace actions |
| Exit criteria | Profiles on register; disclaimer stored; profile update capability; unverified users blocked from book/payout paths; email verify + password reset wired |

---

## Clean Architecture rules (every milestone)

- [ ] Use-cases depend on domain ports only (no new Prisma / concrete repo imports)
- [ ] Prisma only in `infrastructure/`
- [ ] Server Actions wire adapters (composition root)
- [ ] Domain stays free of Next.js / Auth.js / Prisma
- [ ] Lint + typecheck + build green before requesting next milestone

---

## Milestone 1 — Profile repos + register creates profiles (THIS MILESTONE)

**Scope**

- [ ] Implement `PrismaClientProfileRepository` + mapper
- [ ] Implement `PrismaLawyerProfileRepository` + mapper (`slugExists`, create, find*)
- [ ] Refactor `registerClientUseCase` / `registerLawyerUseCase` to **port injection**
- [ ] On register: create `ClientProfile` or `LawyerProfile` (lawyer slug via domain `slug-generator`)
- [ ] Load `marketplace_disclaimer_version` and record disclaimer acceptance with correct version
- [ ] Wire composition root in `auth.actions.ts`
- [ ] Unit tests for `slug-generator` (validation / slug logic)
- [ ] lint · typecheck · build

**Out of scope for M1:** profile settings UI, email adapter, verify-email pages, forgot-password backend, backfill script, dashboard enrichment

**Suggested commit (when requested):** `feat(auth): create profiles on register via injected repositories`

---

## Milestone 2 — Backfill orphan users + Vitest harness completeness

- [ ] Script/use-case: backfill missing Client/Lawyer profiles for existing users
- [ ] Expand domain unit tests (fee/cancellation/state-machine per testing strategy) as capacity allows
- [ ] lint · typecheck · build

---

## Milestone 3 — Profile settings UI + richer dashboards

- [ ] Client/lawyer profile update use-cases + validators + Server Actions
- [ ] Settings pages under `/client/profile`, `/lawyer/profile`
- [ ] Dashboards show profile / verification status signals
- [ ] lint · typecheck · build

---

## Milestone 4 — Email port + verify-email + password reset

- [ ] `EmailSender` port + console adapter
- [ ] Verification token flow + `/verify-email` page
- [ ] Forgot-password + reset flow (replace UI placeholder)
- [ ] Gate: unverified users blocked from booking/payout paths (helpers ready even if booking UI absent)
- [ ] lint · typecheck · build

---

## Milestone 5 — Sprint 2 hardening / DoD

- [ ] Audit coverage for profile create/update
- [ ] Register forms still accept terms (disclaimer covered by bundle)
- [ ] Stakeholder demo checklist
- [ ] Update `docs/sprints/sprint-2-milestones.md` completion
- [ ] lint · typecheck · build

---

## Traceability to docs

| Checklist item | Source |
|----------------|--------|
| Profiles on register | Gap G1, Sprint plan §8.2 |
| Disclaimer version | Architecture Review MED-3, seed key |
| Port injection | Target Architecture §3.4, Coding Conventions §11.2 |
| Email / verify | Sprint plan §8.2, FR-AUTH |
| Slug on lawyer profile | Domain `slug-generator`, FR public URLs |
