# EPIC 02 — Foundation Domain  
## Sprint 2.1 — Implementation Blueprint (Design Only)

| Field | Value |
|-------|-------|
| **Document** | Foundation Domain Implementation Blueprint |
| **Epic** | 02 — Foundation Domain |
| **Sprint** | 2.1 — Design / planning only |
| **Authority** | [TORE Master Architecture v1.0.1](./20-tore-master-architecture-v1.md) |
| **Status** | Design complete — **does not authorize code, Prisma, migrations, routes, or tests** |
| **Date** | 2026-08-11 |
| **Non-breakage** | Login · Lawyer profiles · Bookings · Marketplace · Existing URLs |

---

## 0. Purpose

Prepare a safe, additive implementation plan for:

- Professional  
- Organization (Law Firm · Legal Entity only in Phase 2)  
- Membership  
- Tenant (`tenant_id`)  
- Authorization foundations  
- Active Context (`ActorContext` internal)

…without breaking the live Client ↔ Lawyer marketplace loop.

**Out of scope for this document:** application code, Prisma schema edits, migrations, route changes, UI implementation, tests.

**Out of scope for Foundation Domain (defer):** Workspace/Matter runtime product, Platform Commerce deep rebuild, Practice Billing, full CoI/Ethical Wall engines, Government/NGO/University orgs, native apps.

---

## 1. Task 1 — Affected models (current Prisma)

Disposition key:

| Disposition | Meaning |
|-------------|---------|
| **KEEP** | Remains as-is for Foundation; no structural change required |
| **MODIFY** | Additive columns/relations or soft dual-read; no breakage |
| **DEPRECATE** | Remain readable; new writes prefer successor; remove later |
| **REPLACE** | Logical successor introduced; physical table kept until cutover |
| **UNTOUCHED** | Not part of Foundation Domain work |

### 1.1 Complete model disposition

| Model | Disposition | Notes |
|-------|-------------|-------|
| **User** | **MODIFY** | Keep `role` as compat home shell. Add relations to Membership / optional `personalTenantId` (or Tenant row). Do **not** remove `role`. |
| **Account** | **UNTOUCHED** | Auth.js OAuth accounts |
| **Session** | **MODIFY** (optional later) | Prefer active context in JWT/session payload before DB session columns; DB change only if needed for persistence |
| **VerificationToken** | **KEEP** | Email verify + password reset |
| **TermsAcceptance** | **KEEP** | Tied to User |
| **ClientProfile** | **KEEP** → later **DEPRECATE** fields | Keep table. `companyName` remains until Legal Entity org; do not force SME migration in Sprint 2.2 |
| **LawyerProfile** | **MODIFY** / **REPLACE** (logical) | Physical table **kept**. Logical successor: **ProfessionalProfile** (Lawyer type) via additive dual-write or rename-alias strategy (see §3–4). All FKs to lawyer_profiles stay valid. |
| **LawyerCredential** | **MODIFY** | Keep; later generalize credential kind; Foundation may add optional `credentialKind` defaulting to lawyer license |
| **PracticeArea** | **KEEP** | Taxonomy |
| **Language** | **KEEP** | Taxonomy |
| **LawyerPracticeArea** | **KEEP** | May later rename notionally to ProfessionalPracticeArea; **no rename in early sprints** |
| **LawyerLanguage** | **KEEP** | Same |
| **ConsultationOffering** | **KEEP** | Still owned by LawyerProfile; FKs unchanged until Service Offering phase |
| **AvailabilityRule** | **KEEP** | |
| **AvailabilityException** | **KEEP** | |
| **Booking** | **KEEP** (additive later) | No Foundation requirement to change client/lawyer FKs. Optional nullable `payerTenantId` / `providerTenantId` deferred until org commerce. |
| **BookingStatusHistory** | **UNTOUCHED** | |
| **Payment** | **UNTOUCHED** | Platform Commerce later |
| **Payout** | **UNTOUCHED** | |
| **Refund** | **UNTOUCHED** | |
| **Dispute** | **UNTOUCHED** | |
| **MessageThread** | **UNTOUCHED** | |
| **Message** | **UNTOUCHED** | |
| **MessageAttachment** | **UNTOUCHED** | |
| **Review** | **UNTOUCHED** | |
| **Notification** | **KEEP** | Remains user-scoped; optionally enrich metadata with tenant later |
| **AuditLog** | **MODIFY** | Additive nullable `tenantId`, `organizationId` (later); keep existing columns |
| **PlatformSetting** | **UNTOUCHED** | |

