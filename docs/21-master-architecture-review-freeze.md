# TORE Master Architecture v1.0 — Critical Review & Freeze Recommendation

| Field | Value |
|-------|-------|
| **Document** | Architecture Review of `20-tore-master-architecture-v1.md` |
| **Date** | 2026-08-11 |
| **Mode** | Adversarial review — not an endorsement essay |
| **Horizon** | 5–10 years |
| **Comparators** | Salesforce, Microsoft 365, Atlassian, Notion · Harvey, Clio, MyCase, PracticePanther · Upwork, Fiverr, Airbnb · enterprise multi-tenant SaaS |
| **Code / migration** | None — documentation only |

---

## Executive verdict

The document is a **strong strategic constitution** and a **weak executable data model**.

As a 5–10 year *compass* (what TORE is, what it refuses, phase gates, AI/ACL morality, marketplace fairness), it is good enough to freeze.

As a 5–10 year *immutable schema & tenancy law*, it is **not** yet safe: several abstractions are overloaded, Workspace vs Matter ownership is underspecified, and tenant boundaries are multi-headed — class of bugs that take years to unwind (classic SaaS failure pattern).

**Recommendation:** Freeze **TORE MASTER ARCHITECTURE v1.0** for principles, mission, marketplace fairness, AI rules, phase sequencing intent, and debt policy — **and require Freeze Errata v1.0.1 (docs only) before any Phase 2 Identity implementation**. Do not treat §§4–5 entity graphs as frozen relational gospel until those errata land.

---

## 1. Strengths

| Strength | Why it holds under adversary review |
|----------|-------------------------------------|
| **Lawyer is not the core** | Correct. Clio/MyCase/PracticePanther center on firm/matter work; Harvey centers on firm workspace + documents. Hard-coding Lawyer as the universe guarantees rewrite when Advocate/firm/SME arrive. |
| **User ≠ acting context** | Correct. M365/Salesforce separate login principal from tenant membership. One login, many memberships is the only scalable people model. |
| **Marketplace ≠ OS** | Correct. Airbnb is not the full trip OS; Upwork contract is not the full delivery OS. Separating discovery/commerce from work prevents Upwork-shaped product collapse into “gigs only.” |
| **P5 — no secret paid organic rank** | Correct for a *trust* legal marketplace. Airbnb/Upwork paid boost exists but corrodes trust in regulated professions faster. Explicit sponsored inventory is the only defensible monetization later. |
| **ACL-before-AI** | Correct and non-negotiable. Harvey-class products live or die on permissioned retrieval. Listing AI features without this would be malpractice. |
| **Additive migration + User.role compat** | Correct. Big-bang identity rewrites destroy live marketplaces. Dual-read is how every serious SaaS migrates tenancy. |
| **Modular monolith until extraction criteria** | Correct *for current stage*. Premature microservices kill small legal startups; Atlassian also grew modular monoliths for years. |
| **Phase gate: Identity before Enterprise/AI scale** | Directionally correct. Skipping tenancy then bolting AI is how data leaks become company-ending. |
| **Honest Mongolia distinctions (Lawyer ≠ Advocate)** | Correct product honesty. Flattening regulated roles is a competitor mistake TORE explicitly refuses. |
| **Clean Architecture dependency rule** | Still the right engineering firewall against Next/Prisma/AI SDK contamination of invariants. |

---

## 2. Weaknesses

### W1 — “Actor” is an overloaded abstraction

The doc uses **Actor** as:

1. the “core domain” party kind (Individual / Professional / Organization), and  
2. session **Actor Context**, and  
3. language that already collides with application code (`ActorContext`) and common eng jargon.

**Challenge:** Salesforce did not name everything “Actor.” They split **User** (login), **Account/Contact** (party), **Org** (tenant). Atlassian uses **site/org + user + membership**. Notion uses **workspace + member**.

Calling all three “Actor” will produce a decade of meetings about whether a Law Firm *is* an Actor row, a polymorphic interface, or a session enum value.

**Better (if changed):** Prefer **Party** (Individual / Professional / Organization) as the domain noun; keep **User** for authn; keep **ActorContext** (or `ActivePartyContext`) for “who am I acting as.” Do **not** rename for elegance alone — rename only if freeze errata make Party the public noun while preserving eng `ActorContext` during migration.

**Is current design “wrong”?** Strategically no. Naming-wise, yes — it is a long-term clarity tax.

### W2 — Workspace vs Matter cardinality and ownership are underspecified

Legal platforms (Clio, MyCase, PracticePanther) almost always make **Matter/Case the gravity well**, owned by the **firm (provider org)**, with **client portal access** as a grant.

This constitution says:

