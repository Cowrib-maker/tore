# TORE Master Architecture v1.0.1

| Field | Value |
|-------|-------|
| **Document** | TORE Master Architecture |
| **Version** | 1.0.1 |
| **Status** | Constitutional — binding for product & engineering (**principles frozen** in v1.0; this revision is **Freeze Errata** only) |
| **Effective** | 2026-08-11 |
| **Errata of** | [v1.0](./20-tore-master-architecture-v1.md) principles adopted 2026-08-11 |
| **Changelog** | [Master Architecture Changelog](./20-tore-master-architecture-CHANGELOG.md) |
| **Review basis** | [21 — Review & Freeze](./21-master-architecture-review-freeze.md) |
| **Scope** | Platform blueprint for the next several years |
| **Authority** | Supersedes conflicting narrower framings in docs 03, 04, 19 where they conflict with this document; those docs remain valid for historical MVP delivery detail |
| **Implementation** | This document does **not** authorize code changes by itself. Features ship only via approved implementation phases. **v1.0.1 does not authorize Phase 2 implementation.** |

---

## 0. How to use this document

1. **Product** proposes features against Vision, Mission, and Product Principles. Prefer external domain nouns (User, Professional, Organization, Law Firm, Legal Entity, Matter).
2. **Engineering** designs against Domain Model, Tenant model, Authorization, Security, Coding Principles, and the API-first boundary. **Actor** / `ActorContext` remain valid *internal* engineering terms.
3. **Every PR / ADR** that changes identity, tenancy, marketplace ranking, workspace/matter boundaries, commerce domains, or AI data access must cite the relevant section of this document.
4. Conflicts with older MVP docs are resolved in favor of **this Master Architecture**, unless an explicit Decision Log entry says otherwise.
5. Phases below are **platform phases**, not single sprints. Sprints nest inside phases.
6. **v1.0.1** clarifies frozen principles. It does **not** redesign the architecture, reorder phases, or change the implementation roadmap intent of §16.

---

## 1. Vision

TORE is a **Legal Operating Platform**.

It is **not** merely:

- a lawyer directory
- a booking website
- a legal chatbot

Those are components. The platform’s job is to help people and organizations **discover legal capability, engage services, perform legal work, and govern that work** — with trust, auditability, multilingual access (mn / en / ko / zh first), and AI as an accelerator under human and regulatory constraints.

Long-term outcome: the world’s best Legal Operating Platform — starting in Mongolia, expandable without rewriting the core domain.

---

## 2. Mission

**Build the world’s best Legal Operating Platform.**

- Marketplace is **one** component.
- AI is **one** component.
- **Matter** (inside a Workspace) is the long-term center of *legal work*.
- **Workspace** is the operational *environment* that holds Matters and shared resources.
- Identity — Users, Professionals, Organizations — is the **foundation** (internally modeled under the Actor/tenancy system).
- Everything must work together under one kernel: identity, permissions, files, audit, billing events, i18n, observability.

---

## 3. Core Principles

### 3.1 Platform principles

| ID | Principle | Meaning |
|----|-----------|---------|
| P1 | **Actor-centric domain (engineering)** | The core domain is **not Lawyer**. Internally, identity/authorization use an **Actor** model. Externally, product language uses User, Professional, Organization, Law Firm, Legal Entity, etc. Lawyer is one Professional specialization. |
| P2 | **Matter-centric legal work; Workspace-centric environment** | **Matter** is the primary legal work container. **Workspace** is the higher-level environment that contains Matters and shared resources. Booking is an acquisition and engagement path into work — not the long-term center. |
| P3 | **Composition over collapse** | Marketplace, Workspace, and AI compose; they do not replace each other. |
| P4 | **Trust before growth hacks** | Verification, consent, audit, and safety beat vanity metrics. |
| P5 | **Payment must not buy access bias** | Organic ranking and discovery must never be secretly manipulated by payment. Sponsored inventory, if ever, is explicit and labeled. |
| P6 | **AI assists; humans decide** | AI does not replace licensed legal advice or platform judgments of lawfulness. |
| P7 | **Single-tenant ownership** | Every resource ultimately belongs to **exactly one tenant** (`tenant_id` conceptually). Isolation is non-negotiable for RAG, files, messages, and billing. |
| P8 | **Clean Architecture forever** | Domain does not import Next.js, Prisma, Auth.js, UI, or AI SDKs. Ports and adapters evolve. |
| P9 | **Additive evolution** | Prefer additive schema and dual-read over breaking migrations of live identity/commerce. |
| P10 | **Mongolia-first, world-ready** | Local legal reality (e.g. Lawyer ≠ Advocate) is modeled honestly; expansion uses typed extensibility, not hard-coded single-country assumptions in the core. |
| P11 | **API-first application boundary** | Every future feature must be consumable through the same application-service boundary by Web, Mobile, AI, and integrations. |

### 3.2 What TORE refuses