### 1.2 Models that do not exist yet (to introduce)

| Future model (conceptual) | Introduced in |
|---------------------------|---------------|
| Tenant | Sprint 2.2–2.3 |
| Organization | Sprint 2.3 |
| OrganizationMembership | Sprint 2.3 |
| ProfessionalProfile *(or LawyerProfile extended as Professional)* | Sprint 2.2 |
| OrganizationRole / permission grant (minimal) | Sprint 2.4 |
| Active context storage (session/JWT only initially) | Sprint 2.4 |

**Removed models:** **None** in Foundation Domain.

---

## 2. Task 2 — Future domain model (relationships)

Aligned with Master Architecture v1.0.1. External nouns preferred; **Actor / ActorContext** remain internal eng terms.

```text
User (login principal)
  ├── role (CLIENT|LAWYER|ADMIN) …………………………… compat home shell
  ├── ClientProfile? ……………………………………………… individual client facets
  ├── ProfessionalProfile? …………………………………… marketplace professional
  │     ├── types: LAWYER | ADVOCATE | … (Phase 2: start LAWYER)
  │     ├── credentials[]
  │     ├── offerings / availability (via existing Lawyer* tables initially)
  │     └── optional OrganizationMembership (firm affiliation)
  ├── OrganizationMembership* ……………………………… seats in orgs
  │     └── Organization (LAW_FIRM | LEGAL_ENTITY)
  │           └── tenant_id → Tenant
  └── personalTenantId? → Tenant (INDIVIDUAL)

Tenant (exactly one owner kind)
  ├── kind: INDIVIDUAL | ORGANIZATION
  ├── subject: User (personal) | Organization
  └── (future) Workspace → Matter ……… NOT in Foundation build

ActiveContext (session; not necessarily a table)
  { userId, kind, actorId, membershipId?, tenantId }

Authorization
  Platform RBAC (User.role ADMIN)
  + Membership org roles
  + Ownership (profile / org / tenant)
  + (reserved) CoI / Ethical Walls / Legal Hold — conceptual only

Verification
  LawyerCredential → Professional verification status (on profile)

Bookings (unchanged core)
  clientUserId → User
  lawyerProfileId → LawyerProfile / ProfessionalProfile(Lawyer)
  (later) payerTenantId / providerTenantId nullable

Notifications
  userId → User (unchanged)
```

### 2.1 Cardinality summary

| From | To | Cardinality |
|------|-----|-------------|
| User | ClientProfile | 0..1 |
| User | ProfessionalProfile | 0..1 (Lawyer backfill) |
| User | OrganizationMembership | 0..n |
| Organization | Tenant | 1..1 |
| User (Individual) | Tenant (personal) | 0..1 → 1 after backfill |
| Organization | Membership | 1..n |
| Professional | Credentials | 1..n |
| LawyerProfile | Offerings / Bookings | existing 1..n |
| Booking | User (client) / LawyerProfile | existing |

---

## 3. Task 3 — Database impact (conceptual — no Prisma)

### 3.1 New models (conceptual)

| Model | Purpose | Key fields (conceptual) |
|-------|---------|-------------------------|
| **Tenant** | Primary isolation key | `id`, `kind` (INDIVIDUAL\|ORGANIZATION), `status`, timestamps |
| **Organization** | Law Firm / Legal Entity | `id`, `type`, `name`, `slug?`, `tenantId` (unique), verification/status, soft delete |
| **OrganizationMembership** | User ↔ Org seat | `id`, `organizationId`, `userId`, `orgRole`, `status`, `invitedBy?`, unique `(organizationId, userId)` |
| **ProfessionalProfile** *(strategy A)* **or** extended **LawyerProfile** *(strategy B)* | Marketplace professional | See §3.3 |
| **OrgRolePermission** *(optional thin)* | Map orgRole → capabilities | Defer full matrix to Sprint 2.4; may start as code constants |

