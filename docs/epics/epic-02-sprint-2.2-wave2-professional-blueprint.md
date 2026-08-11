# EPIC 02 — Sprint 2.2  
## Wave 2 — Professional Foundation Blueprint (Design Only)

| Field | Value |
|-------|-------|
| **Epic** | 02 — Foundation Domain |
| **Sprint** | 2.2 |
| **Wave** | 2 — Professional foundation |
| **Status** | **Design locked** (post-audit corrections) — does **not** authorize code, Prisma edits, migrations, routes, UI, or tests until a separate implementation authorization |
| **Date** | 2026-08-11 |
| **Authority** | [Master Architecture v1.0.1](../20-tore-master-architecture-v1.md) · [ADR-002](../architecture/adr-002-professional-model.md) · [ADR-005](../architecture/adr-005-lawyer-profile-compatibility.md) · [Compatibility Charter](./epic-02-sprint-2.2-compatibility-charter.md) · [Sprint 2.1 Blueprint](./epic-02-sprint-2.1-foundation-blueprint.md) |
| **Depends on** | Wave 1 Tenant foundation — Tenant is orthogonal; Wave 2 must not depend on flag-ON Tenant behavior |
| **Non-breakage** | Login · Lawyer profiles · Bookings · Marketplace · `/lawyers` · `/lawyer/*` · credential flows |
| **Implementation path (LOCKED)** | **Convention-only Professional type** — no `professional_type` column in Wave 2 |

---

## CHANGELOG (documentation)

| Date | Change |
|------|--------|
| 2026-08-11 | Initial Wave 2 Professional blueprint (design only). |
| 2026-08-11 | **Audit lock:** convention-only type path; removed ensure/create semantics; minimum shippable scope; product freeze; authz freeze; flag/write rules; no-DB-enum policy; DoD + Do/Don’t; deferred façade/column/backfill/UoW/writes. |

---

## 0. Purpose and hard constraints

### Purpose

Define a **safe, additive** implementation plan for introducing **Professional** as a thin domain alias over existing LawyerProfile data (type `LAWYER` by convention), while the live Client ↔ Lawyer marketplace continues unchanged.

### This document authorizes

- Design review and product/engineering sign-off only.

### This document does **not** authorize

- Application code  
- Prisma schema edits  
- Migrations  
- Route / URL changes  
- Marketplace or booking behavior changes  
- Organization / Membership / Active Context  
- Multi-type professionals (Advocate, Notary, …)  
- Strategy A (`ProfessionalProfile` table)  
- Any LawyerProfile **create** path owned by Wave 2  

### Constitutional rules (non-negotiable)

From Compatibility Charter + ADR-005 **Strategy B**:

1. **100% additive** — flags default **OFF**; with flags off, UX identical to today.  
2. **Do not rename or drop** `lawyer_profiles` or live `lawyer_*` junctions.  
3. **Do not change** public paths `/lawyers`, `/lawyers/[slug]`, `/lawyer/*`.  
4. **Do not change** Booking / Offering / Availability FKs (`lawyerProfileId`).  
5. **Do not remove** `User.role`.  
6. Professional in Wave 2 = **domain alias / thin view** over existing LawyerProfile persistence — **not** a parallel marketable entity.  
7. Wave 2 **MUST NEVER create** LawyerProfiles (or any profile rows). It **only maps** existing LawyerProfile data.

---

## Locked decisions (post-audit)

| # | Decision | Lock |
|---|----------|------|
| D1 | **Type representation** | **Convention-only.** Every non-deleted `LawyerProfile` **is** `Professional` with `type = LAWYER`. **No** `professional_type` (or equivalent) DB column in Wave 2. |
| D2 | **Create semantics** | **Forbidden.** No `ensure*`, no Wave 2 create/backfill of profiles. Missing LawyerProfiles remain an existing ops concern (`backfill-missing-profiles`), outside Wave 2. |
| D3 | **Minimum shippable** | Domain thin view + LAWYER-only typing + mapper + unit tests + feature flag. See § Minimum shippable scope. |
| D4 | **Deferred** | Repository façade, DB column, backfill scripts, UoW changes, any write helpers. |
| D5 | **Product freeze** | No call-site rewiring under `app/lawyers`, `app/lawyer`, booking, marketplace, lawyer-eligibility, auth. |
| D6 | **Authorization freeze** | Authz continues via `User.role`, existing lawyer eligibility, existing RBAC. **Professional is not used for authorization.** |
| D7 | **DB enum** | **None in Wave 2** (no Prisma/Postgres profession enum). Domain may expose a LAWYER-only type/constant — **not** the future Master profession list. |
| D8 | **Feature flags** | Flag required. Any future write entry point (deferred) must be isolated at **every** entry (use-case + repository). Wave 2 ships **no** write helpers. |
| D9 | **Migrate-safe SELECTs** | N/A for Wave 2 (no column). If a **later** wave adds a column, Wave 1 rules apply: omit from default selects until migrate-safe. |

