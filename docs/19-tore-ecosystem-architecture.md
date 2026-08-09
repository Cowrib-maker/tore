# TORE Ecosystem Product Architecture

| Field | Value |
|-------|-------|
| **Document** | `19` — TORE Ecosystem Product Architecture |
| **Role** | Long-term product & platform architecture (Chief Product Architect) |
| **Status** | Vision / design authority — **not an implementation brief** |
| **Constraint** | Preserve Clean Architecture · **do not** reshape current production code from this document alone |
| **Products** | **TORE Client** (marketplace + AI intake) · **TORE Pro** (Harvey-class AI legal workspace) |
| **Baseline** | Marketplace modular monolith at `v0.2.0-alpha` (Sprint 1–2 complete) |
| **Supersedes for vision** | Narrow “marketplace-only” framing in earlier docs; those docs remain valid for **MVP delivery** |
| **Related** | [03 Target Architecture](./03-target-architecture.md) · [15 AI Module Roadmap](./15-ai-module-roadmap.md) · [05 Database Design](./05-database-design.md) |

---

## Purpose

This document defines how TORE evolves from a Mongolia-first legal marketplace into a **complete AI-powered legal ecosystem**: consumer/business client journeys on one side, and a professional AI workspace on the other — without collapsing liability, trust, or architecture boundaries.

It is written to guide product, engineering, security, and go-to-market decisions for **several years**. It deliberately contains **no implementation code** and does **not** authorize changes to production.

---

## Strategic posture

```text
                    ┌──────────────────────────────────────────┐
                    │           TORE PLATFORM KERNEL           │
                    │  Identity · Billing · Files · Audit · i18n│
                    │  Permissions · Events · Observability    │
                    └───────────────────┬──────────────────────┘
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │                                                   │
              ▼                                                   ▼
┌─────────────────────────────┐                   ┌─────────────────────────────┐
│        TORE CLIENT          │◄── marketplace ──►│         TORE PRO            │
│  Individuals · Businesses · │    bookings,      │  Lawyers · Firms · Legal    │
│  Foreign investors          │    matters, CRM   │  depts · (Prosecutors /     │
│                             │                   │   Gov legal — future)       │
│  AI Legal Assistant         │                   │  AI Workspace (Harvey-like) │
│  Discovery · Booking        │                   │  Practice OS · Docs · Billing│
│  Meetings · Payments        │                   │                             │
└─────────────────────────────┘                   └─────────────────────────────┘
```

**Non-negotiable product truth:** AI provides **preliminary assistance and workflow acceleration**. It **does not** replace licensed legal advice. Every AI surface must disclose this clearly (MN / EN / ZH / KO).

---

## 1. Product roadmap (Version 1 → Version 5)

Versions are **product releases**, not single sprints. Marketplace MVP sprints (S3–S10) can complete **inside V1–V2** without waiting for Pro depth.

| Version | Theme | Client outcomes | Pro outcomes | Business outcome |
|---------|--------|-----------------|--------------|------------------|
| **V1 — Trusted Marketplace Foundation** | Trust, liquidity, payments | Verified lawyer discovery, book, pay, meet | Profile, offerings, calendar basics, earning | Credibility in Mongolia; GMV ramp |
| **V2 — AI-Assisted Matching Bridge** | Intake → match → book | Guided AI intake, classification, option explainer (disclaimer), lawyer recommendations | Intake brief on new leads; light AI chat | Higher conversion; better fit bookings |
| **V3 — TORE Pro Workspace Core** | Daily work OS | Matter status after booking; shared docs | AI Chat, Drafting, Research, DMS, Tasks, Calendar, CRM lite | Seat subscriptions; firm adoption |
| **V4 — Deep Legal AI + Firm Scale** | Harvey-depth modules | Advanced matter collaboration | Contract gen/review, litigation suite, evidence, timeline, hearing prep, compare, translation | Enterprise ARR; differentiation |
| **V5 — Ecosystem & Institutional Reach** | Platform of platforms | Investor / corp journey packs; mobile | Multi-office, corp legal depts, prosecutors/gov adapters, APIs | Ecosystem lock-in; B2G readiness |