### 3.2 Modified models (conceptual)

| Model | Additive change |
|-------|-----------------|
| **User** | `personalTenantId?` FK → Tenant; keep `role` |
| **LawyerProfile** | If strategy B: add `professionalTypes` / flags; optional `tenantId` for solo practice bag; **no slug/URL break** |
| **LawyerCredential** | Optional `credentialKind` default LAWYER_LICENSE |
| **AuditLog** | Nullable `tenantId` |
| **Booking** | **No required change** in Foundation; optional nullable tenant refs deferred |

### 3.3 Professional strategy (choose in Sprint 2.2 kickoff ADR)

| Strategy | Approach | Pros | Cons |
|----------|----------|------|------|
| **A — New ProfessionalProfile + 1:1 LawyerProfile** | Dual row; LawyerProfile remains booking/offering owner | Clear Master naming | Dual-write complexity |
| **B — LawyerProfile becomes Professional physically later** | Keep `lawyer_profiles` table; treat as Professional(Lawyer) in domain | Zero URL/FK churn | Name drift until rename migration years later |

**Blueprint recommendation:** **Strategy B for Foundation** (domain ports speak “Professional”; Prisma table stays `lawyer_profiles`). Physical rename is **not** part of Epic 02.

### 3.4 Indexes / unique constraints / FKs (conceptual)

| Object | Constraint |
|--------|------------|
| Tenant | PK `id` |
| Organization | UNIQUE `tenantId`; UNIQUE active `slug` (partial) if public firm pages exist later |
| OrganizationMembership | UNIQUE `(organizationId, userId)`; INDEX `(userId)`; INDEX `(organizationId, status)` |
| User | FK `personalTenantId` → Tenant (nullable until backfill complete) |
| Organization | FK `tenantId` → Tenant |
| LawyerProfile | Keep existing slug partial unique; INDEX verification/listing unchanged |

### 3.5 Removed models

**None.**

---

## 4. Task 4 — Migration strategy (production-safe)

### 4.1 Principles

1. **Additive only** for live tables.  
2. **Backfill offline/job** after deploy; feature flags gate new reads.  
3. **Dual-read**: `User.role` remains authority for middleware/home until Active Context proven.  
4. **Zero data loss**; no delete of LawyerProfile / Booking / User.  
5. **URLs stable:** `/lawyers`, `/lawyers/[slug]`, `/client/*`, `/lawyer/*`, `/login`, `/register/*`.

### 4.2 Sequence

```text
T0  Deploy schema additive (empty new tables; nullable FKs)
T1  Backfill Tenant for every User (kind=INDIVIDUAL) → set User.personalTenantId
T2  Backfill Professional view:
      every LawyerProfile → Professional(Lawyer) in domain
      (Strategy B: no row copy; mark types=LAWYER in new column or convention)
T3  Do NOT create Organizations automatically from ClientProfile.companyName
      (optional later CRM import — out of Foundation)
T4  Feature flag: ACTIVE_CONTEXT_V1 off
T5  Ship Active Context dual-path: build context from role+profile; ignore memberships if empty
T6  Enable org create/invite behind flag (Law Firm / Legal Entity only)
T7  Cutover reads for admin tooling only; marketplace still LawyerProfile queries
T8  Only after metrics: prefer Active Context in requireActor; still fail closed to User.role if context corrupt
```

### 4.3 Existing user classes

| Existing user | After backfill |
|---------------|----------------|
| CLIENT | User.role=CLIENT · ClientProfile · personal Tenant · no Professional · no Membership |
| LAWYER | User.role=LAWYER · LawyerProfile (Professional Lawyer) · personal Tenant · no Membership until joined firm |
| ADMIN | User.role=ADMIN · personal Tenant · platform capability |

### 4.4 Guarantees checklist

| Guarantee | How |
|-----------|-----|
| Login works | Auth.js User unchanged; password/session untouched |
| Profile works | ClientProfile / LawyerProfile rows untouched |
| Booking works | `clientUserId` / `lawyerProfileId` unchanged |
| Marketplace works | `findListed` still on LawyerProfile gates |
| URLs work | No route renames in Epic 02 |
| Zero data loss | No destructive migrations |