- Flattening Advocates into Lawyers.
- Treating a Law Firm as “a lawyer with a fancy title”.
- Treating an SME as `companyName` on an individual profile forever.
- Building AI that bypasses document ACL.
- Letting paid placement rewrite organic order silently.
- Growing phases by skipping Identity and tenancy foundations.
- Collapsing Platform Commerce into Practice Billing (or the reverse).
- Forcing marketplace listings, credential-review queues, or education SKUs to “live inside” a Matter/Workspace when they are platform or catalog concerns.

---

## 4. Domain Model

### 4.1 Terminology: Actor (internal) vs external domain nouns

**Actor** is an **internal engineering concept**: any party that can act on the platform with authenticated identity and permissions (used in `ActorContext`, capability checks, and session “active context”).

**Do not rename** established internal engineering terms (e.g. `ActorContext`) solely for vocabulary purity.

**Externally** (product, UX, docs for non-engineers), prefer:

| External noun | Meaning |
|---------------|---------|
| **User** | Login / authentication principal |
| **Professional** | Legal professional persona (Lawyer, Advocate, …) |
| **Organization** | Collective party |
| **Law Firm** | Organization type (supply-side practice) |
| **Legal Entity** | Organization type (business / SME client org) |
| **Matter** | Primary legal work container |
| **Workspace** | Environment containing Matters + shared resources |

Kinds an Actor context may represent:

| Kind | Description | Examples |
|------|-------------|----------|
| **Individual** | Natural person acting for themselves | Client user, student, foreign investor as individual |
| **Professional** | Natural person offering legal / adjacent services | Lawyer, Advocate, Notary, … |
| **Organization** | Legal or institutional collective | Law Firm, Legal Entity (Phase 2); Government, NGO, University (**future**) |

> **Note:** A single **User** (login principal) may participate in multiple contexts over time via memberships and professional profiles. The User is the authentication subject; the active context is the authorization and marketplace subject.

### 4.2 User Account (authentication principal)

| Concern | Rule |
|---------|------|
| Login | One person → one User Account (preferred) |
| Credentials | Password / future IdP; never log secrets |
| Compatibility | Legacy `User.role` (`CLIENT` \| `LAWYER` \| `ADMIN`) remains a **home shell hint** during migration — not the long-term sole authorization authority |
| Session | Carries user id + active context version; privileges refreshed from source of truth on a safe cadence |

### 4.3 Professional (specialization)

Professional is **not** only Lawyer.

**Professional types (extensible enum):**

- Lawyer  
- Advocate  
- Notary  
- Mediator  
- Arbitrator  
- Tax Adviser  
- Compliance Professional  
- Intellectual Property Professional  
- Future legal professions (add via enum / registry — do not fork core tables per profession)

**Rules:**

- Professional Profile is marketplace- and credential-facing.
- Credential kinds are typed (e.g. lawyer license vs advocate authorization).
- Representation / advocacy services require appropriate credentials.
- One User may hold multiple credential kinds on one Professional Profile (preferred) rather than duplicate accounts.
- Organization **affiliation** (e.g. firm membership) is first-class: a Professional may be solo, firm-affiliated, or both over time without duplicate User accounts.

### 4.4 Organization

**Phase 2 organization types (in scope for Identity foundation):**

| Type | Role |
|------|------|
| **Law Firm** | Supply-side legal organization |
| **Legal Entity** | Business / SME client organization |

**Future organization types (roadmap only — not Phase 2):**

- Government  
- NGO  
- University  
- Other institutional types  

**Rules:**

- Organizations have memberships with org-scoped roles.
- Law Firm ≠ Professional Profile.
- Legal Entity is primarily a **client / business** party, not a supply-side listing by default (may later procure services, host compliance workspaces, etc.).
- Future types extend the same Organization model; they are not separate cores.

### 4.5 Membership & context

```text
User Account
   ├── ProfessionalProfile?          → acts as Professional
   └── OrganizationMembership*       → acts within Organization
            └── Organization (Law Firm | Legal Entity | future…)
```

**Active context** (session; internally `ActorContext`):

```text
{ kind: INDIVIDUAL | PROFESSIONAL | ORGANIZATION, actorId, membershipId?, tenantId }
```

Switching context must not require a second login.

### 4.6 Tenant model (`tenant_id`)

**Constitutional rule:** every multi-tenant resource ultimately belongs to **exactly one tenant**.

Conceptually, each such row carries (or resolves to) a **`tenant_id`**. Workspace, Matter, documents, messages, AI runs, and practice billing objects **nest under** that tenant — they are not alternate tenancy roots.

| Party | How it becomes a tenant |
|-------|-------------------------|
| **Individual** | Receives a **personal tenant** (synthetic solo tenant) for personal vault, individual bookings, and individual-owned work until/unless work moves under an Organization tenant by rules below |
| **Law Firm** | Organization creates an **organization tenant**; firm Workspaces, Matters, practice billing, and firm corpus hang under it |
| **Legal Entity** | Organization creates an **organization tenant**; SME seats, internal workspaces/matters, and org-paid engagements hang under it |
| **Platform** | Not a customer tenant; platform admin queues and global catalog are platform-scoped (outside customer `tenant_id`) |

