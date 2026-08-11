# ADR-002 — Professional model

| Field | Value |
|-------|-------|
| **ADR** | 002 |
| **Title** | Professional model |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Epic** | 02 — Foundation Domain |
| **Authority** | Master Architecture v1.0.1 §4.1, §4.3 |
| **Supersedes** | — |
| **Related** | [ADR-005](./adr-005-lawyer-profile-compatibility.md) |

---

## Context

Today the only supply-side persona is **Lawyer** (`LawyerProfile`, `UserRole.LAWYER`). Master Architecture requires Professionals beyond Lawyer (Advocate, Notary, …) without treating Lawyer as the eternal core domain noun.

Foundation Domain must introduce **Professional** as the domain concept before marketplace multi-type (Phase 3) and Advocate credentials, while preserving live `/lawyers` URLs, bookings, and credential flows.

“Professional” is an **external/domain** noun. Internal engineering may still say Actor context kind `PROFESSIONAL`.

---

## Decision

1. **Professional** is the domain model for marketplace-facing legal practitioners.
2. A Professional is owned by exactly one **User** (login principal) at Foundation stage (`0..1` Professional per User).
3. Professional **types** are an extensible set. **Phase 2 / Epic 02 starts with `LAWYER` only.** Additional types (Advocate, …) are additive later — not forked tables per profession.
4. Credentials remain typed (e.g. lawyer license vs future advocate authorization) and hang off the Professional.
5. Offerings, availability, bookings, practice areas, and languages continue to attach to the **existing LawyerProfile persistence** during Foundation (see ADR-005); domain ports/use-cases speak **Professional** where new code is written.
6. Firm **affiliation** is via OrganizationMembership (ADR-003/004), not by duplicating User accounts.
7. Public listing eligibility rules for today’s marketplace (verification, `isListed`, active offering) remain on the LawyerProfile gates until a later marketplace epic explicitly generalizes them.

---

## Alternatives considered

| Alternative | Why rejected / deferred |
|-------------|-------------------------|
| **Keep “Lawyer” as the forever domain core** | Violates Master P1; guarantees rewrite when Advocate/other types ship. |
| **Separate tables per profession (AdvocateProfile, NotaryProfile, …)** | Schema explosion; shared offerings/bookings become polymorphic chaos. |
| **Multiple Professional profiles per User in Foundation** | Useful later for edge cases; premature now — increases authz and listing complexity. Revisit only with a new ADR. |
| **New ProfessionalProfile table + 1:1 LawyerProfile from day one (Strategy A)** | Clear naming, but dual-write and FK migration risk; deferred by ADR-005 in favor of Strategy B for Foundation. |
| **Encode profession only as User.role enum values** | Collapses org seats and multi-type professionals; cannot express Advocate + firm membership. |

---

## Consequences

### Positive

- Domain language aligns with Master Architecture.
- Extensible types without table-per-profession.
- Compatible with zero-breakage Marketplace during Epic 02.

### Negative / cost

- Temporary vocabulary split: DB/table names say Lawyer*; domain says Professional (managed by ADR-005).
- Type system / mappers must not accidentally assume “Lawyer === only possible Professional” in new modules.

### Neutral

- UI copy may still say “Lawyer” on `/lawyer/*` and `/lawyers` until product relabeling sprint.

---

## Rollback strategy

1. If Professional domain ports were added: remove or feature-flag them; call sites keep using LawyerProfile repositories.
2. Do not remove LawyerProfile data.
3. If a `professionalTypes` (or similar) additive column was introduced, leave it nullable/unused after flag-off.
4. No public URL rollback required if ADR-005 is followed (no path rename).

---

## References

- Master Architecture v1.0.1 §4.3 Professional  
- EPIC 02 Sprint 2.1 Blueprint §2, §3.3  
- ADR-005 LawyerProfile compatibility  

---

*End of ADR-002*
