# Sprint 2.2 Wave 1 — Critical Implementation Audit

| Field | Value |
|-------|-------|
| **Subject** | Tenant foundation (Wave 1) |
| **Date** | 2026-08-11 |
| **Remediation audit** | 2026-08-11 (post-fix) |
| **Mode** | Adversarial |
| **Checked against** | Master Architecture v1.0.1 · ADR-001 · Sprint 2.2 Compatibility Charter |
| **Overall (pre-remediation)** | **CONDITIONAL PASS** |
| **Overall (post-remediation)** | **PASS** for merge with flag OFF; backfill / flag ON after migrate |

Verdict scale: **PASS** | **WARNING** | **FAIL**

---

## Executive result (post-remediation)

| Area | Result |
|------|--------|
| Prisma migration safety | **PASS** (idempotent enums/table/indexes; `updated_at` DEFAULT) |
| Foreign key behaviors | **WARNING** (soft-delete hygiene only) |
| Unique constraints | **PASS** |
| Indexes | **PASS** |
| Repository correctness | **PASS** (transactional ensure + concurrent link race handled) |
| Feature flag isolation | **PASS** (use-case + repository gate; `force` for ops) |
| Dead code | **PASS** (Wave 1 dead APIs removed) |
| Hidden breaking changes | **PASS** (default `userSelect` omits `personal_tenant_id`) |
| Performance impact | **PASS** (Wave 1, flag off) |
| Production deployment risks | **PASS** for app-before-migrate on login paths; migrate still required before ensure/backfill/flag ON |

**Compatibility charter (flags OFF, no backfill):** existing login/booking/marketplace/LawyerProfile/URLs — **PASS**.

---

## Remediation map (Wave 1 audit → fix)

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | App deploy before migrate broke all user SELECTs | P0 | `userSelect` omits `personalTenantId`; mapper defaults to `null` |
| 2 | Non-transactional ensure → orphans / races | P0 | Interactive `$transaction` (or reuse UoW tx) + conditional `updateMany` + orphan delete on race lose |
| 3 | Flag only at use-case | P1 | Repository `assertProvisioningAllowed`; use case passes `{ force }` |
| 4 | Backfill could silently leave users | P1 | Post-loop `list…(1)`; throw if any remain |
| 5 | Dead Wave 1 APIs | P1 | Removed `setPersonalTenantId`, `countByKind`, public `create`, unused `CreateTenantInput` |
| 6 | Migration non-idempotent / no `updated_at` default | P1 | `DO $$ … EXCEPTION duplicate_object`; `CREATE TABLE IF NOT EXISTS`; `updated_at DEFAULT CURRENT_TIMESTAMP`; index `IF NOT EXISTS` |

---

## Remaining warnings (acceptable for merge)

1. **Soft-deleted / dangling personal tenant rewrite:** if `personalTenantId` points at a missing/soft-deleted tenant, ensure creates a new row and relinks; old row may remain. Hygiene only; no product callers yet.
2. **In-place migration edit:** `20260811130000_foundation_tenant_v1` was hardened in place. If any environment already applied the *old* checksum, Prisma migrate will complain — repair with `prisma migrate resolve` / manual SQL DEFAULT / ops note before re-deploying migrate history.
3. **Ops paths still require migrate first:** `ensure` / backfill / `listUserIdsMissingPersonalTenant` SELECT/UPDATE `personal_tenant_id` and `tenants`. Do not run backfill or set `TORE_FOUNDATION_TENANT_V1=1` until migrate succeeds.
4. **Exactly-one org ownership** still deferred (Organization wave) — out of Wave 1 scope.
5. **`User.personalTenantId` on domain entity** stays (ADR-001); default product reads always map `null` until a later wave selects the column intentionally.

---

## Migration safety

| Question | Answer |
|----------|--------|
| Additive / non-destructive? | **Yes** |
| Safe re-run of enum/table/index DDL? | **Yes** (partial-apply friendly) |
| App login without migrate? | **Yes** (column not in default user SELECT) |
| Flag ON / backfill without migrate? | **No** — will fail closed at DB |
| Deploy order | Migrate before flag ON / backfill; app may roll before or after migrate |

---

## Rollback strategy

1. **Flag:** keep / set `TORE_FOUNDATION_TENANT_V1` ≠ `1` (product provisioning stays off).
2. **App:** revert Wave 1 code; login does not depend on `personal_tenant_id` SELECT.
3. **Data (optional):** leave `tenants` / `personal_tenant_id` in place (additive; harmless with flag off). Full DDL rollback only if required: drop FK/index/column → drop `tenants` → drop enums (destructive; avoid in shared envs with linked rows).
4. **Backfill:** idempotent; stop process; re-run after raising `maxBatches` if incomplete throw occurs.

---

## Validation (remediation)

- `npm run typecheck` — pass
- `npm test` — 92 pass
- `npm run build` — pass

---

## Final recommendation

**READY TO MERGE** — with flag OFF; no Organization / Membership / Professional / marketplace wiring; enable flag and mass backfill only after migrate in the target environment.

---

## Original audit detail (pre-remediation, retained)

> The sections below document the first adversarial pass. See **Remediation map** for current status.

### 1. Prisma migration safety (original)

- Additive only: new enums, new `tenants` table, nullable `users.personal_tenant_id`.
- Originally WARNING: bare `CREATE TYPE`; no `updated_at` DEFAULT; code always selected `personal_tenant_id`.

### 2. Repository (original)

- Non-transactional ensure; race orphans; unused `setPersonalTenantId`.

### 3. Feature flag (original)

- Use-case only; repo bypass.

### 4. Dead code (original)

- `setPersonalTenantId`, `countByKind`, vestigial create paths.

### Bottom line (original)

| Question | Answer (then) |
|----------|----------------|
| Charter-compatible with flag OFF? | **PASS** |
| Safe to enable flag / force backfill at scale? | **Not yet** |
| Block production traffic on new build without migrate? | **Yes — FAIL** |

Post-remediation: app-without-migrate login **PASS**; flag/backfill still require migrate.
