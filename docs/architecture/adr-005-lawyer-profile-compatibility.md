# ADR-005 — Compatibility strategy for LawyerProfile

| Field | Value |
|-------|-------|
| **ADR** | 005 |
| **Title** | Compatibility strategy for LawyerProfile |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Epic** | 02 — Foundation Domain |
| **Authority** | Master Architecture v1.0.1 §11, P9; EPIC 02 Sprint 2.1 Strategy B |
| **Supersedes** | — |
| **Related** | [ADR-002](./adr-002-professional-model.md) |

---

## Context

Production depends on:

- Table `lawyer_profiles` (slug, verification, listing, ratings)  
- FKs from offerings, availability, bookings, credentials, reviews, payouts  
- Public URLs `/lawyers` and `/lawyers/[slug]`  
- App shell `/lawyer/*`  
- Domain type `LawyerProfile` and `LawyerProfileRepository`

Master Architecture introduces **Professional** as the domain persona (ADR-002). An irreversible wrong choice here (hard rename or dual-row cutover without dual-write discipline) can break bookings and SEO slugs.

Sprint 2.1 blueprint recommended **Strategy B**: keep the physical LawyerProfile table; treat it as Professional(Lawyer) in the domain during Foundation.

---

## Decision

**Adopt Strategy B — LawyerProfile persistence compatibility.**

1. **Do not rename or drop** `lawyer_profiles` (or related `lawyer_*` junction tables) in Epic 02.
2. **Do not change** public paths `/lawyers`, `/lawyers/[slug]`, or `/lawyer/*` in Epic 02.
3. **Do not change** Booking / Offering / Availability foreign keys away from `lawyerProfileId` in Epic 02.
4. Domain language for **new** Foundation code may use **Professional** (type LAWYER) as an alias over LawyerProfile; mappers/repositories may wrap existing LawyerProfile ports.
5. Additive columns on `lawyer_profiles` are allowed (e.g. markers for professional types) if nullable and backward compatible.
6. **Strategy A** (new `ProfessionalProfile` table + 1:1 LawyerProfile dual-write) is **rejected for Foundation**. It may be reconsidered only via a new ADR after Phase 2 Identity is stable and dual-write cost is justified (e.g. multi-type professionals needing a clean table).
7. A future physical rename (`lawyer_profiles` → `professional_profiles`) requires its own ADR, expand/contract migration, and is **out of scope** until marketplace multi-type demands it.

---

## Alternatives considered

| Alternative | Why rejected for Foundation |
|-------------|-----------------------------|
| **Strategy A — new ProfessionalProfile + 1:1 LawyerProfile** | Dual-write, dual-read, sync bugs; booking FKs either duplicate or join-hop; high rollback cost. Better naming, worse risk. |
| **Hard cutover rename table + columns now** | Breaks zero-downtime requirement; slug/SEO and FK blast radius. |
| **Parallel “professional” listings table with copy of data** | Divergence of ratings/verification; marketplace inconsistency. |
| **Keep Lawyer forever in domain (no Professional noun)** | Rejected by ADR-002 / Master P1. |

---

## Consequences

### Positive

- Zero breakage for login, profiles, bookings, marketplace, URLs.
- Fastest path to ship Tenant/Org/Membership alongside live supply.
- Clear story: compatibility now, optional rename later.

### Negative / cost

- Persistent naming debt (`lawyer_*` in DB vs Professional in docs/domain).
- Risk that engineers add Lawyer-specific assumptions in new Professional-facing modules — lint/review against ADR-002.
- Eventual rename still needed if product wants unified `/professionals` as primary URL (separate epic).

### Neutral

- Admin copy and MN/EN strings may continue saying “Lawyer” on existing screens.

---

## Rollback strategy

1. If Professional alias ports fail: stop using them; all call sites remain on LawyerProfileRepository.
2. Additive columns unused after flag-off are harmless.
3. Because no table rename occurred, **no data restore** is required for Strategy B rollback.
4. If a mistaken Strategy A spike was started: abandon new table writes; do not migrate FKs; drop unused table only after confirming zero references (separate ops ADR).

---

## References

- Master Architecture v1.0.1 §4.9 mapping, §11 Migration, P9  
- EPIC 02 Sprint 2.1 Blueprint §3.3 Strategy B recommendation  
- [EPIC 02 Sprint 2.2 Compatibility Charter](../epics/epic-02-sprint-2.2-compatibility-charter.md)  
- ADR-002 Professional model  

---

*End of ADR-005*