**Engagement spanning two parties** (e.g. Legal Entity client + Law Firm provider):

- The **Matter is owned by the provider tenant** (Law Firm tenant, or personal tenant of a solo Professional).  
- The client (Individual or Legal Entity) is a **participant with grants**, not a second owner.  
- Platform Commerce records may reference both payer and payee without violating single-tenant ownership of the Matter corpus.

**Never** accept `tenant_id` / `organizationId` / `workspaceId` / `matterId` from the client without proving the User’s right to that context.

### 4.7 Workspace and Matter (hierarchy & ownership)

| Concept | Definition |
|---------|------------|
| **Matter** | **Primary legal work container** — the unit of case/engagement work (documents, tasks, messages, deadlines, research, AI threads, practice billing lines tied to the matter) |
| **Workspace** | **Higher-level environment** owned by a tenant — contains one or more Matters plus shared resources (calendar views, shared templates, team libraries, workspace-level settings) |

**Hierarchy:**

```text
Tenant (Individual personal | Law Firm | Legal Entity)
  └── Workspace(s)
        ├── Shared resources (workspace-scoped)
        └── Matter(s)     ← primary legal work containers
              ├── Documents / Evidence
              ├── Tasks / Timeline / Deadlines
              ├── Messages / Meetings
              ├── AI / Research / Drafts
              └── Practice billing lines (matter-linked)
```

**Ownership:**

| Asset | Owner |
|-------|--------|
| Workspace | Owning tenant (Individual personal tenant, Law Firm, or Legal Entity) |
| Matter | **Provider tenant** by default (Law Firm tenant, or solo Professional’s personal tenant). Client parties are **participants with grants** |
| Matter documents / AI corpus | Same tenant as the Matter (participant grants control client visibility) |
| Professional listing | Professional Profile (may be featured by a Law Firm without changing listing ownership) |
| Firm listing / firm services | Law Firm organization (its tenant) |
| SME internal documents | Legal Entity tenant |

**Containment scope (clarified):**

- Durable **engagement / case work** belongs under Matter (inside a Workspace).  
- Marketplace listings, platform credential-review queues, global education SKUs, and similar **catalog/platform** concerns are **not** required to be Workspace children.

**Booking bridge:** Booking / Order may create or link a Workspace skeleton and/or Matter on confirmation or payment success; Booking remains an engagement path, not the long-term work center.

### 4.8 Marketplace entities

Marketplace is a **discovery and commerce surface**, not the core OS.

**Core (near-/mid-term):** Professionals · Organizations (Law Firm / Legal Entity) · Services  

**Later catalog tiers (deferred products):** Templates · Documents (productized) · AI Tools · Knowledge · Education · future digital legal products  

### 4.9 Service engagement

Services are **typed offerings**, not consultation-only:

Examples: consultation, document review, drafting, research, representation, retainer, corporate support; later template packs / education products.

Engagement path:

```text
Discovery → Offer → Booking / Order / Subscription
  → Platform Commerce (payment)
  → Fulfillment → Workspace / Matter
  → Practice Billing (as applicable) → Review
```

### 4.10 Existing MVP entities (mapped forward)

| Today | Maps to Master model |
|-------|----------------------|
| `User` | User Account |
| `UserRole.CLIENT` | Individual context (compat) |
| `UserRole.LAWYER` | Professional (Lawyer) + home shell |
| `UserRole.ADMIN` | Platform capability |
| `ClientProfile` | Individual client profile aspects |
| `LawyerProfile` | ProfessionalProfile (Lawyer) — migrate/extend |
| `ConsultationOffering` | ServiceOffering (consultation subtype) |
| `Booking` | Service engagement; may spawn Workspace/Matter under provider tenant |
| `Notification` | Platform kernel notification |
| Payment/Message/Review (schema) | Complete in commerce phases; then Workspace/Matter-link |

---

## 5. Entity Relationships (logical)

```text
┌─────────────┐
│    User     │  (authentication principal)
└──────┬──────┘
       │
       ├──────────────► ProfessionalProfile ──► Credentials (typed)
       │                      │
       │                      │ affiliation (membership)
       │                      ▼
       ├──────────────► OrganizationMembership ──► Organization
       │                       (Law Firm | Legal Entity | future…)
       │                                             │
       │                                             └── tenant_id
       │
       └──────────────► Individual profile ──► personal tenant_id

Tenant
  └── Workspace
        ├── shared resources
        └── Matter(s)   ← primary legal work containers
              ├── Documents / Evidence
              ├── Messages / Meetings
              ├── Tasks / Calendar / Timeline
              ├── AI Runs / Research / Drafts
              └── Practice Billing lines
```

---

## 6. Authorization Philosophy

### 6.1 Source of truth

Authorization trusts **server-side current state**, not stale client claims alone.

- Session / JWT may cache active context for UX and edge routing.
- Privileged decisions (role demotion, membership revoke, admin, file ACL, org billing, wall bypass) must revalidate against database (or equivalent authoritative store) within a safe freshness policy.
- Fail closed on corrupt or missing privilege claims.

