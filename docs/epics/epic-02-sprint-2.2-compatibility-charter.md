# EPIC 02 — Sprint 2.2  
## Compatibility Charter (Mandatory)

| Field | Value |
|-------|-------|
| **Epic** | 02 — Foundation Domain |
| **Sprint** | 2.2 — Tenant + Professional dual-path (additive) |
| **Status** | **Compatibility charter locked** — governs any future 2.2 implementation |
| **Date** | 2026-08-11 |
| **Authority** | [Master Architecture v1.0.1](../20-tore-master-architecture-v1.md) · [ADR-001](../architecture/adr-001-tenant-model.md) · [ADR-002](../architecture/adr-002-professional-model.md) · [ADR-005](../architecture/adr-005-lawyer-profile-compatibility.md) · [Sprint 2.1 Blueprint](./epic-02-sprint-2.1-foundation-blueprint.md) |
| **This document** | Does **not** by itself authorize implementation. When implementation is authorized, these rules are **non-negotiable**. |

---

## 1. Constitutional rule for Sprint 2.2

**Sprint 2.2 must be 100% additive.**

Nothing currently working may break.

Existing users must continue using TORE **exactly as before**.

---

## 2. Hard prohibitions (must not)

| # | Prohibition |
|---|-------------|
| P1 | **No existing URL changes** — `/`, `/lawyers`, `/lawyers/[slug]`, `/client/*`, `/lawyer/*`, `/admin/*`, `/login`, `/register/*`, `/api/*` paths remain. |
| P2 | **No existing booking flow changes** — create / accept / decline / list behavior and FKs (`clientUserId`, `lawyerProfileId`) unchanged. |
| P3 | **No existing marketplace behavior changes** — listing gates, search filters, public profile eligibility unchanged. |
| P4 | **No existing lawyer profile removal** — no drop, rename, or destructive rewrite of `lawyer_profiles` or related live rows. |
| P5 | **No destructive migrations** — no `DROP`, no mandatory data rewrite that can fail mid-flight and strand users. |
| P6 | **No breaking Prisma migration** — only additive schema (new tables and/or nullable columns with safe defaults). |
| P7 | **No breaking API** — existing server actions / responses keep prior contracts; new APIs behind flags or additive optional fields only. |
| P8 | **No removal of `User.role`** — remains source of home-shell routing during Sprint 2.2. |
| P9 | **No forced Active Context / org UX** — feature flags default **off** in production until explicitly enabled. |
| P10 | **No Organization / Membership product surface** in Sprint 2.2 — those belong to 2.3+ (schema prep only if strictly additive and unused). |

---

## 3. Hard requirements (must)

| # | Requirement |
|---|-------------|
| R1 | **Backward compatibility is mandatory** for login, profiles, bookings, marketplace, notifications, admin credential review. |
| R2 | Existing users (CLIENT / LAWYER / ADMIN) keep the same day-1 UX with flags off. |
| R3 | Any Tenant / Professional-alias work is **invisible** when flags are off. |
| R4 | Migrations are **expand-only**: create new tables; add nullable FKs; backfill is idempotent and restartable. |
| R5 | Rollback = turn flags off + redeploy prior app build if needed; data left in additive tables is acceptable residue. |
| R6 | Follow **ADR-005 Strategy B**: LawyerProfile table stays; Professional is domain alias only in 2.2. |
| R7 | Follow **ADR-001**: personal Tenant backfill does not alter booking or listing queries. |
| R8 | CI: existing unit tests for bookings, directory eligibility, auth, verification must remain green without rewriting product behavior. |

---

## 4. Allowed scope (additive only)

When implementation is authorized, Sprint 2.2 **may** only:

1. Add `Tenant` (or equivalent) table and create **personal** tenants.  
2. Backfill `User.personalTenantId` (nullable → populated) without changing role/email/password.  
3. Optionally add nullable marker columns on `lawyer_profiles` (e.g. professional type default LAWYER) that are unused by live UI.  
4. Introduce domain ports/aliases that **delegate** to existing LawyerProfile repositories.  
5. Ship feature flags defaulting to **off**.  
6. Add focused tests that prove **legacy paths unchanged** + backfill idempotency.

Anything else is out of sprint.

---

## 5. Explicit non-goals (Sprint 2.2)

- Organization / Membership UI or create APIs (Sprint 2.3)  
- Active Context switcher (Sprint 2.4)  
- Booking `tenantId` FK cutover  
- Marketplace multi-type directory  
- Route renames (`/professionals`, `/firm`, …)  
- Dropping or renaming LawyerProfile  
- Changing verification or listing algorithms  
- Platform Commerce / Practice Billing / Matter / Workspace product  

---

## 6. Acceptance criteria (compatibility)

Sprint 2.2 is acceptable **only if** all of the following hold with production flags **off**:

| Check | Pass condition |
|-------|----------------|
| Login | Existing users sign in; JWT/session role/status behavior unchanged |
| Client shell | `/client/*` same access rules |
| Lawyer shell | `/lawyer/*` same access rules |
| Public directory | Same lawyers appear/disappear under same gates |
| Lawyer slug pages | Same 404/list rules |
| Bookings | Client request + lawyer accept/decline unchanged |
| Credentials | Submit + admin review unchanged |
| Profiles | Client/lawyer profile edit unchanged |
| URLs | Zero path renames |
| APIs | Existing action contracts unchanged |

With flags **on** (staging only until approved): additive Tenant reads may be exercised **without** changing the checks above for users who never opt into new surfaces (there are no new surfaces in 2.2 UX).

---

## 7. Migration policy (Sprint 2.2)

```text
ALLOWED
  CREATE TABLE …
  ADD COLUMN … NULL
  ADD INDEX …
  Idempotent backfill UPDATE … WHERE col IS NULL

FORBIDDEN
  DROP TABLE / DROP COLUMN
  RENAME TABLE / RENAME COLUMN used by live app
  NOT NULL without proven backfill on all rows first + expand/contract window
  Changing Booking / Offering / Availability FK targets
  Data deletes of lawyer_profiles / bookings / users
```

---

## 8. Sign-off

| Role | Affirms |
|------|---------|
| Product | Existing user experience remains identical with flags off |
| Engineering | Migrations and PRs reviewed against P1–P10 / R1–R8 |
| Release | Flags default off; rollback playbook known |

---

*End of Sprint 2.2 Compatibility Charter*