### Version detail

#### V1 — Trusted Marketplace Foundation

- Finish verification, catalog, availability, bookings, reviews, messaging, payments, payouts.
- Harden identity, RBAC, audit, rate limits, bilingual (then multi-language) UX.
- Establish **Shared Platform Kernel** boundaries so Client and Pro never share destructive schemas.
- KPI: verified supply, booking completion, payment success, NPS for consultation quality.

#### V2 — AI-Assisted Matching Bridge

- **Client AI Legal Assistant** (narrow): describe → follow-ups → preliminary assessment → classification → options → document checklist → suitable lawyer shortlist → book.
- Every AI step: disclaimers, human lawyer required for advice, exportable “intake packet” for the lawyer.
- Pro side: receive structured intake; optional reply assist.
- KPI: intake completion, match acceptance, time-to-book, lawyer satisfaction with briefs.

#### V3 — TORE Pro Workspace Core

- Matters (firm-owned), Client CRM link to marketplace or offline clients, calendar, tasks, billing/time, document management.
- AI modules: **Chat, Drafting, Legal Research, Case Summary** on matter context with retrieval over **authorized** documents only.
- Client: post-booking matter room (messages, files, meetings) — not a second “mini-Harvey”.
- KPI: WAU lawyers, docs generated with edit-gate, seat paid conversion.

#### V4 — Deep Legal AI + Firm Scale

- Contract Generator / Review / Comparison / Risk analysis.
- Litigation Assistant, Evidence Analyzer, Timeline Builder, Hearing Preparation.
- Translation for legal docs; decision summarization.
- Firm policy packs, matter templates, multi-seat admin.
- KPI: enterprise logos, AI feature attach rate, hours saved (declared), complaint rate on AI outputs.

#### V5 — Ecosystem & Institutional Reach

- Public APIs & partner ecosystem; mobile Client + Pro apps.
- Corporate legal department workspaces; optional government / prosecutor workflows (separate compliance track).
- Cross-border investor journeys (ZH/KO/EN-first packs) with Mongolia counsel network.
- KPI: API revenue, mobile MAU, institutional pilots.

### What to build first (business value max)

Order for **maximum near-term value** while protecting architecture:

1. **Marketplace trust loop** (verification → list → book → pay → meet → review) — *revenue & trust survive without AI*
2. **Payments + payouts** — *makes marketplace real*
3. **Client AI intake → match → book** — *differentiator with controlled liability*
4. **Pro matter intake brief + CRM light** — *lawyer retention*
5. **Pro AI Chat + Drafting + DMS** — *seat monetization*
6. **Contract review/gen** — *enterprise wedge*
7. **Litigation / evidence / hearing suite** — *depth & moat*
8. **Mobile + public API** — *scale & ecosystem*

---

## 2. Information architecture

### 2.1 Product shells

| Shell | Primary routes (conceptual) | Audience |
|-------|----------------------------|----------|
| **Marketing** | `/`, pricing, trust, faq | Public |
| **TORE Client app** | `/client/*` | Individuals, businesses, investors |
| **TORE Pro app** | `/pro/*` (future; today lawyer surfaces grow toward this) | Lawyers, firms, legal depts |
| **Admin** | `/admin/*` | Platform operators |
| **Auth** | `/login`, `/register/*` | All |

Do **not** require locale URL prefixes for V1–V3 (keep cookie/i18n). Optional SEO prefixes later without rewriting domain model.

### 2.2 TORE Client IA

```text
Client Home
├── AI Legal Assistant
│   ├── New matter intake (conversation)
│   ├── Assessment summary (disclaimer)
│   ├── Options & document checklist
│   └── Recommended lawyers → Book
├── Find lawyers (directory / filters)
├── Bookings
│   ├── Upcoming / past
│   ├── Meeting room
│   └── Payments & invoices
├── Messages
├── Documents (client vault — shared with booked counsel)
├── Profile & preferences (language, notifications)
└── Help & legal notices
```

