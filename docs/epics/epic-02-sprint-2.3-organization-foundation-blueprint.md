# EPIC 02 — Sprint 2.3  
## Organization Foundation Blueprint (Design Only)

| Field | Value |
|-------|-------|
| **Epic** | 02 — Foundation Domain |
| **Sprint** | 2.3 — Organization Foundation |
| **Status** | **Design locked** (post-audit corrections) — does **not** authorize code, Prisma edits, migrations, routes, UI, or tests until a separate implementation authorization |
| **Date** | 2026-08-11 |
| **Authority** | [Master Architecture v1.0.1](../20-tore-master-architecture-v1.md) · [ADR-003](../architecture/adr-003-organization-model.md) · [ADR-001](../architecture/adr-001-tenant-model.md) · [ADR-004](../architecture/adr-004-membership-model.md) · [Sprint 2.2 Compatibility Charter](./epic-02-sprint-2.2-compatibility-charter.md) · [Sprint 2.1 Blueprint](./epic-02-sprint-2.1-foundation-blueprint.md) |
| **Depends on** | Wave 1 Tenant foundation (`TenantKind.ORGANIZATION` already exists) · Wave 2 Professional alias (orthogonal — org ≠ Professional) |
| **Non-breakage** | Login · Lawyer profiles · Bookings · Marketplace · `/lawyers` · `/lawyer/*` · `/client/*` · credential flows · `User.role` |

---

## CHANGELOG (documentation)

| Date | Change |
|------|--------|
| 2026-08-11 | Initial Sprint 2.3 Organization Foundation blueprint (design only). |
| 2026-08-11 | **Audit lock:** create authz matrix; last ACTIVE OWNER invariant; Tenant lifecycle + `onDelete=RESTRICT`; omit slug; internal Tenant create independent of `TORE_FOUNDATION_TENANT_V1`; one membership row + status transitions; immutable org type; no RBAC/`requireActor` integration; founding-OWNER-only membership repo; DoD freezes; name policy (no uniqueness/normalization). |

---

## 0. Purpose and hard constraints

### Purpose

Define a **100% additive** plan to introduce the **Organization** aggregate (Law Firm + Legal Entity only), each paired with **exactly one** `Tenant` of kind `ORGANIZATION`, without changing live Client ↔ Lawyer marketplace behavior.

### This document authorizes

- Design review and product/engineering sign-off only.

### This document does **not** authorize

- Application code · Prisma · migrations · routes · UI · marketplace changes  
- Government / NGO / University create paths  
- Active Context switcher (Sprint 2.4)  
- Workspace / Matter / AI / Platform Commerce  
- Auto-migration of `ClientProfile.companyName` into Legal Entity  
- RBAC / `requireActor` membership wiring  
- Firm Directory / public org URLs  

### Constitutional rules

1. **100% additive** — feature flags default **OFF**; with flags off, UX identical to today.  
2. Preserve Compatibility Charter spirit for marketplace: **no** URL, booking FK, listing-gate, or LawyerProfile breakage.  
3. **Law Firm ≠ LawyerProfile**; **Legal Entity ≠ `companyName`**.  
4. Each Organization has **exactly one** Tenant (`Organization.tenantId` unique) — ADR-001 / ADR-003.  
5. Organizations are created **explicitly** — never auto-created from `companyName`.  
6. Soft-delete / status preferred over hard delete when memberships exist.  
7. Learn from Wave 1: transactional org+tenant create; fail-closed ops; **new tables only** — do not join org tables into hot User/session selects.

---

## Locked decisions (post-audit)