### 4.5 Rollback

- Feature flags off → code paths use legacy `User.role` + LawyerProfile only.  
- New tables can remain empty/orphan without affecting reads.  
- Do **not** drop `role` column in Epic 02.

---

## 5. Task 5 — Repository impact

### 5.1 Existing repositories — disposition

| Repository | Impact |
|------------|--------|
| **UserRepository** | **MODIFY** — personalTenantId; maybe list memberships later |
| **ClientProfileRepository** | **KEEP** (minor) |
| **LawyerProfileRepository** | **MODIFY** — domain alias as Professional; listing queries unchanged |
| **LawyerCredentialRepository** | **MODIFY** — optional credentialKind |
| **BookingRepository** | **KEEP** for Foundation |
| **ConsultationOfferingRepository** | **KEEP** |
| **AvailabilityRepository** | **KEEP** |
| **NotificationRepository** | **KEEP** |
| **AuditLogRepository** | **MODIFY** — optional tenantId |
| **TermsAcceptanceRepository** | **KEEP** |
| **PlatformSettingRepository** | **KEEP** |
| **Taxonomy repositories** | **KEEP** |
| **EmailVerificationTokenRepository** | **KEEP** |
| **Payment/Message/Review ports** | **UNTOUCHED** (still unimplemented adapters) |

### 5.2 New repositories (conceptual)

| Port | Responsibility |
|------|----------------|
| **TenantRepository** | Create/get personal & org tenants |
| **OrganizationRepository** | CRUD Law Firm / Legal Entity |
| **OrganizationMembershipRepository** | Invite, accept, role change, revoke |
| **ActiveContextResolver** *(service, may not be a repo)* | Resolve session context from User + memberships + professional |

### 5.3 Unit of Work

**MODIFY:** register new repos on transaction handle when introduced.

---

## 6. Task 6 — Application layer impact

### 6.1 Actions (existing)

| Action module | Impact |
|---------------|--------|
| `auth.actions.ts` | **MODIFY** late — registration may create personal Tenant; login unchanged |
| `profile.actions.ts` | **KEEP** early; later optional org switcher actions |
| `verification.actions.ts` | **KEEP** (lawyer credential path) |
| `marketplace.actions.ts` | **KEEP** |
| `notification.actions.ts` | **KEEP** |
| `locale.actions.ts` | **UNTOUCHED** |

### 6.2 New actions (later sprints — design only)

- Create Law Firm / Legal Entity  
- Invite member / accept invite / change org role / leave org  
- Switch active context (Individual / Professional / Organization membership)

### 6.3 Use cases

| Use case | Impact |
|----------|--------|
| `register-client` / `register-lawyer` | **MODIFY** — ensure personal Tenant backfill-compatible creation |
| `verify-credentials` / email / password-reset | **KEEP** |
| `update-client-profile` / `update-lawyer-profile` | **KEEP** |
| `public-directory` / booking / catalog / verification | **KEEP** for Foundation |
| **New:** `create-organization`, `manage-membership`, `resolve-active-context` | Sprint 2.3–2.4 |

### 6.4 Services / policies

| Component | Impact |
|-----------|--------|
| `require-actor.ts` | **MODIFY** — evolve to resolve Active Context + tenant; legacy role fallback |
| `rbac.ts` (`canAccessRoute`, `getDashboardPath`) | **MODIFY** carefully — still driven by home shell; context switcher later |
| Auth JWT callbacks | **MODIFY** — optional activeContext + tenantId claims with refresh |
| File access authz | **KEEP** early; later honor tenant/walls |
| **New policy module:** `authorization/can.ts` (capability checks) | Sprint 2.4 |
| CoI / Walls / Hold | **RESERVED stubs / docs only** — no engine in Epic 02 |

---

## 7. Task 7 — Authorization impact

### 7.1 RBAC (platform)

| Role | Foundation behavior |
|------|---------------------|
| ADMIN | Platform capabilities unchanged |
| CLIENT / LAWYER | Home shell for routes `/client`, `/lawyer` until shells expand |

### 7.2 Ownership

