# 10. Development Standards

| Field | Value |
|-------|-------|
| Document | Development Standards |
| Status | Draft for approval |

---

## 10.1 Working agreements

1. **SRS + this docs set** are the product/engineering source of truth.  
2. No feature work outside the active sprint theme without Product approval.  
3. Prefer vertical slices over horizontal “repo week / UI week” dumps.  
4. Demo every sprint.  
5. Security-sensitive changes require explicit audit events.

---

## 10.2 Sprint Definition of Done

A sprint is done only if:

| # | Criterion |
|---|-----------|
| 1 | Acceptance criteria from roadmap met |
| 2 | Typecheck / `next build` succeeds |
| 3 | ESLint passes on touched areas |
| 4 | No Prisma usage outside `src/infrastructure` |
| 5 | Authorization checked in use-case (not only middleware) |
| 6 | AuditLog written for create/approve/reject/suspend/refund/login |
| 7 | Critical domain rules covered by unit tests (when introduced) |
| 8 | README or docs updated if routes/settings changed |
| 9 | Stakeholder demo completed |

---

## 10.3 Branching & review (recommended)

| Practice | Guideline |
|----------|-----------|
| Trunk | `main` always deployable |
| Branches | `feat/sN-short-name`, `fix/...` |
| PRs | Small, sprint-scoped; include test notes |
| Reviews | Architecture layering + authz + data integrity focus |

*(Exact GitHub branch policy is operational — confirm with team.)*

---

## 10.4 Environment standards

| Env | Purpose |
|-----|---------|
| `local` | Developer machines; console email; local/S3-compatible storage |
| `staging` | Shared QA; sandbox payments; production-like data subset |
| `production` | Live marketplace |

Secrets only via env / host secret store — never commit `.env`.

Required categories (grow over sprints):

- `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`
- Email provider keys (S2+)
- Storage credentials (S3+)
- Payment provider keys + webhook secret (S7+)

---

## 10.5 Data & migration standards

- Additive Prisma migrations only  
- Never edit applied migration SQL in place  
- Seed is for reference data, not a substitute for migrations  
- Backfills are explicit scripts with dry-run where possible  
- Soft-delete user-facing content; hard-delete only with legal basis

---

## 10.6 Security baseline

| Control | Standard |
|---------|----------|
| Passwords | bcrypt (cost ≥ 12) |
| Sessions | Auth.js JWT; revoke via status checks |
| RBAC | Middleware + use-case asserts |
| Uploads | MIME allowlist, size caps, private storage |
| Payments | No PAN storage; webhook signature verify |
| Transport | HTTPS only in staging/prod |
| Logging | No passwords, tokens, or full card data in logs |

---

## 10.7 Observability (MVP minimum)

- Structured error boundaries for Server Actions (`action-result` pattern)  
- AuditLog for sensitive actions  
- Hosting platform logs (Vercel)  
- Payment webhook success/failure metrics (S7)  

Post-MVP: centralized APM/error tracking (Sentry or equivalent).

---

## 10.8 Accessibility & i18n standards

- Target WCAG A (AA stretch)  
- MN primary copy path; EN fallback  
- Introduce message catalogs by public discovery (S5) at latest  
- Forms: labels, errors associated, keyboard reachable

---

## 10.9 Documentation standards

- Product decisions captured under `/docs`  
- Sprint demos note deviations from plan  
- Runbooks added in S10 under `docs/runbooks/`  
- Do not use comments to restate code; document *why* for non-obvious rules