### 6.2 Layers of authorization (conceptual — no implementation)

| Layer | Meaning |
|-------|---------|
| **RBAC** | Role-based access from platform roles (e.g. Admin) and organization membership roles (partner, admin, lawyer, advocate, associate, paralegal, employee, …) |
| **Ownership** | Resource owner (tenant / matter owner) holds full control within policy; ownership is not inferred from client-supplied ids |
| **Memberships** | Organization and Workspace/Matter memberships grant and revoke capabilities; losing membership must invalidate cached context |
| **Capability check** | Prefer `can(activeContext, action, resource)` composed from the layers below — not endless booleans on User |

Capabilities derive from:

1. Platform roles (Admin)  
2. Professional credentials & verification  
3. Organization membership role + grants  
4. Workspace / Matter ACL  
5. Resource ownership  
6. Conflict of Interest / Ethical Wall constraints (deny even if role would allow)  
7. Legal Hold constraints (restrict delete/mutate even for owners where policy requires)

### 6.3 Conflict of Interest (CoI)

**Conceptual requirement (design now; implement in later phases):**

- Before assigning professionals to Matters (and as ongoing monitoring), the platform must support declaring and detecting conflicts across Matters / clients / adverse parties within a tenant (and, where product requires, across affiliated tenants).  
- CoI hits produce **blocks or warnings** per policy — never silent ignore.  
- CoI decisions are **audited**.

### 6.4 Ethical Walls

**Conceptual requirement:**

- Within a Law Firm (or other Organization tenant), information barriers (“ethical walls”) may prevent specific Users or teams from reading or searching Matter / document / AI corpora even when they share the same tenant.  
- Walls are **deny overrides** on otherwise valid RBAC/membership grants.  
- AI retrieval **must** respect walls (same ACL as humans).  
- Break-glass access, if ever allowed, requires elevated role + mandatory audit + time bound.

### 6.5 Legal Hold

**Conceptual requirement:**

- A Matter, Workspace, or tenant may be placed under **Legal Hold**, freezing destructive actions (delete, certain redactionsact/expunge paths) while preserving ordinary privileged read as allowed by ACL.  
- Holds are explicit, attributable, and audited.  
- AI training / export pipelines must honor holds.

### 6.6 Audit Trail

- Security-relevant and matter-critical actions produce audit events (actor user id, active context, tenant id, action, resource, timestamp, outcome).  
- Admin, CoI, wall break-glass, Legal Hold, payout, and credential review actions are always audited.  
- Audit logs are append-oriented and tenant-attributable; platform admins access under separate platform controls.

### 6.7 Tenancy enforcement

| Boundary | Enforced on |
|----------|-------------|
| Tenant (`tenant_id`) | Primary isolation key for customer data |
| Workspace / Matter | Nested under tenant; ACL + walls apply inside |
| Platform | Admin review queues, global settings, global catalog |

### 6.8 File access

Sensitive files (credentials, evidence, contracts, message attachments) are never permanently public. Access goes through authorized application routes or short-lived, authz-controlled signed URLs — and remains subject to walls and holds.

---

## 7. Marketplace Philosophy

### 7.1 Role of Marketplace

Marketplace acquires trust and liquidity:

- Discover Professionals, Organizations, and Services (later: higher catalog tiers)  
- Match need → service  
- Transact fairly via **Platform Commerce**  
- Feed work into Workspace / Matter  

It is **not** the entire product.

### 7.2 Ranking & fairness

**Constitutional rule:** Payment must not buy better organic client access.

Organic ranking signals (illustrative):

- Relevance to query / intake  
- Qualification & credential fit  
- Verification status  
- Service fit  
- Availability  
- Quality signals (reviews, completion, dispute rates — carefully anti-gamed)  
- User preference / language / location  

**Sponsored / promoted inventory**, if introduced:

- Must be visually and structurally distinct  
- Must not mutate organic score under the hood  
- Must be auditable  

### 7.3 Categories & filters (directional)

**Near-term categories:** Professionals (by type) · Organizations (Law Firm / Legal Entity) · Services  

**Deferred categories:** Templates · Knowledge · Education · AI Tools · other digital legal products  

Filters: practice area, service type, location, language, experience, verification, price band, availability, organization, professional type, and future product attributes.

### 7.4 Multilingual public surfaces

Public discovery remains mn / en / ko / zh capable. Ranking must not hard-require English content.

---

## 8. Workspace Philosophy

### 8.1 Gravity shift

| Era | Center of gravity |
|-----|-------------------|
| MVP (legacy) | Booking request loop |
| Near-term | Booking + Messaging + Payment (Platform Commerce) |
| Strategic | **Matter** inside **Workspace** (under a single tenant) |

### 8.2 Design rules