### 2.3 TORE Pro IA

```text
Pro Home (command palette)
├── AI Workspace
│   ├── Chat
│   ├── Drafting
│   ├── Contract Generator
│   ├── Contract Review
│   ├── Litigation Assistant
│   ├── Evidence Analyzer
│   ├── Timeline Builder
│   ├── Hearing Preparation
│   ├── Legal Research
│   ├── Case Summary
│   ├── Translation
│   └── Document Comparison
├── Matters
├── Clients (CRM)
├── Calendar
├── Tasks
├── Documents
├── Time & Billing
├── Marketplace (leads, profile, offerings, verification)
├── Firm settings (seats, roles, policies, billing)
└── Help & AI disclaimers
```

### 2.4 Cross-product objects (shared meaning)

| Object | Client view | Pro view |
|--------|-------------|----------|
| **Person / Org** | Client profile | CRM contact / company |
| **Intake** | AI conversation outcome | Lead brief |
| **Booking** | Purchase of consultation | Marketplace engagement |
| **Matter** | Limited collaboration room | Firm-owned workfile |
| **Document** | Client vault item | DMS versioned artifact |
| **Meeting** | Online consultation | Calendar event |
| **Invoice / Payment** | Pay / receipt | Billable / payout |

Matters are **Pro-owned**. Bookings may **spawn** or **link** a Matter; offline Pro clients have Matters with no Booking.

---

## 3. Module architecture

Keep **modular monolith + Clean Architecture**. Logical packages (contexts), not microservices by default.

### 3.1 Context map

| Context | Owns | Consumed by |
|---------|------|-------------|
| **Identity** | Users, sessions, MFA (future), terms, account status | All |
| **Access** | Roles, permissions, org membership, feature flags | All |
| **Marketplace** | Lawyer profile, verification, offerings, availability, discovery, bookings, reviews | Client, Pro, Admin |
| **Payments** | Checkout, fees, payouts, refunds, tax artifacts | Client, Pro, Admin |
| **Messaging** | Threads, messages (booking- and matter-scoped) | Client, Pro |
| **Meetings** | Scheduling bridges, video session refs | Client, Pro |
| **Client Experience** | Client dashboard UX orchestration | Client |
| **Pro Practice** | Matters, CRM, calendar, tasks, time, billing, DMS | Pro |
| **Legal AI** | Prompts, runs, tools, RAG indices, evals, cost | Client, Pro |
| **Notifications** | In-app, email, (push later) | All |
| **Files** | Blobs, virus scan hooks, retention | Marketplace, Practice, AI |
| **Audit** | Immutable event log | Admin, Compliance |
| **Admin Ops** | Verification queue, disputes, AI policy, billing ops | Admin |
| **i18n / Content** | Dictionaries, legal notice versions | All |

### 3.2 Layering (unchanged rule)

```text
Presentation (Next.js app routes, UI)
  → Application (use-cases, validators, orchestration)
    → Domain (entities, domain services, ports)
      ← Infrastructure adapters (Prisma, Auth, storage, LLM providers, payment gateways)
```

**Legal AI** is a first-class context with ports:

- `LlmCompletionPort`, `EmbeddingPort`, `RagRetrievePort`, `ModerationPort`, `DocumentExtractPort`
- Domain never imports a specific vendor SDK.

### 3.3 Module dependency direction

```text
Identity / Access / Files / Audit / i18n
        ↑
Marketplace ←→ Payments ←→ Meetings ←→ Messaging
        ↑                      ↑
 Client Experience        Pro Practice
        ↑                      ↑
              Legal AI
```

AI may read **authorized** matter/booking documents via Files + Access checks; it must never write “legal conclusions” as authoritative platform judgments without human gate.

---

## 4. Database evolution

