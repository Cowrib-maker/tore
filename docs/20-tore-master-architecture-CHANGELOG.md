# TORE Master Architecture — Changelog

All notable changes to the constitutional document
[`20-tore-master-architecture-v1.md`](./20-tore-master-architecture-v1.md)
are recorded here.

The versioning applies to the **architecture constitution**, not the application semver.

---

## [1.0.1] — 2026-08-11

**Type:** Freeze Errata (documentation only)  
**Basis:** Accepted findings in [`21-master-architecture-review-freeze.md`](./21-master-architecture-review-freeze.md)  
**Not in scope:** Phase reorder · implementation roadmap rewrite · code · Prisma · migrations · Phase 2 build authorization

### Added

- Principle **P11 — API-first application boundary**
- Conceptual **`tenant_id`** single-primary-tenant model (§4.6), including how Individuals, Law Firms, and Legal Entities become tenants
- Cross-party engagement rule: provider tenant owns Matter; client is participant with grants
- Authorization layers: **Conflict of Interest**, **Ethical Walls**, **Legal Hold**, expanded **Audit Trail** (§6)
- Commerce domain split: **Platform Commerce** vs **Practice Billing** (§9)
- Explicit **API-first** engineering standard (§13.2)
- Decision Log entries **D-MA-010 … D-MA-016**
- Hardening clarification under existing phase note: org-scoped commerce requires Phase 2 Identity first (§17.1)
- Refusal: do not force catalog/platform objects into Workspace containment
- Refusal: do not collapse Platform Commerce into Practice Billing

### Changed

- Document version header → **v1.0.1** (principles remain those frozen in v1.0)
- **P1** wording: Actor framed as internal engineering concept; external nouns clarified
- **P2** wording: Matter = primary legal work container; Workspace = higher-level environment
- **P7** wording: single-tenant ownership via conceptual `tenant_id`
- Mission §2: Matter/Workspace roles clarified without changing platform mission
- Module ownership table: Commerce split into Platform Commerce and Practice Billing
- Security / coding principles updated to reference tenant_id, walls/holds, and API handlers
- Phase 2 exit criteria text: Organization types explicitly **Law Firm** and **Legal Entity**
- Future Expansion: Government / NGO / University called out as deferred past Phase 2

### Clarified

- Actor vs User / Professional / Organization / Law Firm / Legal Entity / Matter / Workspace terminology (§4.1)
- Workspace vs Matter hierarchy and ownership (§4.7, §8)
- Containment: engagement work under Matter; marketplace/platform catalog not required to live in Workspace
- Marketplace catalog tiers: core vs deferred products (§4.8, §7.3)
- Professional ↔ Organization affiliation is first-class
- §17.1 near-term commerce note vs Identity gate (no phase reorder)

### Deferred

- Organization types beyond **Law Firm** and **Legal Entity** (Government, NGO, University, …) — roadmap only
- Trust accounting (Practice Billing deep feature) — future
- Full CoI / Ethical Wall / Legal Hold **implementation** — conceptual reservation only in v1.0.1
- Templates / Knowledge / Education / AI Tools as marketplace first-class categories — later catalog tiers
- Physical per-customer DB isolation — Enterprise option (unchanged intent)

### Unchanged (explicitly)

- Vision and overall mission of Legal Operating Platform
- Platform phase **order** 1→8 (§17 table sequence)
- Implementation roadmap structure / phase names
- P3–P6, P8–P10 core intents
- Organic ranking principle (P5)
- AI constitutional rules intent (A1–A8; clarified to include walls/holds/tenant)
- Additive migration strategy
- Clean Architecture + modular monolith posture
- Non-authorization of code by this document alone

---

## [1.0.0] — 2026-08-11

### Added

- Initial TORE Master Architecture constitution (v1.0): Vision, Mission, Principles, Domain Model, Marketplace / Workspace / AI philosophies, phases 1–8, decision log, debt policy

---

*End of Master Architecture Changelog*
