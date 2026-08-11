# ADR-003 — Organization model

| Field | Value |
|-------|-------|
| **ADR** | 003 |
| **Title** | Organization model |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Epic** | 02 — Foundation Domain |
| **Authority** | Master Architecture v1.0.1 §4.4, D-MA-016 |
| **Supersedes** | — |
| **Related** | [ADR-001](./adr-001-tenant-model.md), [ADR-004](./adr-004-membership-model.md) |

---

## Context

TORE has no Organization persistence today. SMEs are approximated by optional `ClientProfile.companyName`. Law firms do not exist as entities (Sprint 1 removed leftovers by design).

Master Architecture requires Organizations distinct from Professional profiles:

- **Law Firm** ≠ fancy LawyerProfile  
- **Legal Entity** ≠ `companyName` string forever  

Phase 2 Identity must introduce organizations without building Government/NGO/University products yet, and without breaking individual Client/Lawyer flows.

---

## Decision

1. Introduce an **Organization** aggregate separate from User and Professional.
2. **Phase 2 / Epic 02 organization types (shipped):**
   - `LAW_FIRM` — supply-side legal organization  
   - `LEGAL_ENTITY` — business / SME client organization  
3. **Future types** (Government, NGO, University, …) remain on the same Organization model as an **extensible type enum**, but are **out of scope** for Epic 02 product surfaces and default create paths.
4. Each Organization has **exactly one Tenant** (ADR-001).
5. Organizations are created **explicitly** (user/admin action). **Do not** auto-create Organizations from `ClientProfile.companyName` during Foundation.
6. Law Firm may later list services / feature Professionals; Legal Entity is primarily demand-side / internal work tenant. Neither replaces individual ClientProfile or LawyerProfile in Epic 02.
7. Soft delete / status fields are preferred over hard delete for Organizations with memberships.

---

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| **Only Law Firm now; invent SME later as a different aggregate** | Violates single Organization model; Legal Entity is required by Master Phase 2 exit. |
| **Ship Government/NGO/University create flows in Epic 02** | Premature scope (D-MA-016); speculative compliance. |
| **Reuse ClientProfile.companyName as the org** | Not a tenant; not multi-seat; not auditable membership. |
| **Organization = User with role FIRM** | Collapses seats into one login; cannot express members. |
| **Separate LawFirm and LegalEntity tables** | Duplicate membership/tenant machinery; extend type enum instead. |

---

## Consequences

### Positive

- Clear firm vs SME modeling path.
- Aligns with tenant isolation (one org → one tenant).
- Keeps individual marketplace loop intact until orgs are opted into.

### Negative / cost

- Dual client representation during transition (personal ClientProfile vs Legal Entity) — product must explain when to use which.
- Firm marketplace listings deferred (Phase 3+); org exists before it is fully listed.

### Neutral

- Slug / public firm directory URLs are not required in early Foundation sprints.

---

## Rollback strategy

1. Feature flag org create/list UI and APIs off.
2. Leave Organization / Tenant rows; they do not affect Booking or `/lawyers` queries.
3. Do not cascade-delete Users when rolling back org features.
4. Disable membership issuance (ADR-004) with the same flag family.

---

## References

- Master Architecture v1.0.1 §4.4, D-MA-016  
- EPIC 02 Sprint 2.1 Blueprint Sprint 2.3  
- ADR-001 Tenant · ADR-004 Membership  

---

*End of ADR-003*