Evolve **additively**. Avoid rewriting marketplace tables for AI. Prefer new schemas / table prefixes per context.

### 4.1 Stages

| Stage | Schema focus |
|-------|----------------|
| **Now–V1** | Identity, profiles, verification, offerings, availability, bookings, reviews, payments foundations |
| **V2** | `ai_conversations`, `ai_messages`, `ai_assessments`, `ai_recommendations`, `ai_disclaimers_ack`; link to booking/lead |
| **V3** | `organizations`, `memberships`, `matters`, `matter_parties`, `crm_contacts`, `tasks`, `calendar_events`, `time_entries`, `invoices` (pro), `documents`, `document_versions` |
| **V4** | `ai_runs`, `ai_artifacts`, `ai_citations`, `evidence_items`, `timelines`, `hearing_packs`, `contract_reviews`, `translations` |
| **V5** | `api_clients`, `api_keys`, `webhooks`, `mobile_devices`, `entitlement_grants`, institutional tenant configs |

### 4.2 Core relational ideas

- **Organization** — firm or corporate legal dept (and later agency).
- **Membership** — user ↔ org with role.
- **Matter** — practice container; optional `origin_booking_id`.
- **DocumentVersion** — immutable versions; AI always pins version ids in citations.
- **AiRun** — model, prompt version, tokens, cost, safety flags, input/output refs; retain for audit.
- Soft-delete + partial unique indexes remain the uniqueness strategy (as established).

### 4.3 Data residency / retention

- Mongolia-first residency preference for PII and matter documents (policy-configurable for enterprise).
- AI logs: retention windows by class (operational vs training — **no customer data training by default**).
- Legal holds for disputes.

---

## 5. AI architecture

### 5.1 Principles

1. **Assistance, not substitution** — mandatory UI + PDF disclaimer on assessments and drafts.
2. **Human-in-the-loop** — filings, client opinions, and final contracts require lawyer acknowledgment for Pro; Client AI never presents as counsel.
3. **Grounding** — prefer retrieval over firm/client docs + curated Mongolia legal corpus; show citations.
4. **Vendor portability** — provider behind ports; allow dual-provider failover.
5. **Eval-gated releases** — prompts versioned; offline eval sets for MN law tasks before prod.
6. **Cost & abuse controls** — per-seat/org budgets, rate limits, malware/prompt-injection defenses on uploads.

### 5.2 Capability map

| Capability | Client | Pro | Priority |
|------------|--------|-----|----------|
| Follow-up questioning / intake | ● | ○ | V2 |
| Initial assessment & classification | ● | ○ (view) | V2 |
| Options & doc checklist | ● | ○ | V2 |
| Lawyer recommendation | ● | — | V2 |
| AI Chat (matter-scoped) | ○ | ● | V3 |
| Drafting (complaints, responses, petitions, objections, appeals) | — | ● | V3–V4 |
| Contract generate / review / risk / compare | — | ● | V4 |
| Legal research & case summary | ○ | ● | V3–V4 |
| Evidence analyze / timeline / hearing prep / strategy assist | — | ● | V4 |
| Translation | ○ | ● | V4 |
| Court decision summary | ○ | ● | V4 |

### 5.3 Runtime pipeline (logical)

```text
User action
  → Access check (org/matter/booking scope)
  → Policy check (entitlement, disclaimer ack, retention class)
  → Context packer (prompts + RAG chunks + structured matter metadata)
  → Moderation / PII handling
  → LLM / tools
  → Output validator (schema, citation presence, refusal rules)
  → Persist AiRun + artifacts
  → UI with disclaimer + edit gate (Pro) / “consult a lawyer” CTA (Client)
```

### 5.4 RAG corpora

| Corpus | Contents | Access |
|--------|----------|--------|
| **Matter vault** | Uploaded docs/versions | Matter members only |
| **Firm knowledge** | Templates, playbooks | Org members by permission |
| **Platform knowledge** | Public statutes summaries, TORE help | Authenticated |
| **Marketplace catalog signals** | Practice areas, offerings (not private case content) | Client matching |