- Workspace is the center and “contains” Matter  
- Matters have “parties”  
- Owners may be “org or professional practice”

That allows at least three divergent implementations:

| Ambiguity | Failure mode |
|-----------|----------------|
| 1 Workspace : 1 Matter vs 1 : N | Schema thrash; AI scope bugs |
| Who owns cross-party matters? | Dual-write ownership; orphan ACL |
| Is Workspace a tenant shell (Notion) or a project (Jira)? | Confusion in UX and queries |

**Better default for legal (Clio-pattern):**

- **Organization (or Solo Practice bag) owns Matter**  
- **Client Actor is a participant with grants**  
- **Workspace** = UI/OS shell *or* = org-level container — pick one and freeze it  
- Prefer: `Organization → Workspace(s) → Matter(s)` OR skip Workspace as a data entity until Phase 5 and treat Matter as first durable work aggregate with `tenant_org_id`

**Absolute “everything belongs in Workspace” is overstated.** Platform verification queues, public listings, education SKUs, and credential review do not belong inside a collaborative Workspace. Keep: durable *engagement work* belongs to Matter/Workspace. Drop: universal containment rhetoric.

### W3 — Multiple tenant heads without a primary tenant key

Tenancy is simultaneously:

- User personal vault  
- Organization  
- Workspace  
- Platform  

Enterprise SaaS that survives (Salesforce `OrgId`, M365 tenant) picks a **primary tenant discriminator on almost every row**, then adds resource ACL inside.

Without `tenant_id` (or equivalent) as a constitutional query rule, Phase 6 RAG and Phase 7 sales will invent three incompatible isolation stories.

**Required clarification before Identity ships:** Every persisted multi-tenant row declares primary tenant (almost always OrganizationId for org work; a synthetic “personal tenant” for individuals). Workspace/Matter nest under that tenant; they are not alternate roots.

### W4 — Phase sequencing conflicts with itself

§16 forbids skipping Identity before Enterprise/AI scale (good).  
§16.1 allows payments/messaging/reviews on the legacy Client↔Lawyer loop as “Phase 1 residual / early Phase 4” (also practically necessary).

Without a sharper rule, teams will either:

- block revenue work waiting for Actor purity, or  
- implement org-owned bookings *before* Membership exists (permanent debt).

**Needed rule:** Legacy pairwise commerce may complete on `User`/`LawyerProfile`. **Any org-payer, firm-owned matter, or multi-seat feature requires Phase 2 Identity first.**

### W5 — ProfessionalProfile singularity is too strong

“One Professional Profile preferred” under-serves:

- solo listing + firm employment with firm-branded services  
- suspended personal listing while firm continues  

Firm-centric legal SaaS (Clio) treats the **firm as tenant** and users as seats; marketplace SOLO profiles are a second concern (Upwork-like). TORE is hybrid — that is fine — but the doc must admit **affiliation is first-class**, not a footnote arrow “affiliation?”.

### W6 — Marketplace catalog ambition lists products premature to core ERD

Templates, AI Tools, Knowledge, Education as peer marketplace entities too early creates Fiverr-category sprawl before liquidity in Professionals/Services exists.

**Keep as future registry language. Do not imply equal first-class ERD weight to Professionals/Services/Orgs.**

### W7 — Authorization philosophy is slogan-grade, not enterprise-grade

`can(actor, action, resource)` is the right *direction* (policy engine / ReBAC). Missing for 5–10 years enterprise:

- inheritance (org → workspace → matter → document)  
- explicit deny / ethical wall  
- admin impersonation + break-glass audit  
- external client portal identities vs full User seats  
- sharing links / guest access model  

Harvey/Clio enterprise deals die without **ethical walls / conflict checks**. Absent from constitution is a serious legal-platform gap.

### W8 — Money model fork is unnamed

Two billing universes will appear:

1. **Platform marketplace commerce** (escrow/fees like Upwork)  
2. **Practice/matter billing** (Clio time/invoices)  

Without naming both and their reconciliation, Phase 4–5 will collide (double invoices, unclear who is merchant of record).

### W9 — Workflow / domain events underspecified

Salesforce and Atlassian scale on async workflows. The doc nods at jobs but does not constitutionalize:

- domain events / outbox  
- booking → payment → workspace saga  
- idempotent webhooks  

Not fatal for v1.0 principles; fatal if Phase 4 implements payments as synchronous spaghetti inside server actions forever.

### W10 — API / native-app contract omitted

Phase 8 Native Apps with “same kernel” is stated, but there is no rule that **use-cases must remain callable without HTML forms** (API or RPC boundary). Next.js server-action-centric MVP will fight mobile later (common monolith debt).

### W11 — UX naming: shell proliferation