1. Long-lived legal collaboration is represented as a **Matter** inside a **Workspace**.  
2. Booking may create a Workspace and/or Matter skeleton on confirmation / payment success under the **provider tenant**.  
3. Solo Professionals (personal tenant) and Law Firms (organization tenant) share the same Workspace/Matter kernel with different tenancy owners.  
4. Legal Entity internal compliance Workspaces/Matters may exist **without** a marketplace booking.  
5. UI shells must not call every area “workplace”; use clear role language (see Product Principles).  
6. Catalog/platform objects are not forced into Workspace containment (§4.7).

### 8.3 Matter

Matter is the **primary legal work container**:

Client (Individual or Legal Entity participant) ↔ Matter ↔ Documents · Tasks · Messages · Deadlines · Research · AI · Practice Billing lines  

Matters can originate from marketplace engagements or org-internal intake. Default **ownership** is the **provider tenant**; clients hold **grants**.

---

## 9. Commerce domains (split)

Money on TORE is **two domains**. Do not merge them into one ledger conceptually.

### 9.1 Platform Commerce

**Responsibility:** marketplace and platform monetization.

Includes:

- Marketplace payments for bookings/orders  
- Subscriptions (seat / plan / product)  
- Platform commissions / fees  
- Payouts to professionals/firms for marketplace engagements  
- Refunds / disputes for **platform-mediated** transactions  
- Merchant-of-record / escrow decisions for marketplace (product-deferred detail; domain remains Platform Commerce)

**Module ownership:** Commerce (platform) — payments, payouts, refunds, marketplace disputes.

### 9.2 Practice Billing

**Responsibility:** practice / matter financials for the provider tenant.

Includes:

- Client invoices  
- Retainers  
- Time / fee entries linked to Matters (as product matures)  
- Trust accounting (**future**)  
- Client billing statements inside firm/Legal Entity workflows  

**Module ownership:** Practice Billing (workspace/matter-adjacent) — distinct from Platform Commerce adapters.

### 9.3 Relationship

```text
Platform Commerce     →   settles marketplace engagement money
Practice Billing      →   records provider↔client practice charges on Matters
```

A single client engagement **may** involve both (e.g. marketplace payment collected by Platform Commerce; subsequent firm invoice lines in Practice Billing). They reconcile by reference (booking id / matter id), not by collapsing tables into one ambiguous “Payment” meaning.

---

## 10. AI Philosophy

### 10.1 Integration model

AI is **deeply integrated into Workspace/Matter and Marketplace workflows** — not a detached chatbot product.

Examples of future capabilities:

Legal Chat · Research · Drafting · Contract Review · Evidence Review · Timeline Analysis · Case Analysis · Strategy Assistance · Compliance · Risk Analysis · Translation · Voice · Meeting Summary · Workflow Automation · Model Routing · Usage Tracking · Document Intelligence · RAG · Vector Search · Enterprise Isolation  

### 10.2 Constitutional AI rules

| ID | Rule |
|----|------|
| A1 | AI outputs are assistance, not licensed advice unless a human professional adopts them under their authority. |
| A2 | Retrieval is limited to documents the active context is authorized to read (RBAC + membership + ownership + walls + holds). |
| A3 | Every AI run records: user, active context, **tenant_id**, workspace/matter, model route, token/usage, policy version. |
| A4 | Model vendors are adapters behind `ModelRouter` — domain never imports a single-vendor SDK as truth. |
| A5 | Enterprise isolation: vector collections / indexes are **tenant-scoped** (and wall-aware). |
| A6 | Disclaimers are mandatory on client-facing preliminary assessments. |
| A7 | No silent training on private tenant documents without contractual + technical opt-in controls. |
| A8 | AI cannot grant itself permissions or bypass file ACL, ethical walls, or legal holds. |

### 10.3 Readiness prerequisites (must exist before “TORE AI” phase scale-up)

1. Document ACL + storage key discipline  
2. Tenant + Workspace / Matter identifiers  
3. Usage ledger  
4. Model routing policy table / config  
5. Audit hooks  
6. Clear disclosure UX in all locales  

---

## 11. Scalability Strategy

### 11.1 Application shape

Near-/mid-term: **modular monolith** (Next.js App Router + Clean Architecture), one deployable unit for marketplace + emerging workspace.

Long-term extraction candidates (only when metrics justify):

- Search / listing read models  
- Payment webhooks & payout workers (Platform Commerce)  
- AI inference workers  
- Notification fan-out  
- Vector / RAG services  

Extract **along domain boundaries with ports**, never by copying Prisma into services.

### 11.2 Data

- PostgreSQL as system of record  
- Redis for rate limits / ephemeral coordination (prod)  
- Object storage for blobs (S3-compatible)  
- Optional search index for directory scale  
- Vector store per-tenant or with mandatory tenant predicates  

### 11.3 Multi-tenancy

Logical tenancy via **`tenant_id`** first (Individual personal tenant or Organization tenant). Workspace/Matter nest under tenant. Physical isolation (dedicated DB / indexes) is an Enterprise-phase option for large customers — designed for, not required on day one.

### 11.4 Internationalization & markets

Code: locale dictionaries + negotiated locale.  
Domain: country-aware credential and org types.  
Do not hard-code Mongolia-only enums into unrelated modules; use registries and policy packs.