### 5.5 Safety UX copy (product requirement)

Standard statement (localized): *TORE AI provides legal assistance tools and preliminary information. It does not replace advice from a licensed lawyer. Important decisions and filings must be reviewed by a qualified professional.*

---

## 6. Marketplace architecture

Marketplace remains a **bounded context**, not a side feature of Pro.

### 6.1 Core flows

1. Lawyer onboarding → credential verification → offerings → availability → listing.
2. Client discovery (and/or AI match) → booking → payment → meeting → review.
3. Lead routing: AI intake packet attached to booking; lawyer accepts/declines within SLA.

### 6.2 Matching

- Deterministic filters: practice area, language, price, modality, city, availability.
- AI ranker: suggest **shortlist with reasons**; never silent auto-assign without user confirmation.
- Fairness constraints: avoid winner-take-all; explore/exploit and verification quality weighting.

### 6.3 Trust services

- Verification workflow (admin).
- Reviews post-completed booking only.
- Dispute hooks into Payments + Admin.

### 6.4 Marketplace ↔ Pro

- Booking completion may create Matter skeleton + CRM contact.
- Marketplace earnings ledger separate from Pro firm billing (client invoices).

---

## 7. Subscription model

### 7.1 Packaging

| Package | Who | Includes | Monetization |
|---------|-----|----------|--------------|
| **Client Free** | Individuals | Directory browse, limited AI intake | Lead to paid consult |
| **Client Plus** (optional later) | SMEs / investors | Higher AI limits, saved assessments, priority match | Subscription |
| **Consultation GMV** | Clients | Bookings | Take-rate / fees |
| **Pro Starter** | Solo lawyers | Marketplace tools + limited AI | Low seat price |
| **Pro Professional** | Active practitioners | Full AI core (chat, draft, research, DMS, CRM, time) | Seat / mo |
| **Pro Firm** | Firms | Seats, admin, SSO (later), policy packs, higher limits | Seat + platform fee |
| **Enterprise / Institutional** | Corp legal / future B2G | Custom retention, VPC options, API, SLA | Contract |

### 7.2 Entitlements

Represent features as **entitlement keys** (e.g. `ai.drafting`, `ai.contract_review`, `marketplace.list`) evaluated by Access context — not scattered `if (plan === …)` in UI.

### 7.3 Usage metering

- Token/document units per org/seat.
- Soft caps + upgrade prompts; hard caps on abuse.
- Marketplace GMV fees independent of AI meter.

---

## 8. Permission model

### 8.1 Principals

- **User** (identity)
- **Organization** (firm / corp legal)
- **Platform Admin**

### 8.2 Role layers

| Layer | Examples |
|-------|----------|
| **Platform roles** | `CLIENT`, `LAWYER`, `ADMIN` (exist today) |
| **Org roles** | Owner, Admin, Lawyer, Paralegal, Finance, Read-only |
| **Matter roles** | Lead counsel, Collaborator, External guest (future) |
| **AI permissions** | Use module X; export; share with client |

### 8.3 Authorization pattern

- Central policy: `can(principal, action, resource)`.
- Enforce in **application use-cases**, not only UI.
- AI tools re-check matter document ACLs before retrieval.

### 8.4 Future institutional roles

Prosecutors / government professionals: **separate org type + compliance profile**, not a boolean on lawyer accounts.

---

## 9. Multi-language strategy

### 9.1 Product languages

Supported UI: **Mongolian (default), English, Simplified Chinese, Korean** — cookie + localStorage persistence, browser default on first visit (already pioneered).

### 9.2 Content classes

| Class | Approach |
|-------|----------|
| **UI chrome** | Translation dictionaries (type-safe) |
| **Legal notices / disclaimers** | Versioned, locale-specific; re-ack on material change |
| **Taxonomy** (practice areas) | `nameMn` / `nameEn` / extend ZH/KO fields or JSON maps |
| **User-generated content** | Stored as authored; optional AI translate with “machine translation” label |
| **AI outputs** | Respond in user’s preferred language; preserve cited statute language where required |

