# TORE LegalTech — Documentation Index

| Field | Value |
|-------|-------|
| **Status** | Platform constitution adopted · Marketplace MVP in production |
| **Product** | TORE Legal Operating Platform (Mongolia-first) |
| **Constitution** | [**20 — Master Architecture v1.0.1**](./20-tore-master-architecture-v1.md) — binding long-term blueprint (Freeze Errata applied) |
| **Baseline** | Phase 1 Stabilization complete · Client↔Lawyer marketplace live |
| **Sources** | Master Architecture · Review & Freeze · Ecosystem Architecture · Sprint plans |
| **Next** | Docs gate complete for Identity design clarity · Phase 2 Identity implementation still requires explicit build authorization |

---

## Authority order

1. [Master Architecture v1.0.1](./20-tore-master-architecture-v1.md) — **constitution**
2. [Master Architecture Changelog](./20-tore-master-architecture-CHANGELOG.md) — errata history
3. Decision Log entries inside the Master Architecture (and future ADRs)
4. [Review & Freeze](./21-master-architecture-review-freeze.md) — adversarial review record
5. Phase implementation plans
6. Older MVP docs — tactical/historical; yield on conflict

---

## Documents

| # | Document | Description |
|---|----------|-------------|
| **20** | [**Master Architecture v1.0.1**](./20-tore-master-architecture-v1.md) | **Constitution** — Freeze Errata applied |
| — | [Master Architecture Changelog](./20-tore-master-architecture-CHANGELOG.md) | v1.0 → v1.0.1 errata history |
| **21** | [Master Architecture Review & Freeze](./21-master-architecture-review-freeze.md) | Adversarial review · freeze + errata gates |
| 1 | [Executive Summary](./01-executive-summary.md) | Verdict, reuse/remove, approval gate |
| 2 | [Gap Analysis](./02-gap-analysis.md) | Current implementation vs target MVP |
| 3 | [Target Architecture](./03-target-architecture.md) | Modular monolith, layers, adapters |
| 4 | [Domain Model](./04-domain-model.md) | Bounded contexts, aggregates, services (MVP-era) |
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
| 17 | [Architecture summary (S2)](./17-architecture-summary.md) | Post–Sprint 2 architecture snapshot |
| 18 | [Remaining roadmap](./18-remaining-roadmap.md) | Deferred S2 items + S3–S10 plan |
| 19 | [TORE Ecosystem Architecture](./19-tore-ecosystem-architecture.md) | Dual-product vision: Client + Pro (subordinate to Master) |
| — | [Sprint 1 milestones](./sprints/sprint-1-milestones.md) | Sprint 1 milestone log |
| — | [Sprint 2 checklist](./sprints/sprint-2-checklist.md) | Sprint 2 implementation checklist (**COMPLETE**) |
| — | [Sprint 2 milestones](./sprints/sprint-2-milestones.md) | Sprint 2 milestone log (**COMPLETE**) |
| — | [Sprint 3 milestones](./sprints/sprint-3-milestones.md) | Sprint 3 verification + FileStorage (**COMPLETE**) |
| — | [Sprint 4 MVP plan](./sprints/sprint-4-mvp-plan.md) | Public marketplace MVP — request/accept, no payments |
| — | [Sprint 4 milestones](./sprints/sprint-4-milestones.md) | Sprint 4 marketplace loop (**COMPLETE**) |
| — | [Sprint 2 CA check](./sprints/sprint-2-clean-architecture-check.md) | Pre-Sprint 2 CA verification |
| — | [Sprint 2 M3 review](./reviews/sprint-2-m3-review.md) | M3 production readiness review |
| — | [Final Sprint 2 audit](./reviews/final-sprint-2-audit.md) | Final audit + High remediations |

---

## Release artifacts (repo root)

| Document | Description |
|----------|-------------|
| [RELEASE_NOTES.md](../RELEASE_NOTES.md) | `v0.2.0-alpha` release notes |
| [CHANGELOG.md](../CHANGELOG.md) | Version history |

---

## Gate status

| Gate | Status |
|------|--------|
| Master Architecture v1.0 | **Frozen 2026-08-11** (principles) |
| Master Architecture v1.0.1 | **Freeze Errata published 2026-08-11** (docs only — does not authorize Phase 2 code) |
| Architecture docs + review (MVP) | Approved (implementation authorized for marketplace track) |
| Phase 1 Stabilization | **Complete** |
| Sprint 1–4 | Complete (marketplace request loop) |
| Phase 2 Identity | Not started (requires implementation authorization) |