---

## Wave 2 Do / Don’t

### Do

- Treat Professional as a **thin domain view** over LawyerProfile (`id` equality).  
- Keep `LawyerProfile` / `LawyerProfileRepository` as the persistence and product SoT.  
- Set `type` to `LAWYER` by **convention** in the mapper.  
- Add `TORE_FOUNDATION_PROFESSIONAL_V1` (exact `"1"`) default **OFF**.  
- Prove alias purity with unit tests (`Professional.id === LawyerProfile.id`, CLIENT → no Professional).  
- Leave register, directory, booking, credential, profile, auth paths untouched.

### Don’t

- Don’t add `professional_type` (or any profession marker column) in Wave 2.  
- Don’t create a `ProfessionalProfile` table (Strategy A).  
- Don’t create LawyerProfiles from Wave 2 code (`ensure*`, helpers, backfills).  
- Don’t ship `ProfessionalRepository`, UoW Professional port, or write helpers in Wave 2.  
- Don’t put Advocate/Notary/… on any enum/schema surface.  
- Don’t rewire product call sites or use Professional for RBAC/eligibility.  
- Don’t change URLs, booking FKs, listing gates, or `User.role`.

---

## Minimum shippable scope

### Required (Wave 2)

| Deliverable | Notes |
|-------------|--------|
| **Professional domain view** | Thin alias: at minimum `id`, `userId`, `type: LAWYER`; may reference/pass through LawyerProfile fields **without** becoming a second writable aggregate |
| **LAWYER type only** | Convention constant / single-value domain type — **no** future profession list |
| **Mapper** | `LawyerProfile → Professional` (and null when no profile) |
| **Tests** | Alias purity, flag default OFF, no create side effects, CLIENT has no Professional |
| **Feature flag** | `TORE_FOUNDATION_PROFESSIONAL_V1` via `allowFlag`; helper `isFoundationProfessionalV1Enabled()` |

### Deferred (explicitly not Wave 2)

| Item | Status |
|------|--------|
| `ProfessionalRepository` façade | Deferred |
| Profile / type **backfill** scripts | Deferred (and unnecessary under convention-only) |
| Database column (`professional_type`, etc.) | **Not chosen** — deferred to a future ADR/wave if needed |
| UoW `professionalRepository` | Deferred |
| Any **write** helpers | Deferred (and none authorized in Wave 2) |
| Product call-site adoption of Professional | Deferred to a later wave with its own charter check |

---

## 1. Current state analysis

### 1.1 What exists today (runtime)

| Layer | State |
|-------|--------|
| **Prisma** | `LawyerProfile` on `lawyer_profiles` — 1:1 with `User` via unique `userId`; slug (active partial unique); verification; listing; ratings; timezone |
| **Children** | Credentials, practice areas, languages, offerings, availability, bookings, reviews, payouts — all FK → `lawyerProfileId` |
| **Domain entity** | `LawyerProfile` (+ create/update inputs) in `src/domain/entities/profile.ts` |
| **Repository** | `LawyerProfileRepository` + `PrismaLawyerProfileRepository` |
| **Create paths (existing, out of Wave 2)** | Lawyer register → `createLawyerProfileWithUniqueSlug`; ops `backfill-missing-profiles` |
| **Marketplace / gates** | `findListed` / eligibility helpers — unchanged |
| **UoW** | `lawyerProfileRepository` present |
| **Professional** | **No** runtime type/entity/repository/flag in `src/` |
| **Wave 1 Tenant** | Orthogonal; product remains LawyerProfile-centric |

### 1.2 Vocabulary debt (accepted)