| # | Decision | Lock |
|---|----------|------|
| D1 | **Types writable** | `LAW_FIRM` · `LEGAL_ENTITY` **only**. No Government/NGO/University in DB enum or writers. |
| D2 | **Tenant pairing** | Create Organization **and** Tenant(`ORGANIZATION`) in **one transaction**. `tenantId` UNIQUE NOT NULL after create. |
| D3 | **Founding seat** | Org create atomically inserts founding **OWNER** `OrganizationMembership` (`status=ACTIVE`). Orphan orgs without OWNER are forbidden. |
| D4 | **Membership product** | Invite / accept / revoke / role-change **APIs and UX** are **out**. Schema exists for founding OWNER only in this foundation. |
| D5 | **Marketplace** | Zero changes to directory, slug pages, booking FKs, eligibility, LawyerProfile persistence. |
| D6 | **Authz freeze** | **No** RBAC changes; **no** `requireActor` membership integration in Sprint 2.3. Hot paths stay on `User.role` + existing eligibility. |
| D7 | **Flag** | `TORE_FOUNDATION_ORGS_V1` exact `"1"`; default OFF. Gates org create and founding membership write. |
| D8 | **Schema shape** | New tables only (`organizations`, `organization_memberships`). No renames of lawyer/booking tables. |
| D9 | **companyName** | Remains; no backfill to Legal Entity. |
| D10 | **Create authorization** | See **§ Create authorization matrix** (locked). |
| D11 | **Last ACTIVE OWNER** | See **§ Last ACTIVE OWNER invariant** (locked). |
| D12 | **Tenant lifecycle** | See **§ Tenant lifecycle** (locked). |
| D13 | **FK `onDelete`** | `Organization.tenantId` → `tenants.id` = **`RESTRICT`**. |
| D14 | **Slug** | **Omitted entirely** from Sprint 2.3 schema. Firm Directory chooses slug later. |
| D15 | **Tenant insert** | **Internal only** to org create (UoW / private helper). **Independent** of `TORE_FOUNDATION_TENANT_V1`. Must **not** revive unconstrained product `Tenant.create`. |
| D16 | **Membership row model** | **Exactly one row** per `(organizationId, userId)`. Status transitions only (no second row for re-invite). |
| D17 | **Type immutability** | `Organization.type` is **immutable** after create. |
| D18 | **Membership repository surface** | **Founding OWNER create only** for this ship. No invite/role/revoke methods in the Foundation port. |
| D19 | **Name policy** | See **§ Organization name policy** (locked). |
| D20 | **Flag independence** | Org foundation must **not** depend on `TORE_FOUNDATION_TENANT_V1` or `TORE_FOUNDATION_PROFESSIONAL_V1`. |

---

## Create authorization matrix (locked)

Org create is allowed **only** when `TORE_FOUNDATION_ORGS_V1=1` **and** the actor matches:

| Actor (`User.role`) | May create `LAW_FIRM`? | May create `LEGAL_ENTITY`? | Notes |
|---------------------|------------------------|----------------------------|--------|
| **ADMIN** | **Yes** | **Yes** | Platform capability; may designate founding OWNER = self **or** another existing User id (admin-only option). |
| **LAWYER** | **Yes** | **No** | Founding OWNER = self only. |
| **CLIENT** | **No** | **Yes** | Founding OWNER = self only. |

**Forbidden:**

- Creating orgs with flag OFF (except future ops `force` if explicitly designed — default: none in 2.3).  
- CLIENT creating `LAW_FIRM`.  
- LAWYER creating `LEGAL_ENTITY`.  
- Non-ADMIN designating a different founding OWNER.  
- Creating org without an authenticated actor.  
- Using Membership or org Tenant for marketplace/booking authz.

Sprint 2.3 ships **no UI**; if a dark/server API is authorized later, it **must** enforce this matrix before write.

---

## Last ACTIVE OWNER invariant (locked)

| Rule | Detail |
|------|--------|
| **O3a** | While `Organization.status = ACTIVE` and `deletedAt IS NULL`, there must exist **≥1** membership with `orgRole=OWNER` and `status=ACTIVE`. |
| **O3b** | Create path establishes O3a via founding OWNER. |
| **O3c** | This foundation **does not expose** revoke/role-change APIs. Any future revoke **must refuse** removing the last ACTIVE OWNER while the org remains ACTIVE. |
| **O3d** | To retire an org: set Organization to `DEACTIVATED` or soft-delete **and** apply Tenant lifecycle (§ below); only then may OWNER seats be cleared/revoked in a later wave. |

---

## Tenant lifecycle (locked)

| Event | Required Tenant effect |
|-------|------------------------|
| Org create | Insert `Tenant(kind=ORGANIZATION, status=ACTIVE)` in same TX; link `Organization.tenantId`. |
| Org `SUSPENDED` | Paired Tenant → `SUSPENDED` (same TX / use-case). |
| Org `DEACTIVATED` or soft-delete (`deletedAt` set) | Paired Tenant → soft-delete **or** `DEACTIVATED` (same TX). Prefer soft-delete Tenant for symmetry with Wave 1 Tenant model. |
| Org reactivation (future) | Requires explicit later ADR; **out of Sprint 2.3**. |

**Forbidden:**