### 9.3 AI language

- System prompts localized; evaluation sets per language.
- Translation module is an explicit Pro feature (V4), not silent mutation of originals.

---

## 10. Future mobile app architecture

### 10.1 Strategy

- **Phase A:** Responsive web (Client + Pro).
- **Phase B:** **TORE Client** native (iOS/Android) — intake, book, pay, meet, messages.
- **Phase C:** **TORE Pro** tablet-first / mobile companion — notifications, approvals, light chat — full drafting remains desktop-class.

### 10.2 Technical approach

- Shared **BFF / API** contracts (section 11).
- Auth: OAuth/OIDC-compatible sessions or token exchange from Auth.js era.
- Offline: draft queues for messages; never offline AI committing to server without sync conflict rules.
- Push notifications via Notifications context.

### 10.3 Store compliance

- Legal disclaimers in onboarding.
- No “guaranteed legal outcome” claims.

---

## 11. API architecture

### 11.1 Internal

- Prefer Server Actions / RSC for first-party web (current direction).
- Domain use-cases remain the **only** business entry for mutations.

### 11.2 External (V5, prepare contracts in V3+)

| API | Purpose |
|-----|---------|
| **Public REST/JSON** | Partner integrations, mobile apps |
| **Webhooks** | Booking events, payment events, matter status |
| **AI async jobs** | Long-running review/analysis with job status endpoints |

### 11.3 Versioning & safety

- URL versioning `/v1`.
- Idempotency keys on payments and booking creates.
- Scoped API keys per org; rotate; audit.

### 11.4 Event backbone (in-process → later bus)

Domain events: `BookingCompleted`, `MatterCreated`, `AiRunSucceeded`, `PayoutSettled` — today as transactional outbox table; later optional queue without rewriting use-cases.

---

## 12. Scalability strategy

### 12.1 Near term (V1–V3)

- Stay on **modular monolith** (Next.js + Postgres).
- Vertical scale + Postgres indexes + connection pooling.
- Object storage for documents; CDN for static.
- Separate **worker process** for AI jobs, PDF extract, virus scan (same repo, different entrypoint).

### 12.2 Growth (V4–V5)

| Load | Tactic |
|------|--------|
| AI spikes | Queue + concurrency limits per org; multi-provider |
| Search/discovery | Postgres → OpenSearch/Typesense when needed |
| Read-heavy catalogs | Cache (Redis) with explicit invalidation |
| Multi-region | Active-passive DB first; pin matter data residency |
| Extreme isolation | Extract Payments or AI worker into services **behind existing ports** |

**Rule:** Split only at port boundaries after metrics demand it — not by fashion.

---

## 13. Security architecture

### 13.1 Pillars

- **AuthN** — strong sessions; MFA for Pro/Admin (roadmap); device hygiene for mobile.
- **AuthZ** — continuous enforcement in use-cases (section 8).
- **Data protection** — encryption in transit; encryption at rest for object storage; field-level for sensitive IDs where required.
- **AI security** — prompt injection resistance, untrusted document isolation, egress controls, no default training on customer data.
- **Payments security** — PCI via provider; never store raw PAN.
- **Abuse** — rate limits, anomaly detection on AI burn, verification fraud checks.
- **Audit** — immutable logs for admin, verification, AI runs, permission changes.
- **SDLC** — dependency scanning, CI, secrets management, least-privilege cloud roles.

### 13.2 Threat focus (Mongolia legal marketplace)

- Fake lawyer listings → verification gates.
- Leakage of matter docs via AI/debug tools → ACL + redaction + env separation.
- Cross-tenant RAG bleed → hard org/matter filters in retriever tests.

---

## 14. Enterprise architecture

### 14.1 Tenant model