| Surface | Noun today |
|---------|------------|
| DB / Prisma / FKs | Lawyer* |
| App routes / shell | `/lawyer/*`, `/lawyers` |
| Domain / Master / ADRs | Professional (Lawyer type) |
| `User.role` | `LAWYER` (home shell) |

### 1.3 Gaps Wave 2 closes (only)

| Gap | Wave 2 response |
|-----|-----------------|
| No Professional domain noun in code | Thin view + mapper + LAWYER convention |
| No flag for future Professional adoption | `TORE_FOUNDATION_PROFESSIONAL_V1` (OFF) |

Wave 2 does **not** close multi-type, org affiliation, or persistence rename.

### 1.4 Must not move

- Listing algorithm · slug semantics · credentials · bookings · `User.role` routing · lawyer-eligibility predicates · auth/RBAC

---

## 2. Target Professional model

### 2.1 Logical model

```text
User (principal)
  └── 0..1 Professional (= LawyerProfile row, type LAWYER by convention)
        ├── credentials / offerings / availability / bookings
        │     [unchanged FKs → lawyerProfileId]
        └── (later) OrganizationMembership  [NOT Wave 2]
```

### 2.2 Thin view attributes

| Attribute | Source |
|-----------|--------|
| `id` | `LawyerProfile.id` |
| `userId` | `LawyerProfile.userId` |
| `type` | **Always** `LAWYER` (convention — **not** read from DB) |
| Optional pass-through | Prefer composing/referencing LawyerProfile over cloning a second full mutable model |

### 2.3 What Professional is **not**

- Not a new table or listing row  
- Not a second editable profile  
- Not an authz principal  
- Not Advocate/Notary/etc.  
- Not created by Wave 2  

### 2.4 Cardinality

`User` 0..1 `Professional`, identical to LawyerProfile. CLIENT → no Professional. LAWYER without a LawyerProfile → no Professional (Wave 2 does not create one).

---

## 3. Relationship with User

| Rule | Detail |
|------|--------|
| Ownership | Professional owned by exactly one User |
| Cardinality | 0..1 |
| Lookup | Via existing LawyerProfile `findByUserId` (product); mapper only when converting domain views |
| Role | `User.role = LAWYER` still drives `/lawyer/*` shell |
| Tenant | Independent of Wave 1 Tenant |
| Authz | **Not** derived from Professional |

**Forbidden:** creating Professional/LawyerProfile for CLIENT; multiple Professionals per User; authz via Professional.

---

## 4. Relationship with LawyerProfile

### 4.1 Strategy B (binding)

| Concern | Decision |
|---------|----------|
| Physical table | Keep `lawyer_profiles` |
| Domain noun | Professional (LAWYER) |
| Identity | `Professional.id === LawyerProfile.id` |
| Persistence SoT | `LawyerProfileRepository` |
| Dual-write / Strategy A | **Rejected** |
| Wave 2 schema | **No additive profession column** |

### 4.2 Child FKs

Remain on `lawyerProfileId`. Wave 2 must not retarget them.

### 4.3 Column path — explicitly rejected for Wave 2

An additive `professional_type` column is **out of Wave 2**. Revisit only via a **new ADR / later wave**. If that later wave adds a column:

- Expand-only migration  
- **Migrate-safe SELECT patterns identical to Wave 1** (omit new column from default selects until migrate-safe)  
- Idempotent backfill + fail-closed  
- DB enum = **LAWYER only** or no enum — **never** the full future profession list in that first schema step  

---

## 5. Repository design

### 5.1 Wave 2 (locked)

- **No** `ProfessionalRepository` in Wave 2.  
- **No** UoW Professional port.  
- **No** write helpers.  
- Product continues to call `LawyerProfileRepository` exclusively.

### 5.2 Future façade (deferred only)

If later introduced: thin read delegation only; **never** a second create path; directory must not reimplement `findListed`; write entry points flag-isolated at use-case **and** repository.

### 5.3 Create / ensure — forbidden in Wave 2

| Forbidden API (examples) | Reason |
|--------------------------|--------|
| `ensureLawyerProfessional` | Implies create-if-missing |
| `ensureProfessionalForUser` | Same |
| Wave 2 profile backfill | Out of scope |

Missing LawyerProfiles: existing `backfill-missing-profiles` / register paths only — **not** Wave 2.

---

## 6. Domain model

### 6.1 Types

**ProfessionalType (domain only)**