- Reusing a User’s **personal** (`INDIVIDUAL`) Tenant as an org Tenant.  
- Leaving an `ACTIVE` `ORGANIZATION` Tenant after org soft-delete/deactivate.  
- Hard-deleting Tenant while Organization row still references it (enforced by **RESTRICT**).  
- Cascading User deletion from Organization/Tenant.

**FK:** `Organization.tenantId` → `tenants.id` **`ON DELETE RESTRICT`** (D13).

---

## Organization name policy (locked)

| Rule | Lock |
|------|------|
| Uniqueness | **No** uniqueness enforcement on `name` in Sprint 2.3 |
| Normalization | **No** case-folding / slugify / trim-to-canonical required by schema (trim for UX is optional at use-case; not a uniqueness key) |
| Firm Directory | Display/collision policy and public identifiers are a **future Firm Directory** decision (separate ADR/epic) |
| Slug | **Not present** in Sprint 2.3 (D14) |

Duplicate names are allowed; operators/admins disambiguate by `id` until Directory ships.

---

## Sprint 2.3 Do / Don’t

### Do

- Add `organizations` + `organization_memberships` behind flag.  
- Transactionally create Tenant(`ORGANIZATION`) + Organization + founding OWNER membership.  
- Enforce create authorization matrix.  
- Keep marketplace / booking / auth home-shell untouched.  
- Soft-delete Org with paired Tenant lifecycle.

### Don’t

- Don’t add `slug` column.  
- Don’t auto-create from `companyName`.  
- Don’t wire Membership into `requireActor` / RBAC / eligibility.  
- Don’t join org tables into User/session hot paths.  
- Don’t require Tenant or Professional flags.  
- Don’t expose invite / role-change / revoke repository methods.  
- Don’t change org `type` after create.  
- Don’t ship Government types, Active Context, or Firm Directory.

---

## 1. Current state

| Layer | State |
|-------|--------|
| **Organization** | **None** |
| **Membership** | **None** |
| **Tenant** | Wave 1 present; `TenantKind.ORGANIZATION` exists; personal tenants under Tenant flag |
| **SME approximation** | `ClientProfile.companyName` |
| **Supply** | Individual LawyerProfile / Professional alias |
| **Marketplace / bookings** | User + LawyerProfile; no `organizationId` |
| **Auth** | `User.role` |

---

## 2. Target architecture

```text
User (principal)
  ├── personal Tenant (INDIVIDUAL)          [Wave 1 — orthogonal]
  ├── Professional? (LawyerProfile alias)   [Wave 2 — orthogonal]
  └── OrganizationMembership (founding OWNER at create)
        └── Organization (LAW_FIRM | LEGAL_ENTITY)
              └── Tenant (kind=ORGANIZATION)   [exactly one; RESTRICT FK]
```

**Marketplace (unchanged):**

```text
Booking.clientUserId → User
Booking.lawyerProfileId → LawyerProfile
Public directory → LawyerProfile gates
```

---

## 3. Organization aggregate

### 3.1 Attributes (logical — Sprint 2.3)

| Field | Notes |
|-------|--------|
| `id` | cuid |
| `type` | `LAW_FIRM` \| `LEGAL_ENTITY` — **immutable** after create |
| `name` | Display string; **no** uniqueness / normalization (see name policy) |
| `status` | `ACTIVE` \| `SUSPENDED` \| `DEACTIVATED` |
| `tenantId` | UNIQUE NOT NULL FK → `tenants.id` **ON DELETE RESTRICT** |
| `deletedAt` | Soft delete |
| timestamps | `createdAt` / `updatedAt` (SQL DEFAULT on `updated_at`) |

**Not included:** `slug`.

### 3.2 Invariants

| ID | Invariant |
|----|-----------|
| O1 | `type ∈ {LAW_FIRM, LEGAL_ENTITY}` and immutable |
| O2 | Exactly one Tenant; `kind=ORGANIZATION`; FK RESTRICT |
| O3 | Last ACTIVE OWNER rules O3a–O3d |
| O4 | Soft-deleted / DEACTIVATED org: no new founding creates; paired Tenant lifecycle applied |
| O5 | User delete must not cascade-delete Organizations |

### 3.3 Create sequence (single transaction)

1. Authorize actor per **create authorization matrix**.  
2. Insert `Tenant(kind=ORGANIZATION, status=ACTIVE)` via **internal** helper (not public Tenant product API; **not** gated by `TORE_FOUNDATION_TENANT_V1`).  
3. Insert `Organization(type, name, status=ACTIVE, tenantId)`.  
4. Insert `OrganizationMembership(organizationId, userId, orgRole=OWNER, status=ACTIVE)`.  
5. Commit — or roll back entirely.