- **Personal lawyer** = org of one.
- **Firm** = multi-seat org with billing owner.
- **Corporate legal** = org type with tighter sharing rules and optional SSO (SAML/OIDC).
- **Institutional (future)** = regulated tenant profile, custom DPA, audit exports.

### 14.2 Enterprise needs

- SSO / SCIM (later), domain claims, IP allow lists (optional).
- Admin analytics: utilization, AI cost, matter throughput.
- Contractual data processing agreements; subprocessors list (LLM, storage, payments).
- Configurable retention and export (matter export package).

### 14.3 Harvey-class positioning without recklessness

Compete on **workflow depth + Mongolia marketplace distribution + multilingual** — not on claiming autonomous licensed practice.

---

## 15. Admin architecture

### 15.1 Consoles

| Area | Capabilities |
|------|----------------|
| **Identity** | Account status, impersonation ban, force logout |
| **Verification** | Lawyer credential queue, approve/reject, evidence |
| **Marketplace ops** | Listings, disputes, review moderation |
| **Payments ops** | Refunds, payout holds, fee configs |
| **AI governance** | Prompt versions, kill switches, eval dashboards, cost anomalies |
| **Content / i18n** | Notice versions, taxonomy translations |
| **Enterprise** | Contracts, entitlements, SSO configs |
| **Security** | Audit search, API key revoke |

### 15.2 Design rules

- Admin actions go through use-cases + audit events.
- Dual control for irreversible money and mass AI policy changes (V4+).
- Feature flags per org for gradual AI rollouts.

---

## Cross-cutting: Clean Architecture preservation

| Do | Don’t |
|----|-------|
| Add new contexts/packages behind ports | Embed LLM SDKs in domain |
| Grow Pro under practice + AI contexts | Stuff AI columns into `Bookings` as dump |
| Keep marketplace shippable without Pro AI | Block marketplace MVP on Harvey-scope |
| Version prompts & entitlements | Scatter plan checks in React components |
| Document disclaimers as product requirements | Ship AI that looks like legal advice |

**Implementation freeze note:** This document must **not** be used as a pretext to rewrite existing production modules mid-sprint. Introduce ecosystem scope via **new bounded contexts** and additive schema after Product schedules work.

---

## Recommended near-term Product sequence (maximize value)

```text
1) Complete Marketplace V1 trust & money path
2) Ship Client AI Intake → Recommend → Book (V2 wedge)
3) Matter + CRM light on Pro (convert wins into workspace habit)
4) Pro AI Chat + Drafting + DMS (start subscriptions)
5) Contract Review (enterprise sales wedge)
6) Litigation / Evidence / Hearing suite
7) Mobile Client + Public API
```

---

## Success metrics (north stars)

| Product | North star | Guarding metrics |
|---------|------------|------------------|
| **Client** | Successful paid consultations | AI disclaimer ack rate; complaint rate; match quality |
| **Pro** | Weekly active paying seats | AI edit-gate compliance; doc ACL incidents (target zero) |
| **Platform** | Net revenue (GMV fees + subscriptions) | Churn, verification SLAs, AI COGS margin |

---

## Open decisions (for Product / Legal / Compliance)

1. Regulated marketing language for AI in Mongolia (final counsel-approved wording).
2. Whether Client Plus subscription launches in V2 or stays GMV-only.
3. Video provider strategy (embedded vs deep-link).
4. Timing of firm orgs vs solo-only Pro.
5. Government / prosecutor track: separate product brand or TORE Pro edition?
6. Training-data policy contractual commitments for enterprise RFPs.

---

## Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-08-09 | Initial ecosystem architecture — Client + Pro dual-product vision |

**Owners:** Product (authority) · Eng architecture (feasibility) · Legal/Compliance (claims & disclaimers) · Security (AI & tenancy)

**Next artifact when implementation is approved:** thin ADRs per context (`docs/architecture/adr-NNNN-*.md`) — still without rewriting current production paths until scheduled.