- Wave 2 exposes **`LAWYER` only** (constant or single-member type).  
- Do **not** declare Advocate/Notary/Mediator/… in Wave 2 domain enums “for later.”

**Professional (thin view)**

| Field | Notes |
|-------|--------|
| `id` | = LawyerProfile.id |
| `userId` | |
| `type` | Always LAWYER |

Prefer thin view + optional reference to LawyerProfile over cloning update/create inputs.

### 6.2 Mapping rules

1. Non-deleted LawyerProfile → Professional(LAWYER).  
2. No LawyerProfile → no Professional.  
3. Soft-deleted LawyerProfile → no live Professional.  
4. Mapper sets `type`; does not read a DB type column (none exists).

### 6.3 Invariants

| ID | Invariant |
|----|-----------|
| I1 | ≤1 live LawyerProfile / Professional per User |
| I2 | Professional.type is always LAWYER |
| I3 | Marketplace eligibility unchanged |
| I4 | Public slug identity unchanged |
| I5 | Booking.lawyerProfileId id space unchanged |
| I6 | Wave 2 never inserts/updates LawyerProfile rows |

---

## 7. Compatibility strategy

| Area | Strategy |
|------|----------|
| URLs | Unchanged |
| APIs / actions | Unchanged; no required Professional fields |
| UI copy | May remain “Lawyer” |
| DB | **No Wave 2 migration** under convention-only path |
| Domain | Alias layer only |
| Dual-write | None |
| Tests | Legacy product tests green without rewriting behavior |

Flags OFF + no product rewiring ⇒ Charter §6 must hold trivially.

---

## 8. Feature flags

| Item | Lock |
|------|------|
| Env | `TORE_FOUNDATION_PROFESSIONAL_V1` |
| Enable | Exact `"1"` via `allowFlag` |
| Default | **OFF** |
| Helper | `isFoundationProfessionalV1Enabled()` |

### What the flag means in Wave 2

Wave 2 has **no write helpers** and **no product callers**. The flag:

- Establishes the Wave 1-compatible switch for **future** adoption waves.  
- Must be tested default OFF / `"true"` does not enable.  
- Must not alter Lawyer register, listing, booking, credentials, or auth when ON or OFF (no call sites).

### Write entry isolation (mandatory if/when writes ever exist)

Any future Professional **write** entry point requires flag checks at **every** entry (use-case **and** repository), with ops `force` only where explicitly designed — same bar as Wave 1 Tenant remediation. **Not applicable to Wave 2 ship slice** because writes are deferred/forbidden.

### Interactions

- Independent of `TORE_FOUNDATION_TENANT_V1`.  
- No Org/Membership flags invented here.

---

## 9. Authorization (locked)

Wave 2 **continues** using:

- `User.role`  
- Existing lawyer eligibility (`lawyer-eligibility` and listing gates)  
- Existing RBAC  

**Professional is NOT used for authorization**, routing, or capability checks in Wave 2 (or by this blueprint’s future façade until a separate ADR says otherwise).

---

## 10. Product freeze (locked)

**No product call-site rewiring** in Wave 2.

**No changes under:**

- `src/app/lawyers/**`  
- `src/app/lawyer/**`  
- Booking use-cases / actions  
- Marketplace / public-directory use-cases / actions  
- `src/domain/services/lawyer-eligibility.ts` (and listing eligibility behavior)  
- Auth (actions, callbacks, middleware role routing, register flows’ behavior)

Wave 2 may only add **new** domain/mapper/flag/test files (and docs). It must not edit those product surfaces to “adopt” Professional.

---

## 11. Rollout plan (when implementation is later authorized)

| Step | Action | Exit |
|------|--------|------|
| 0 | Design lock (this document) | Product + eng sign-off |
| 1 | Domain thin view + LAWYER-only type + mapper + flag + unit tests | No product file changes listed in §10 |
| 2 | CI: typecheck / test / build green; legacy tests untouched in behavior | Charter §6 |
| 3 | Ship with flag **OFF** | No UX delta |
| 4 | Staging optional flag ON soak | Still no UX delta (no callers) |

**Not in rollout:** column, backfill, façade, UoW, writes, route renames, org UX.

---

## 12. Rollback plan

| Layer | Action |
|-------|--------|
| Flag | Keep / set ≠ `"1"` |
| App | Redeploy prior build if needed |
| Data | Nothing to roll back (no Wave 2 schema) |
| Product | Already on LawyerProfile paths |