---

## 4. Domain model

### 4.1 Enums

**OrganizationType:** `LAW_FIRM` · `LEGAL_ENTITY` only  

**OrganizationStatus:** `ACTIVE` · `SUSPENDED` · `DEACTIVATED`  

**MembershipStatus** (row retained forever per pair): at minimum `ACTIVE` for founding; other values (`INVITED` / `REVOKED` / `SUSPENDED`) may exist for later waves but **Foundation writers only create ACTIVE OWNER**.  

**OrgRole:** `OWNER` · `ADMIN` · `MEMBER` may exist as enum for forward-compat; **Foundation writers only write OWNER**.

### 4.2 OrganizationMembership

| Field | Notes |
|-------|--------|
| `id` | |
| `organizationId` | |
| `userId` | |
| `orgRole` | Foundation: `OWNER` only |
| `status` | Foundation: `ACTIVE` only on insert |
| unique | `(organizationId, userId)` — **one row**; later invites = status transition on same row |

### 4.3 Mapping

| Existing | Relation |
|----------|----------|
| User | Membership 0..n (foundation: founding seat only) |
| Tenant | 1:1 org tenant |
| LawyerProfile / Professional | Unchanged |
| ClientProfile.companyName | Unrelated |
| Booking | Unchanged |

---

## 5. Repository design

### 5.1 OrganizationRepository

| Method | Notes |
|--------|--------|
| `findById` / `findByTenantId` | Soft-deleted excluded by default |
| `create` | **Only** from `createOrganization` use-case inside UoW TX with Tenant + founding membership |
| `update` | Name/status only; **never** type |
| Soft-delete / status | Must apply Tenant lifecycle |

### 5.2 OrganizationMembershipRepository (narrow — locked)

| Allowed | Forbidden in Sprint 2.3 Foundation |
|---------|-------------------------------------|
| `createFoundingOwner(organizationId, userId)` (or equivalent single method) | `invite`, `accept`, `revoke`, `updateRole`, `list*` **product** methods |
| | Any write that creates non-OWNER or non-ACTIVE seats |

Reads may exist for tests/invariants; **no** product call sites.

### 5.3 Tenant insert

- **Private** to org foundation (UoW / `createOrganization` / internal tenant writer).  
- Independent of `isFoundationTenantV1Enabled()`.  
- Must not expose unconstrained `Tenant.create(ORGANIZATION)` on the public TenantRepository product surface.

### 5.4 UoW

Add organization (+ narrow membership) repos for transactional create only. Do not alter booking/register UoW usage beyond wiring new repos.

---

## 6. Compatibility guarantees

| Guarantee | Requirement |
|-----------|-------------|
| Login / session | Unchanged; **no** org joins on session User loads |
| Shells / marketplace / bookings | Unchanged FKs and gates |
| Auth | **No** `requireActor` / RBAC membership integration |
| APIs | Existing contracts unchanged; new org create behind flag + matrix |
| Flags | No dependence on Tenant or Professional flags |

---

## 7. Feature flag strategy

| Item | Lock |
|------|------|
| Env | `TORE_FOUNDATION_ORGS_V1` |
| Enable | Exact `"1"` |
| Default | **OFF** |
| Helper | `isFoundationOrgsV1Enabled()` |

Write isolation at **use-case and repository** for org create + founding OWNER.  

**Independence:** works with Tenant flag OFF and Professional flag OFF (D20).

---

## 8. Rollout

| Step | Action | Exit |
|------|--------|------|
| 0 | Design lock accepted | This document |
| 1 | Additive migration: orgs + memberships; **no slug**; FK RESTRICT; enums LAW_FIRM/LEGAL_ENTITY only | Migrate before SELECT |
| 2 | Domain + narrow repos + flag + tests | No marketplace/auth rewiring |
| 3 | `createOrganization` (matrix + TX + lifecycle helpers) | Flag OFF → Forbidden / no-op |
| 4 | Staging flag ON soak | Marketplace UX unchanged for non-callers |
| 5 | Production flag **OFF** | Rollback = flag off |

---

## 9. Rollback

| Layer | Action |
|-------|--------|
| Flag | ≠ `"1"` |
| App | Redeploy if needed |
| Data | Leave org/membership/org-tenant rows; inert for marketplace |
| Users | No cascade delete |

---