### 11.5 Performance

- Cache session privilege refresh carefully (freshness vs load)  
- Listing read models / projections for directory  
- Avoid N+1 on directory and workspace/matter timelines  
- Background jobs for embeddings, payouts, reminders  

---

## 12. Migration Strategy

### 12.1 Non-breakage guarantees

Must not break without an explicit, communicated migration window:

- Existing login  
- Existing lawyer profiles  
- Existing bookings  
- Existing lawyer directory (`/lawyers`)  

### 12.2 Technique

1. **Additive schema** first (new tables / nullable columns).  
2. **Backfill** Lawyer → Professional(Lawyer).  
3. **Dual-read / dual-write** during transition.  
4. Keep `User.role` until membership + context switcher is proven.  
5. Feature flags for Organization / Workspace / AI.  
6. Redirect aliases when routes rename.  
7. Remove legacy paths only after metrics show zero critical dependency.  

### 12.3 Mapping status today → Master phases

| Capability | Status at Master v1.0 / v1.0.1 |
|------------|--------------------------------|
| Phase 1 Stabilization (P0) | Complete |
| Identity (Actor/Org) | Designed; not implemented |
| Full Marketplace multi-type | Designed; lawyer-only live |
| Service Marketplace breadth | Consultation-shaped offerings live |
| Workspace / Matter | Not implemented (booking is center today) |
| TORE AI | Roadmap only |
| Enterprise / Native Apps | Future |

---

## 13. Engineering Standards

### 13.1 Layering (mandatory)

```text
Presentation (app, components, middleware/proxy · native clients · AI tools)
    → Application (actions / API handlers, use-cases, validators)
        → Domain (entities, domain services, repository ports)
            ← Infrastructure (Prisma, Auth.js, email, storage, payments, AI adapters)
```

Dependency rule: **inward only**. Domain has zero framework imports.

### 13.2 API-first application boundary

**Constitutional rule (P11):** every future feature must be **API-first**.

- Web (server actions / route handlers), Mobile, AI agents, and future integrations **consume the same application services / use-cases**.  
- HTML forms and server actions are **adapters**, not the home of business rules.  
- Native Apps (Phase 8) must not require a forked domain — they bind to the same contracts.  
- New modules are incomplete if they can only be exercised through a single UI surface.

### 13.3 Module ownership

| Module | Owns |
|--------|------|
| Identity / Actor | Users, memberships, professional profiles, credentials, tenant assignment |
| Marketplace | Listings, search, ranking policy, public profiles |
| Engagement | Services, bookings/orders, reviews |
| **Platform Commerce** | Marketplace payments, subscriptions, commissions, marketplace payouts/refunds/disputes |
| **Practice Billing** | Invoices, retainers, matter fee lines; trust accounting (future) |
| Workspace | Workspaces, matters, tasks, timeline, calendar |
| Collaboration | Messaging, meetings |
| Files | Storage ports, ACL, sensitive purposes |
| Trust | Verification queues, terms, audit, CoI/walls/holds (as they land) |
| AI | Runs, routing, usage, retrieval adapters |
| Admin | Platform operations |
| Kernel | i18n, env guards, rate limits, notifications |

### 13.4 Quality bars

- Typecheck, unit tests, and production build must pass in CI.  
- Privileged security changes require focused tests.  
- No secrets in git.  
- Production env guards remain strict; MVP allow-flags are explicit and exceptional.  

### 13.5 Documentation hierarchy

1. **This Master Architecture (v1.x)** — constitution  
2. ADRs / Decision Log entries — deltas  
3. Phase implementation plans — execution  
4. Older MVP docs — historical & tactical detail where not superseded  

---

## 14. Coding Principles

1. Prefer clarity over cleverness.  
2. Use-cases orchestrate; domain enforces invariants.  
3. Repository ports in domain; Prisma only in infrastructure.  
4. Server actions **and** API handlers validate input (Zod), enforce active context + tenant, map domain errors.  
5. No business rules in React components.  
6. Enums stay aligned between Prisma and domain.  
7. Feature flags for incomplete multi-tenant surfaces.  
8. Do not introduce dependencies without an RFC/ADR for security-sensitive ones (payments, AI SDKs).  
9. i18n: UI strings in dictionaries; notifications prefer type + structured params.  
10. File keys are opaque; UI uses authorized app URLs for sensitive purposes.  
11. External product copy uses User / Professional / Organization / Matter nouns; internal code may retain Actor naming.

(Detailed naming/folders: see `11-coding-conventions.md` and `06-folder-structure.md` — subordinate to this constitution.)

---

## 15. Security Principles

1. Least privilege by active context and **tenant_id**.  
2. Fail closed.  
3. Sensitive files: no permanent public URLs.  
4. Rate-limit auth and high-abuse endpoints.  
5. Never log passwords, reset tokens, raw payment secrets, or full credential documents.  
6. CSRF / session hardening per Auth.js best practice.  
7. Admin, CoI, wall, and hold actions are audited.  
8. Dependency and secret scanning in CI where available.  
9. Tenant predicates on every multi-tenant query.  
10. AI retrieval is an authorization problem first, an ML problem second.  
11. Ethical walls and legal holds are deny/freeze overlays — not optional UI hints.