Six shells (client / lawyer / advocate / firm / SME / admin) plus context switcher is Notion+Clio+Airbnb complexity. Correct long-term; **dangerous if Phase 2 builds all shells**. Need “minimum shells until organic demand” product rule.

### W12 — Government / NGO / University as first-class *now*

Extensible `Organization.type` is right. Treating institutional types as conceptually equal *today* invites speculative schema. Prefer: enum extensible; **shipped types until Enterprise: LawFirm + LegalEntity**.

---

## 3. Risks

| Risk | Severity | Horizon |
|------|----------|---------|
| Overloading Actor → incoherent Phase 2 schema | High | 0–18 months |
| Workspace/Matter ownership ambiguity → ACL + AI leaks | Critical | 18–48 months |
| Multi-headed tenancy without primary key | Critical | 24–60 months |
| Ethical walls absent → enterprise unblockable | High | 36–72 months |
| Phase order thrash blocks payments or corrupts org bookings | High | 0–12 months |
| “Everything in Workspace” forces wrong containment | Medium | ongoing |
| Next monolith hosts heavy AI inference → cost/latency cliff | High | Phase 6 |
| Marketplace catalog sprawl before density | Medium | Phase 3–4 |
| Compat `User.role` becomes permanent shadow authz | High | if Phase 2 slips |
| Cross-border / residency / legal hold unstated | High | Enterprise deals |

---

## 4. Recommended changes (docs-only Freeze Errata → v1.0.1)

These are **documentation clarifications**, not a redesign of mission/principles.

1. **Disambiguate nouns:** Party (domain) vs User (authn) vs ActiveContext (session). Keep “Actor-centric” as informal slogan if desired; freeze Party in ERD language.  
2. **Freeze Matter ownership default:** Provider Organization (or SoloPractice tenant) owns Matter; clients are participants with grants (Clio-pattern).  
3. **Define Workspace:** either (A) org-level OS container with many Matters, or (B) postpone Workspace *entity* until Phase 5 and make Matter the first work aggregate — pick one in errata.  
4. **Primary tenant key rule:** every multi-tenant row carries `tenant_id` semantics; Workspace/Matter nest under it.  
5. **Soften universal containment:** durable engagement work → Matter/Workspace; platform/marketplace catalog ≠ Workspace children.  
6. **Clarify §16.1:** legacy pairwise commerce allowed; org-scoped commerce blocked until Identity.  
7. **Affiliation:** Professional ↔ OrganizationMembership relationship is mandatory design, not optional doodle.  
8. **Add legal-platform placeholders:** ethical walls / CoI, legal hold/retention, guest/client portal identity — even as “Phase 5–7 requirements,” so they are not forgotten.  
9. **Name dual billing:** Platform Commerce vs Practice Billing; merchant-of-record decision deferred but acknowledged.  
10. **API seam principle:** Application use-cases must not assume Browser-only invocation (prepares Phase 8).  
11. **Shipped org types vs extensible enum:** LawFirm + LegalEntity first.  
12. **Marketplace catalog tiers:** Tier-0 Professionals/Orgs/Services; Tier-1+ Templates/Education/AI Tools later.

---

## 5. Decisions to keep (freeze)

| Decision | Why keep |
|----------|----------|
| Legal Operating Platform vision (not directory-only) | Correct multi-horizon product shape |
| Actor/party-centric (not Lawyer-centric) domain | Avoids guaranteed rewrite |
| User login separate from acting memberships | Industry standard |
| Workspace/Matter as long-term work center (Booking as acquisition) | Matches legal SaaS + AI workspace trajectory |
| Marketplace composed with OS, not collapsed | Airbnb/Upwork lesson |
| P5 organic ranking integrity | Trust market necessity |
| AI assists; ACL-first; no silent private training | Liability + enterprise |
| Clean Architecture + modular monolith for now | Stage-appropriate |
| Additive migration; no big-bang identity cutover | Protects live GMV path |
| Phase gates preventing AI/Enterprise before Identity | Prevents catastrophic isolation debt |
| Lawyer ≠ Advocate; Firm ≠ Profile; SME ≠ companyName | Product truth |
| Debt policy forbidding security shortcuts | Operational teeth |

---

## 6. Decisions to reconsider (before treating ERD as law)

| Decision | Reconsider toward |
|----------|-------------------|
| Naming everything “Actor” | Party + User + ActiveContext |
| “Everything belongs in Workspace” | Engagement work belongs; catalogs/admin do not |
| Workspace as mandatory first work entity | Matter-first (Clio) or Workspace-as-org-container — choose |
| Blurry matter ownership | Firm/provider-owned matter + client grants |
| Multi-tenant roots without primary key | Single primary tenant discriminator |
| ProfessionalProfile always singular | Explicit solo vs firm affiliation rules |
| Equal weight Marketplace product types | Tiered catalog |
| §16 vs §16.1 ambiguity | Hard rule on legacy vs org commerce |
| Authz as one-liner `can()` | Expand inheritance, walls, guests in errata |

