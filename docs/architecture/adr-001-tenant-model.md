# ADR-001 — Tenant model

| Field | Value |
|-------|-------|
| **ADR** | 001 |
| **Title** | Tenant model |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Epic** | 02 — Foundation Domain |
| **Authority** | Master Architecture v1.0.1 §4.6, P7 |
| **Supersedes** | — |

---

## Context

TORE is evolving from a single-user-role marketplace (Client ↔ Lawyer) into a multi-party Legal Operating Platform. Future Workspaces, Matters, documents, AI corpora, and Practice Billing require a clear isolation boundary.

Master Architecture v1.0.1 requires:

- Every multi-tenant resource ultimately belongs to **exactly one tenant** (`tenant_id`).
- Individuals, Law Firms, and Legal Entities become tenants in defined ways.
- Cross-party engagements (client + provider) must not create dual ownership of Matter corpora.

Without a frozen tenant model, Sprint 2.2+ risks inventing multiple incompatible isolation keys (orgId vs workspaceId vs userId), which is expensive to unwind and unsafe for AI/RAG.

---

## Decision

1. Introduce a first-class **Tenant** aggregate as the **primary isolation key** for customer data.
2. Tenant `kind` is one of:
   - **INDIVIDUAL** — personal tenant for a natural person (User)
   - **ORGANIZATION** — tenant for an Organization (Law Firm or Legal Entity in Phase 2)
3. **Cardinality:**
   - Each Individual User receives **one personal Tenant** (backfilled for existing users).
   - Each Organization receives **exactly one Tenant** (`Organization.tenantId` unique).
4. **Workspace / Matter** (future) and all tenant-owned resources **nest under** `tenant_id`. They are not alternate tenancy roots.
5. **Cross-party rule:** provider tenant owns Matter/work corpus; client party is a **participant with grants** (not a second owner).
6. **Platform** (admin queues, global catalog) is **not** a customer tenant; it is platform-scoped.
7. Sprint 2.2 ships Tenant + personal-tenant backfill **behind feature flags**; marketplace FKs (Booking → LawyerProfile / User) remain unchanged in Foundation.

---

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| **No Tenant table — use `organizationId` only** | Individuals without orgs lack a stable isolation key; solo professionals and personal vaults become special cases forever. |
| **Workspace as tenant root** | Conflicts with Master Architecture (Matter/Workspace nest under tenant). Premature until Workspace exists; conflates environment with isolation. |
| **User.id as tenant_id for everything** | Cannot isolate Law Firm / Legal Entity shared corpora; multi-seat orgs break. |
| **Multiple concurrent tenant roots per row (org + user + workspace)** | Causes query ambiguity and AI leakage; rejected by Master P7 / review freeze. |
| **Separate databases per customer now** | Premature Enterprise cost; logical `tenant_id` is required first. |

---

## Consequences

### Positive

- Single predicate for new multi-tenant queries and future RAG indexes.
- Clear path for Law Firm / Legal Entity isolation.
- Compatible with additive migration (nullable FKs + backfill).

### Negative / cost

- Every User needs a personal Tenant row (storage + backfill job).
- Legacy queries (Booking, LawyerProfile listing) will not use `tenant_id` until intentionally migrated — dual mental models during transition.
- Engineers must not “temporarily” skip tenant predicates on new code paths.

### Neutral

- Physical column name may be `tenant_id` / `personal_tenant_id`; exact Prisma shape is left to implementation sprints under this ADR’s semantics.

---

## Rollback strategy

1. Feature flag off: no product feature depends on Tenant reads.
2. Leave Tenant table and nullable User FKs in place (additive residue is safe).
3. Do **not** delete Tenant rows that were backfilled without an explicit data migration plan.
4. New modules that required Tenant must gate behind the same flag or be reverted in code deploy.
5. True schema drop of Tenant is a separate, deliberate migration — not an emergency rollback step.

---

## References

- Master Architecture v1.0.1 §4.6 Tenant model, P7  
- EPIC 02 Sprint 2.1 Blueprint §2–4, Sprint 2.2  
- Review freeze finding: multi-headed tenancy  

---

*End of ADR-001*