- Professional listing / profile: owning User via LawyerProfile.userId  
- Organization resources (future): Organization tenant owner via membership roles  
- Bookings: existing client/lawyer ownership rules unchanged  

### 7.3 Membership

- Law Firm / Legal Entity seats with orgRole (OWNER, ADMIN, MEMBER, …)  
- Membership status ACTIVE required for org context  
- Revoke → fail closed on next privilege refresh  

### 7.4 Tenant

- Every privileged multi-tenant query in new code includes `tenant_id` predicate.  
- Legacy booking/profile queries remain as today until explicitly migrated.  
- Active Context always carries `tenantId`.  

### 7.5 Conflict of Interest / Ethical Walls / Legal Hold

**Foundation Domain (Epic 02):** document capability placeholders and audit hooks only.  
**No enforcement engine** until Workspace/Matter phases (Master §6.3–6.5).  
Do not block Foundation delivery on CoI product.

---

## 8. Task 8 — Frontend impact (pages — no implementation)

### 8.1 No URL changes (Epic 02)

All existing routes remain. Updates are **content/behavior behind flags**, not path renames.

### 8.2 Pages likely needing updates later

| Area | Pages | Nature of update |
|------|-------|------------------|
| Auth | `/login`, `/register/client`, `/register/lawyer` | Minor: post-register tenant; copy only if org invite flows added |
| Client | `/client/dashboard`, `/profile`, `/bookings`, `/notifications` + layout | Context switcher when Legal Entity membership exists |
| Lawyer | `/lawyer/*` + layout | Context switcher when firm membership exists; affiliation display |
| Admin | `/admin/dashboard`, `/admin/lawyers` | Later: org verification queues (not Sprint 2.2) |
| Public | `/`, `/lawyers`, `/lawyers/[slug]` | **No Foundation change** required for listing math |
| Legal | `/terms`, `/privacy` | Untouched |
| Files API | `/api/files/[...key]` | Later tenant-aware; not Sprint 2.2 |

### 8.3 New pages (future, behind flags)

| Page (conceptual) | Sprint |
|--------------------|--------|
| Create / manage Law Firm | 2.3–2.5 |
| Create / manage Legal Entity | 2.3–2.5 |
| Membership invites | 2.4–2.5 |
| Context switcher component (shared) | 2.4–2.5 |

**No new production navigation IA in Sprint 2.2.**

---

## 9. Task 9 — Implementation order (independently deployable)

Phase order from Master Architecture is **unchanged**. This splits **Epic 02 / Phase 2 Identity** into shippable sprints.

### Sprint 2.2 — Tenant + Professional dual-path (invisible to users)

> **Compatibility charter (mandatory):** [epic-02-sprint-2.2-compatibility-charter.md](./epic-02-sprint-2.2-compatibility-charter.md)  
> **100% additive. No URL / booking / marketplace / LawyerProfile / API breakage. Flags default off.**

**Deployable:** Yes — additive schema + backfill + flags off.

| Deliver | Notes |
|---------|-------|
| Tenant model + personal tenant backfill | Every User gets personal tenant |
| Domain Professional alias over LawyerProfile | Strategy B |
| Optional credentialKind default | Additive |
| Feature flag `FOUNDATION_TENANT_V1` | Off in prod initially |
| Tests for backfill idempotency | When coding begins |

**Must not:** org UI, route changes, booking FK changes.

---

### Sprint 2.3 — Organization + Membership (admin/API dark)

**Deployable:** Yes — tables live; UI behind flag.

| Deliver | Notes |
|---------|-------|
| Organization (LAW_FIRM \| LEGAL_ENTITY) | |
| OrganizationMembership | unique user+org |
| Repos + use cases create/list | |
| Flag `FOUNDATION_ORGS_V1` | |
| No marketplace ranking changes | |

**Must not:** force SME migration from `companyName`; no Government types.

---

### Sprint 2.4 — Active Context + capability skeleton

**Deployable:** Yes — JWT/session context; fallback to User.role.

| Deliver | Notes |
|---------|-------|
| Resolve ActiveContext | Individual / Professional / Org membership |
| `requireActor` dual-path | Legacy fallback |
| Thin `can()` policy for org membership actions | |
| Context switcher behind flag | |
| AuditLog tenantId optional writes | |