---

## 7. Decisions to postpone (do not freeze into near-term build scope)

| Item | Postpone until |
|------|----------------|
| Government / NGO / University product surfaces | Enterprise / institutional phase |
| Education / Templates / AI Tools marketplace | After Professionals/Services liquidity |
| Physical DB isolation per customer | Named Enterprise deals |
| Full ReBAC/Zanzibar implementation | After coarse org/matter ACL works |
| Native apps | Phase 8; only reserve API seam now |
| Voice / courtroom suites / prosecutor tracks | Post–core Workspace/AI |
| Hard extraction of microservices | Trigger on measured SLOs, not calendar |

---

## 8. Architecture score

| Lens | Score (/10) | Note |
|------|-------------|------|
| Strategic compass (5–10y) | **8.0** | Clear identity of product; strong refusals |
| Domain noun clarity | **6.0** | Actor/Workspace/Matter overload |
| Tenancy & authz readiness | **5.5** | Direction right; mechanics thin |
| Marketplace theory | **8.5** | P5 + composition are excellent |
| AI theory | **8.5** | Prerequisites are the right ones |
| Legal-practice fitness (Clio-class) | **6.5** | Missing walls, ownership default, billing fork |
| Migration realism | **8.0** | Additive path is credible |
| Executability for Phase 2 tomorrow | **6.0** | Needs errata |
| **Overall (constitution for 5–10y)** | **7.2 / 10** | Freeze principles; errata before Identity code |

---

## 9. Confidence level

| Claim class | Confidence |
|-------------|------------|
| Critiques of Actor/Workspace/tenancy ambiguity | **High (~0.85)** — repeated industry failure modes |
| Comparator mappings (Clio matter-owned-by-firm, etc.) | **High (~0.8)** — public product behavior, not internals |
| Exact Phase 2 table shapes | **N/A** — out of scope; intentionally not redesigning schema here |
| Freeze vs rewrite recommendation | **High (~0.8)** — principles earn freeze; ERD does not earn immutability |

---

## Freeze decision

### Suitable for long-term development? **Yes — conditionally.**

### Explicit recommendation

**Freeze as: TORE MASTER ARCHITECTURE v1.0**

…as the binding constitution for:

- Vision / Mission / Principles P1–P10  
- Marketplace fairness (P5)  
- AI constitutional rules A1–A8  
- Composition of Marketplace · Workspace · AI  
- Phase sequencing *intent* (Identity before Enterprise/AI scale)  
- Migration non-breakage guarantees  
- Engineering / security / debt policies  

**Do not freeze §§4–5 entity relationship details as immutable law until Freeze Errata v1.0.1** addresses W1–W4, W7–W8 (Party naming, Matter ownership default, primary tenant key, Workspace definition, legacy-vs-org commerce rule, ethical wall placeholder, dual billing acknowledgment).

### Must change before implementing Phase 2 Identity code

Docs-only errata (v1.0.1) implementing **§4 Recommended changes** items 1–7 and 9 at minimum. No code, no migration in that errata step.

### Must *not* change (do not reopen)

Do not revert to Lawyer-centric core. Do not make Booking the long-term center. Do not allow secret paid organic ranking. Do not allow AI without ACL. Do not authorize a microservices rewrite now.

---

## Appendix — Comparator pressure tests (brief)

| Comparator | Pressure on TORE Master | Outcome |
|------------|-------------------------|---------|
| Salesforce | Account/Contact/User clarity; OrgId everywhere | TORE Actor naming/tenancy weaker |
| M365 | Tenant + identity + workloads | Workspace-as-everything risks SharePoint sprawl unless Matter-scoped |
| Atlassian | Product separation (Jira/Confluence) under one identity | Marketplace vs Workspace composition is aligned |
| Notion | Workspace membership UX | TORE multi-shell risk without progressive disclosure |
| Harvey | Permissioned corpus + firm workspace | AI rules strong; matter corpus ownership must match |
| Clio / MyCase / PP | Matter-centric practice management | TORE should default provider-owned Matter |
| Upwork / Fiverr | Catalog + escrow + ranking | P5 good; catalog tiering needed; escrow unnamed |
| Airbnb | Two-sided market + trust | Verification + fairness align; “homes” ≠ “trips” parallels Marketplace ≠ Workspace |

---

*End of critical review*