No data restore required (ADR-005 / Strategy B).

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Strategy A table drift | Critical | Locked reject; DoD forbids ProfessionalProfile table |
| Premature product rewiring | Critical | §10 freeze + DoD |
| Shadow create / ensure | Critical | D2 + DoD: never create |
| Using Professional for authz | High | §9 lock |
| Dead façade repository | High | Façade deferred |
| Full profession enum creep | Medium | D7: LAWYER-only domain; no DB enum |
| Coupling to Tenant flag ON | Medium | Orthogonal |
| Column SELECT-before-migrate | N/A in Wave 2 | Deferred rule documented for later waves |

---

## 14. Files that will change (when implementation is authorized)

### Expected new (Wave 2 ship)

| Path | Purpose |
|------|---------|
| `src/domain/entities/professional.ts` (or equivalent) | Thin view |
| Domain LAWYER-only type/constant (enums or const) | No future profession list |
| `src/infrastructure/mappers/professional.mapper.ts` (or domain mapper) | LawyerProfile → Professional |
| `src/lib/feature-flags.ts` | Add Professional flag helper |
| `tests/unit/professional-foundation.test.ts` | Alias + flag tests |
| Docs links as needed | Index only |

### Explicitly must not change in Wave 2

| Area | Why |
|------|-----|
| `prisma/schema.prisma` / migrations | Convention-only — no column |
| `ProfessionalRepository` / UoW | Deferred |
| `app/lawyers/**`, `app/lawyer/**` | Product freeze |
| Booking / marketplace / eligibility / auth surfaces | Product freeze |
| LawyerProfile create/slug helpers | Out of Wave 2 ownership |

---

## 15. Wave 2 Definition of Done

Wave 2 implementation is **done** only if **all** are true:

### Compatibility

- [ ] Login / shells / directory / slug / bookings / credentials / profiles / URLs / APIs unchanged with flag OFF  
- [ ] Same checks still hold with flag ON (no product callers ⇒ no UX delta)

### Scope lock

- [ ] Strategy B only — **no** `ProfessionalProfile` table  
- [ ] **No** Prisma migration / **no** `professional_type` column  
- [ ] **No** DB profession enum  
- [ ] Domain type/constant is **LAWYER only** (no future list)  
- [ ] Thin Professional view + mapper shipped  
- [ ] Feature flag shipped, default OFF, `"true"` does not enable  
- [ ] Unit tests for alias identity + flag + “no Professional without LawyerProfile”  
- [ ] **No** `ProfessionalRepository` / UoW Professional / write helpers / ensure*  
- [ ] **No** Wave 2 creation of LawyerProfiles  
- [ ] **No** edits under `app/lawyers`, `app/lawyer`, booking, marketplace, lawyer-eligibility, auth (beyond unrelated pre-existing dirty work — Wave 2 PR must not touch them)  
- [ ] Professional **not** used for authorization  
- [ ] `npm run typecheck` / `npm test` / `npm run build` green  
- [ ] Existing booking / directory / verification tests remain green without rewriting product behavior  

### Release

- [ ] Production ships flag **OFF**  
- [ ] Rollback = flag off ± redeploy (no schema rollback)

---

## 16. Validation checklist (expanded)

Same as Definition of Done; additionally when reviewing PRs:

- [ ] PR description cites Strategy B + convention-only lock  
- [ ] Diff contains no `ensureProfessional` / profile `create` from new Professional modules  
- [ ] Diff contains no changes to listing predicates or RBAC  

---

## 17. Out of scope (reminder)

- Organization / Membership / Active Context  
- Multi-type Professionals in product  
- Booking `tenantId` cutover  
- Marketplace multi-type directory  
- `/professionals` URLs  
- LawyerProfile rename  
- Additive `professional_type` column (future ADR)  
- Repository façade / backfill / UoW / writes  
- Platform Commerce / Practice Billing / Matter / Workspace  

---

## 18. Recommendation

| Question | Answer |
|----------|--------|
| Design locked after audit? | **Yes** |
| Implementation path | **Convention-only Professional type** |
| Ready to implement? | **Only after explicit implementation authorization** |
| Risk with flag OFF | **Low** |

---

*End of Wave 2 Professional Foundation Blueprint — design locked · documentation only · no code · no Prisma · no migrations authorized by this document.*
