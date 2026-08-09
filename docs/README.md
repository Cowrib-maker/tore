# TORE LegalTech Marketplace — Documentation Index

| Field | Value |
|-------|-------|
| **Status** | Architecture Review complete — **awaiting approval before Sprint 2 kickoff** |
| **Product** | TORE LegalTech Marketplace (Mongolia) |
| **Baseline** | Sprint 1 already complete (`tore@0.1.0`) — do **not** re-run Sprint 1 |
| **Sources** | Approved SRS v1.0 · Product Vision · Architecture Analysis · 10-Sprint Roadmap |
| **Scope of this folder** | Planning + architecture review only — **no production code** |

---

## Documents

| # | Document | Description |
|---|----------|-------------|
| 1 | [Executive Summary](./01-executive-summary.md) | Verdict, reuse/remove, approval gate |
| 2 | [Gap Analysis](./02-gap-analysis.md) | Current implementation vs target MVP |
| 3 | [Target Architecture](./03-target-architecture.md) | Modular monolith, layers, adapters |
| 4 | [Domain Model](./04-domain-model.md) | Bounded contexts, aggregates, services |
| 5 | [Database Design](./05-database-design.md) | Schema, enums, relationships, seeds |
| 6 | [Folder Structure](./06-folder-structure.md) | Target tree and growth rules |
| 7 | [Module Breakdown](./07-module-breakdown.md) | MVP modules, ports, ownership |
| 8 | [Sprint-by-Sprint Plan](./08-sprint-implementation-plan.md) | S1–S10 delivery plan |
| 9 | [Dependency Graph](./09-dependency-graph.md) | Context and build-order dependencies |
| 10 | [Development Standards](./10-development-standards.md) | Process, DoD, quality bars |
| 11 | [Coding Conventions](./11-coding-conventions.md) | Naming, layering, patterns |
| 12 | [Testing Strategy](./12-testing-strategy.md) | Unit, integration, E2E |
| 13 | [Deployment Strategy](./13-deployment-strategy.md) | Environments, release, ops |
| 14 | [Risk Analysis](./14-risk-analysis.md) | Risks, mitigations, open decisions |
| 15 | [AI Module Roadmap](./15-ai-module-roadmap.md) | Future Legal AI (post-MVP) |
| 16 | [Architecture Review Report](./16-architecture-review-report.md) | Consistency, gaps, risks, SRS↔sprint audit |
| — | [Sprint 1 milestones](./sprints/sprint-1-milestones.md) | Sprint 1 milestone log |
| — | [Sprint 2 checklist](./sprints/sprint-2-checklist.md) | Sprint 2 implementation checklist |
| — | [Sprint 2 milestones](./sprints/sprint-2-milestones.md) | Sprint 2 milestone log |
| — | [Sprint 2 CA check](./sprints/sprint-2-clean-architecture-check.md) | Pre-Sprint 2 CA verification |

---

## Approval required

Implementation (including cleanup commits that touch `src/`) must **not** begin until Product approves this documentation set **and** the Architecture Review.

*(Sprint 1 complete. Sprint 2 Milestone 3 complete — see sprint milestone logs for gate status.)*


---

## Approval required

Implementation (including cleanup commits that touch `src/`) must **not** begin until Product approves this documentation set **and** the Architecture Review.

Recommended approval checklist:

- [ ] Gap analysis accepted
- [ ] Target architecture & domain model accepted
- [ ] Database design accepted as schema source of truth (incl. planned additive columns)
- [ ] Sprint plan & dependencies accepted
- [ ] Standards, testing, deployment accepted
- [ ] Risks & open decisions acknowledged
- [ ] AI roadmap accepted as **future-only** (not MVP)
- [ ] Architecture Review Report accepted
- [ ] Decision **D5** (S6 stub PaymentGateway) accepted or alternative written
- [ ] Authorization to start **Sprint 0 / Sprint 2 kickoff**

---

## Explicit non-goals of this phase

- No production feature code
- No modifications to `src/`, `prisma/`, or config for features
- No payment-provider integration yet
- No AI features in MVP