---

## 16. Product Principles

1. **Honesty of roles** — Lawyer ≠ Advocate; Firm ≠ Profile; SME ≠ optional company string forever.  
2. **Clear navigation language** — avoid calling every shell “workplace”. Prefer precise MN/EN labels (e.g. Үйлчлүүлэгчийн самбар, Хуульчийн самбар, Өмгөөлөгчийн самбар, Фирмийн удирдлага, Байгууллагын самбар, Системийн удирдлага).  
3. **Trust UX** — verification and listing gates remain explainable.  
4. **Commerce fairness** — organic discovery integrity (Principle P5).  
5. **AI humility** — disclosures always visible; human professionals remain accountable for advice.  
6. **Incremental value** — each phase ships usable value without requiring the entire future graph.  
7. **Accessibility & locales** — four languages treated as first-class.  

---

## 17. Implementation Order (Platform Phases)

These phases are **constitutional sequencing**. Skipping Identity before Enterprise-scale Workspace/AI is forbidden without Decision Log amendment.

| Phase | Name | Intent | Exit criteria (summary) |
|-------|------|--------|-------------------------|
| **1** | Stabilization | Secure & correct production baseline | P0 security/correctness complete; CI green |
| **2** | Identity | Actor model foundations | User + Professional typing + Organization/Membership (**Law Firm**, **Legal Entity**) + ActorContext (compat with live roles) |
| **3** | Marketplace | Multi-actor directory & fairness | Professionals + Orgs discoverable; organic ranking policy enforced; lawyer path unbroken |
| **4** | Service Marketplace | Typed services & commerce depth | ServiceOffering types beyond consultation; **Platform Commerce** payments/reviews wired; fulfillment → workspace/matter hook points |
| **5** | Workspace | Operational center | Workspace/Matter live; messages/docs/tasks rudiments; booking can graduate |
| **6** | TORE AI | Integrated intelligence | ACL-safe RAG; routing; usage; core assistants inside Workspace/Matter |
| **7** | Enterprise | Scale orgs & isolation | Advanced permissions, walls/holds maturity, policy packs, optional hard isolation, procurement workflows |
| **8** | Native Apps | Mobile/desktop clients | Same application-service contracts; no domain fork |

### 17.1 Near-term tactical note (does not reorder constitution)

Completing **payments, messaging, and reviews** on the current Client↔Lawyer loop may proceed as **Phase 1 residual / early Phase 4 Platform Commerce** so the marketplace earns trust continuously — but **must not** invent permanent architectures that contradict Actor/tenant / Workspace-Matter / ranking principles.

**Hardening rule (v1.0.1 clarification, not a phase reorder):** legacy pairwise Client↔Lawyer commerce may complete on existing User/LawyerProfile paths. **Org-payer, firm-owned Matter, or multi-seat features require Phase 2 Identity first.**

### 17.2 Explicit non-goals per early phases

- Phase 2–3: no full Harvey-class AI, no native apps; **no Government/NGO/University org products**  
- Phase 5: no requirement for every AI module; Practice Billing deep trust accounting remains future  
- Phase 6: no unpaid data-training on private tenants  

---

## 18. Future Expansion

Roadmap-compatible expansions (non-exhaustive):

- Additional professional types via registry  
- **Government / NGO / University** organization types (deferred past Phase 2)  
- Education marketplace & CLE  
- Template & knowledge stores  
- Cross-border investor packs  
- Public API / partner ecosystem (builds on API-first boundary)  
- White-label enterprise shells  
- Voice & realtime meeting intelligence  
- Advanced litigation tooling (evidence, hearing prep)  
- Trust accounting within Practice Billing  

All expansions must attach to **Identity · Workspace/Matter · Marketplace · Platform Commerce / Practice Billing · AI** — not spawn parallel product cores.

---

## 19. Risk Management

| Risk | Severity | Mitigation |
|------|----------|------------|
| Premature Workspace before Identity | High | Phase gate in §17 |
| Collapsing Advocate into Lawyer | High | Typed credentials + service gates |
| Paid ranking pressure | High | Constitutional P5 + audit |
| AI data leakage | Critical | ACL-before-embed; tenant indexes; walls |
| Big-bang rewrite of MVP | High | Additive migration §12 |
| Modular monolith becomes ball of mud | Medium | Module ownership §13; extraction criteria §11 |
| Overbuilding Enterprise early | Medium | Flagged features; Legal Entity thin slice first |
| Locale fragmentation | Medium | Dictionary discipline; notification type+params |
| Payment provider lock-in | Medium | Platform Commerce port; `provider` as adapter metadata |
| Legal liability from AI tone | High | Disclaimers; no authoritative conclusions |
| Confusing Platform Commerce with Practice Billing | High | §9 split + module ownership |
| Org bookings before Identity | High | §17.1 hardening rule |

---

## 20. Decision Log

