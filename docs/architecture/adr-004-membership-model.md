# ADR-004 — Membership model

| Field | Value |
|-------|-------|
| **ADR** | 004 |
| **Title** | Membership model |
| **Status** | Accepted |
| **Date** | 2026-08-11 |
| **Epic** | 02 — Foundation Domain |
| **Authority** | Master Architecture v1.0.1 §4.5, §6 |
| **Supersedes** | — |
| **Related** | [ADR-003](./adr-003-organization-model.md), [ADR-001](./adr-001-tenant-model.md) |

---

## Context

A single User must be able to:

- act as an individual client or professional, and  
- belong to one or more Organizations (Law Firm / Legal Entity),  

without creating duplicate accounts (Master requirement).

Authorization must evolve from flat `User.role` alone to **membership-aware** capabilities, while Epic 02 keeps `User.role` as a compat home shell for `/client` and `/lawyer` routes.

---

## Decision

1. Introduce **OrganizationMembership** as the join between **User** and **Organization**.
2. **Uniqueness:** at most one membership row per `(organizationId, userId)` pair (status may be ACTIVE / INVITED / REVOKED / SUSPENDED — exact enum left to implementation under this uniqueness rule).
3. Membership carries an **orgRole** (coarse RBAC inside the org). Foundation starts with a **small fixed set** (e.g. OWNER, ADMIN, MEMBER — exact labels finalized at implementation, but not an open-ended permission matrix UI in Epic 02).
4. **Active Context** (internal `ActorContext`) may select a membership to act within an Organization tenant; switching context must not require a second login.
5. Losing ACTIVE membership **must fail closed** on next privilege refresh for org-scoped actions.
6. Membership does **not** replace Professional or ClientProfile; a lawyer in a firm still has (or may have) a Professional/LawyerProfile and a personal Tenant.
7. Platform **ADMIN** remains a platform capability on User (or equivalent), not an OrganizationMembership role.
8. Epic 02 does **not** implement full ReBAC / ethical walls; membership + orgRole is the Foundation authz increment.

---

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| **Duplicate User accounts per org** | Forbidden by Master debt policy; destroys SSO and audit. |
| **Store org roles as columns on User** | Cannot express multi-org seats; conflicts with personal CLIENT/LAWYER home shell. |
| **Groups without orgRole (ACL only on resources)** | Too weak for Firm/SME admin workflows; too early for pure ReBAC. |
| **Full Zanzibar/ReBAC in Epic 02** | Premature; Matter/Workspace not built. Reserve for later ADRs. |
| **Many-to-many without unique (user, org)** | Duplicate seats and ambiguous roles. |

---

## Consequences

### Positive

- Multi-org seats with one login.
- Clear revoke semantics for org isolation.
- Enables Active Context without removing User.role yet.

### Negative / cost

- Context switcher UX complexity (mitigated by feature flags / progressive disclosure).
- Risk of middleware confusion if org context changes route expectations — mitigate by not changing `/client` and `/lawyer` prefixes in Epic 02.
- Invite/email flows add abuse surface — requires rate limits when implemented.

### Neutral

- Permission details beyond orgRole can be code constants mapping role → capabilities until a grant table is needed.

---

## Rollback strategy

1. Disable membership invite/accept/switch UI and actions via feature flag.
2. Force Active Context to Individual / Professional / legacy role paths only.
3. Retain membership rows; they are inert if unused.
4. Do not automatically delete Organizations or Tenants on membership rollback.
5. Ensure `requireActor` legacy path ignores memberships when flag is off.

---

## References

- Master Architecture v1.0.1 §4.5, §6 Authorization  
- EPIC 02 Sprint 2.1 Blueprint §7, Sprints 2.3–2.4  
- ADR-003 Organization · ADR-001 Tenant  

---

*End of ADR-004*