## 10. Risks (post-lock mitigations)

| Risk | Mitigation |
|------|------------|
| Orphan / ACTIVE Tenant after org death | Tenant lifecycle lock |
| Last OWNER revoked | O3 + no revoke API in foundation |
| Authz hole on dark create | Create authorization matrix |
| Tenant flag coupling | D15 / D20 |
| Premature membership API surface | D18 founding-only repo |
| Slug / directory churn | D14 omit slug; name policy |
| Session/hot-path breakage | No user/session joins DoD |

---

## 11. Files expected (when implementation authorized)

### Likely new

- Migration `foundation_organization_v1` (orgs + memberships; no slug)  
- Domain entities + enums  
- Organization repository + **narrow** founding-owner membership port/adapter  
- Internal org-tenant writer  
- `createOrganization` use-case  
- Feature flag helper  
- Unit tests (matrix, TX invariants, flag independence, type immutability)

### Must not change

- `app/lawyers/**`, `app/lawyer/**`, `app/client/**`  
- Booking / marketplace / eligibility  
- `requireActor` membership awareness  
- LawyerProfile listing/create semantics  

---

## 12. Validation checklist

### Compatibility (flag OFF)

- [ ] Login / shells / directory / bookings / credentials / profiles / URLs / APIs unchanged  
- [ ] `User.role` routing unchanged  

### Foundation

- [ ] Only LAW_FIRM / LEGAL_ENTITY; type immutable  
- [ ] No slug column  
- [ ] `tenantId` FK **RESTRICT**  
- [ ] TX: Tenant + Org + founding OWNER  
- [ ] Create matrix enforced  
- [ ] Last OWNER rules documented; no revoke API shipped  
- [ ] Tenant lifecycle on suspend/deactivate/soft-delete  
- [ ] Membership: one row per (org,user); founding ACTIVE OWNER only  
- [ ] Flag default OFF; write isolation dual entry  
- [ ] Independent of Tenant + Professional flags  
- [ ] No `companyName` backfill  
- [ ] No user/session joins to org tables  
- [ ] No marketplace / booking / auth rewiring  
- [ ] Name: no uniqueness / no normalization requirement  
- [ ] typecheck / test / build green; legacy product tests green  

---

## 13. Definition of Done

Organization Foundation is **done** only if **all** hold:

- [ ] Locks D1–D20 respected  
- [ ] Additive schema only; **no slug**  
- [ ] `Organization.tenantId` **ON DELETE RESTRICT**  
- [ ] Flag `TORE_FOUNDATION_ORGS_V1` default OFF  
- [ ] Transactional create with founding OWNER + create matrix  
- [ ] Tenant insert internal + **independent** of Tenant/Professional flags  
- [ ] Membership repository = founding OWNER only  
- [ ] **No** user/session joins to org tables  
- [ ] **No** marketplace rewiring  
- [ ] **No** booking rewiring  
- [ ] **No** auth rewiring (`requireActor` / RBAC / eligibility unchanged)  
- [ ] **No** dependence on `TORE_FOUNDATION_TENANT_V1` or `TORE_FOUNDATION_PROFESSIONAL_V1`  
- [ ] No UI / Active Context / Firm Directory required  
- [ ] Validation checklist green  
- [ ] Rollback = flag off ± redeploy; data residue OK  

---

## 14. Out of scope

- Active Context (2.4) · Invite UX (2.5) · Firm Directory / slug  
- Booking tenant/org payer cutover · Government types  
- Workspace / Matter / AI / Practice Billing / Platform Commerce  
- `companyName` migration · RBAC/`requireActor` membership  
- Membership invite/revoke/role repository APIs  

---

## 15. Later waves (pointer)

| Concern | Where |
|---------|--------|
| Invite / accept / revoke / last-OWNER-safe role changes | Sprint 2.3 Wave B / 2.5 |
| Active Context | Sprint 2.4 |
| Firm Directory (slug, uniqueness UX) | Future ADR |
| Org reactivation after soft-delete | Future ADR |

---

## 16. Recommendation

| Question | Answer |
|----------|--------|
| Design locked after audit? | **Yes** |
| Implementation authorized by this doc? | **No** |
| Marketplace risk if built as locked? | **Low** with flag OFF |

**Next gated step:** explicit implementation authorization for Sprint 2.3 Organization Foundation.

---

*End of Sprint 2.3 Organization Foundation Blueprint — design locked · documentation only · no code · no Prisma · no migrations authorized by this document.*