| ID | Date | Decision | Status |
|----|------|----------|--------|
| D-MA-001 | 2026-08-11 | Adopt Actor as core domain (not Lawyer) | Accepted |
| D-MA-002 | 2026-08-11 | Adopt Workspace/Matter as future product center (not Booking) | Accepted (clarified in v1.0.1: Matter = work container; Workspace = environment) |
| D-MA-003 | 2026-08-11 | Lawyer ≠ Advocate; Firm ≠ Profile; SME ≠ companyName forever | Accepted |
| D-MA-004 | 2026-08-11 | Organic ranking must not be secretly paid | Accepted |
| D-MA-005 | 2026-08-11 | AI is integrated assistance under ACL; not a standalone chatbot core | Accepted |
| D-MA-006 | 2026-08-11 | Platform phases 1→8 as sequencing constitution | Accepted (**unchanged** by v1.0.1) |
| D-MA-007 | 2026-08-11 | Keep Clean Architecture modular monolith until extraction criteria met | Accepted |
| D-MA-008 | 2026-08-11 | Master Architecture v1.0 supersedes conflicting earlier framings | Accepted |
| D-MA-009 | 2026-08-11 | Phase 1 Stabilization recognized complete as baseline | Accepted |
| D-MA-010 | 2026-08-11 | **Errata:** Actor is internal eng term; external nouns prefer User/Professional/Organization/… | Accepted (v1.0.1) |
| D-MA-011 | 2026-08-11 | **Errata:** Matter is primary legal work container; Workspace is higher-level environment; provider-tenant owns Matter; clients are participants | Accepted (v1.0.1) |
| D-MA-012 | 2026-08-11 | **Errata:** Single primary tenant model (`tenant_id`); Individuals, Law Firms, Legal Entities become tenants as specified | Accepted (v1.0.1) |
| D-MA-013 | 2026-08-11 | **Errata:** Authorization expands to RBAC, ownership, memberships, CoI, Ethical Walls, Legal Hold, Audit Trail (conceptual) | Accepted (v1.0.1) |
| D-MA-014 | 2026-08-11 | **Errata:** Split Platform Commerce vs Practice Billing | Accepted (v1.0.1) |
| D-MA-015 | 2026-08-11 | **Errata:** API-first application boundary (P11) | Accepted (v1.0.1) |
| D-MA-016 | 2026-08-11 | **Errata:** Phase 2 org types = Law Firm + Legal Entity only; others deferred | Accepted (v1.0.1) |

Amendments require a new Decision Log row and a version bump.

---

## 21. Technical Debt Policy

### 21.1 Allowed debt

- Dual-read/write during migrations  
- Compat `User.role` home shell while ActorContext rolls out  
- Schema tables ahead of UI (payments/messaging historically) **only** with tracked ports and a phase owner  
- Feature flags for incomplete multi-tenant surfaces  
- Deferred implementation of CoI / Ethical Walls / Legal Hold / trust accounting after their conceptual place is reserved  

### 21.2 Forbidden debt

- Permanent security shortcuts (public credential URLs, trusting JWT role forever, skipping tenant ACL)  
- Secret paid ranking columns without sponsored inventory design  
- Domain imports of AI vendor SDKs  
- Duplicate User accounts as the “solution” for multi-membership  
- Copy-paste of Workspace logic into Marketplace with divergent ACL  
- Merging Platform Commerce and Practice Billing into one ambiguous payment model  
- UI-only features with no application-service/API path  

### 21.3 Debt budget

Each phase exit must list:

- opened debt  
- closed debt  
- residual risk  

Security debt cannot carry across phase exits without executive (product + eng lead) sign-off in the Decision Log.

---

## 22. Alignment with existing codebase (informative)

At Master v1.0 / v1.0.1 adoption, production code still implements an **Individual Client ↔ Lawyer** marketplace loop with schema stubs for payment/messaging/review. That is expected. The constitution describes the **target shape**; phases move the codebase toward it without requiring a rewrite.

Related documents (subordinate or historical):

- `03-target-architecture.md` — modular monolith tactics  
- `04-domain-model.md` — MVP bounded contexts  
- `05-database-design.md` — current schema intentions  
- `11-coding-conventions.md` — coding detail  
- `15-ai-module-roadmap.md` — AI module ideas  
- `19-tore-ecosystem-architecture.md` — Client + Pro product vision (maps to Marketplace + Workspace/AI under this constitution)  
- `21-master-architecture-review-freeze.md` — adversarial review that produced v1.0.1 errata  

---

## 23. Document control

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-08-11 | Initial constitutional Master Architecture (principles frozen) |
| **1.0.1** | **2026-08-11** | **Freeze Errata** — terminology, Matter/Workspace, tenant_id, authz expansion, commerce split, API-first, Phase 2 org-type scope. **No phase reorder. No implementation.** |

**Maintainers:** Product + Engineering leads  
**Change process:** Propose → Decision Log entry → version bump → announce when behaviorally binding for an implementation phase  

---

*End of TORE Master Architecture v1.0.1*