**Must not:** remove User.role; must not break middleware dashboards.

---

### Sprint 2.5 — Hardening + first gated UX

**Deployable:** Yes — limited UX for org create/invite for beta users.

| Deliver | Notes |
|---------|-------|
| Minimal Law Firm / Legal Entity create + invite UI | Flagged |
| Membership revoke / role change | |
| Observability: context mismatch metrics | |
| Docs + runbooks; disable flags = full rollback to legacy | |
| Exit criteria for “Identity foundation ready” | Matching Master Phase 2 exit *capabilities*, not full marketplace multi-type |

**Must not:** Matter/Workspace product; Platform Commerce redesign; route renames for `/lawyers`.

---

### Dependency graph

```text
2.2 Tenant + Professional alias
      │
      ▼
2.3 Organization + Membership
      │
      ▼
2.4 Active Context + can()
      │
      ▼
2.5 Gated UX + harden
      │
      ▼
(Epic 03 Marketplace multi-actor — later)
```

---

## 10. Task 10 — Risk analysis

### 10.1 Highest risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Premature rename of `lawyer_profiles` breaks FKs/URLs | Critical | Strategy B; no rename in Epic 02 |
| Removing/trusting only Active Context too early | Critical | Dual-path + User.role fallback |
| Org-owned bookings before Identity complete | High | Forbidden until 2.4+ and Master §17.1 rule |
| Dual-write Strategy A complexity | High | Prefer Strategy B |
| Backfill partial failure | High | Idempotent jobs; nullable FKs; verify counts |
| Middleware redirect loops with context | High | Context switch never changes route prefix without explicit UX |
| Scope creep into Workspace/Matter | High | Explicit Epic 02 boundary |
| Treating companyName as Legal Entity | Medium | No auto-migrate |
| Permission matrix explosion | Medium | Start with few orgRoles in code constants |

### 10.2 Rollback strategy

1. Turn off `FOUNDATION_*` flags.  
2. `requireActor` / middleware use User.role only.  
3. Hide org UI.  
4. Leave additive tables in place (safe).  
5. Only reverse schema in emergency with forward-fix playbook — prefer leave additive columns.

### 10.3 Testing strategy (when coding sprints start — not Sprint 2.1)

| Layer | Focus |
|-------|-------|
| Unit | Tenant backfill idempotency; context resolution matrix; membership unique constraints |
| Integration | Register client/lawyer still creates usable profiles; booking create/accept unchanged |
| Auth | Login + JWT privilege refresh + demotion still works |
| Regression | Public `/lawyers` listing counts; slug pages; admin credential review |
| Flag matrix | Flags off == pre-Foundation behavior |
| Load (light) | Backfill job on staging copy of prod-sized data |

**Sprint 2.1 itself writes no tests** (design only).

---

## 11. Traceability to Master Architecture v1.0.1

| Master requirement | Blueprint coverage |
|--------------------|--------------------|
| Actor internal / external nouns | §2, §7 |
| Matter/Workspace deferred | Explicitly out of Epic 02 |
| tenant_id | §2–4, Sprint 2.2 |
| Law Firm + Legal Entity only | §2, Sprint 2.3 |
| Platform vs Practice billing | Untouched (later epics) |
| API-first | New use cases designed as application services, not UI-only |
| CoI / Walls / Hold | Reserved; no engine in Epic 02 |
| Additive migration | §4 |
| Phase order unchanged | §9 nests under Phase 2 Identity |

---

## 12. Sprint 2.1 exit checklist

- [x] Current model dispositions listed  
- [x] Future domain relationships designed  
- [x] DB impact described without Prisma  
- [x] Migration / zero-breakage plan  
- [x] Repository impact  
- [x] Application layer impact  
- [x] Authorization impact  
- [x] Frontend page impact (no impl)  
- [x] Sprints 2.2–2.5 independently deployable  
- [x] Risks, rollback, testing strategy  
- [x] No code / no schema / no migrations produced  

**Next gate:** Product + Engineering confirm ADRs ADR-001…005 accepted, then authorize Sprint 2.2 implementation.

---

*End of EPIC 02 / Sprint 2.1 Implementation Blueprint*
