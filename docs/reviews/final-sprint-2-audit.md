# Final Sprint 2 Production Readiness Audit

| Field | Value |
|-------|-------|
| Date | 2026-08-09 |
| Scope | Entire TORE codebase after Sprint 2 M3 + production-blocker remediation |
| Baseline commit series | M3 `ceadfa4` · blockers `d1c3bc4` |
| High remediaiton | 2026-08-09 (post-audit approval) |
| Production code modified by original audit | **None** |
| Sprint 3 | **Not started** |

---

## Verdict

**Sprint 2 product exit is still incomplete** (M4 email/verify/reset and M5 DoD remain open and are **explicitly deferred** — not implemented in the High remediaiton pass).

**Technical High findings from this audit are remediated** except **H-A5**, which Product deferred (do not implement M4/M5 in this pass).

Critical issues found: **none**.

Remaining open High: **H-A5 only** (scope: M4/M5 features — deferred by Product).

---

## High remediaiton status (2026-08-09)

| ID | Finding | Status |
|----|---------|--------|
| H-A1 | Session status revoke | **Resolved** |
| H-A2 | Auth rate limits | **Resolved** |
| H-A3 | Runtime env / `AUTH_SECRET` | **Resolved** |
| H-A4 | Soft-delete vs unique email/slug | **Resolved** |
| H-A5 | Sprint 2 M4/M5 incomplete | **Deferred** (Product: do not implement M4/M5 here) |
| H-A6 | CI pipeline | **Resolved** |
| H-A7 | Listing requires offerings | **Resolved** |
| H-A8 | Missing profile → `/login` | **Resolved** |

---

## Executive summary

| Dimension | Assessment |
|-----------|------------|
| Clean Architecture (M1–M3 paths) | Strong after blocker + High remediaiton |
| Auth / sessions | JWT privilege lock; DB status refresh (Node); middleware rejects non-ACTIVE; getSessionUser signs out inactive |
| Rate limits | In-memory login/register limiter |
| Env validation | `lib/env` required; imported from auth + Prisma boot paths |
| Soft-delete uniqueness | Partial unique indexes for active email/slug |
| Registration integrity | Transactional `UnitOfWork`; slug create-retry |
| Listing eligibility | Verified + active offering required; `findListed` gated |
| Profile missing UX | Recovery card (not login redirect) |
| CI | GitHub Actions workflow on PR/push |
| Sprint 2 product exit (M4/M5) | **Still open / deferred** |

**Ship posture:** Technical High auth/data gates addressed for continued staging toward M4. Sprint 2 exit still requires M4/M5.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **Critical** | Exploit or data-integrity failure likely in production now |
| **High** | Must resolve before public/staging auth traffic or Sprint 2 exit |
| **Medium** | Should plan before wider release; correctness/maintainability risk |
| **Low** | Polish / consistency |
| **Suggestion** | Optional improvement / future-sprint guidance |

---

## Scope reality check (docs vs code)

| Milestone | Docs | Code |
|-----------|------|------|
| M1 — Profiles on register | Done | Done (ports + UoW) |
| M2 — Backfill + domain tests | Done | Done |
| M3 — Profile settings + dashboards | Done | Done + revalidate |
| Blockers (C1, H1, H5, H6, H8, H9) | Approved / remediated | Confirmed in code |
| High remediaiton (H-A1–A4, A6–A8) | Approved | Remediated |
| **M4 — Email verify / reset / gates** | **Open** | **Not implemented (deferred)** |
| **M5 — Hardening / DoD** | **Open** | **Partial (deferred)** |

Evidence of M4 absence: no `EmailSender` port, no `/verify-email`, `forgot-password` stub only, unused `forgotPasswordSchema`, dashboard copy defers verification to “next milestone”.

---

## Resolved findings (do not re-open)

| ID | Topic | Status |
|----|-------|--------|
| C1 | JWT `session.update` role overwrite | **Resolved** — privilege fields set only at sign-in |
| H1 | `verify-credentials` infra import | **Resolved** — port injection |
| H5 | Non-transactional register | **Resolved** — `UnitOfWork` |
| H6 | Lawyer slug race | **Resolved** — create-retry + P2002 mapping |
| H8 | Profile authz only in actions | **Resolved** — `ActorContext` |
| H9 | No `revalidatePath` after profile save | **Resolved** |
| M7† | Backfill client audit `entityId` | **Resolved** — uses `profile.id` |
| H-A1 | Session status revoke | **Resolved** |
| H-A2 | Rate limits | **Resolved** |
| H-A3 | Env / `AUTH_SECRET` | **Resolved** |
| H-A4 | Soft-delete uniqueness | **Resolved** |
| H-A6 | CI | **Resolved** |
| H-A7 | Offerings listing gate | **Resolved** |
| H-A8 | Missing-profile UX | **Resolved** |

† Previously Medium in M3 review; fixed during blocker/backfill cleanup.

---

## Findings

### Critical

*None.*

---

### High

#### H-A1 — Suspended / deactivated users retain JWT access — **RESOLVED**

| | |
|---|---|
| **Area** | Authentication / authorization |
| **Evidence** | Status checked only in `verify-credentials.ts`. Middleware (`src/middleware.ts`) checks login + route prefix only. `UserRepository.isActiveUser` exists but is unused on the request path. JWT `status` frozen at sign-in (`auth.callbacks.ts`). |
| **Why** | Admin suspend does not revoke sessions until token expiry. Violates `docs/10` session-revoke guidance. |
| **Remediation** | Re-validate `ACTIVE` status in middleware and/or session/JWT callback (DB or short-TTL cache). |
| **Resolution** | Node JWT callback refreshes status via `isActiveUser` (60s TTL). Middleware rejects non-ACTIVE on protected routes. `getSessionUser` signs out inactive sessions. |

#### H-A2 — No rate limiting on login / register — **RESOLVED**

| | |
|---|---|
| **Area** | Security |
| **Evidence** | No rate-limit middleware, edge rule, or action throttling. Public surfaces: `auth.actions.ts`, Credentials `authorize`. |
| **Why** | Credential stuffing and mass account creation. |
| **Remediation** | IP + email throttling (and CAPTCHA before public launch). |
| **Resolution** | In-memory `consumeRateLimit` on register (IP) and login (IP+email) in Server Actions. Best-effort per isolate until shared store. |

#### H-A3 — Runtime env / `AUTH_SECRET` validation unused — **RESOLVED**

| | |
|---|---|
| **Area** | Environment variables / deployment |
| **Evidence** | `src/lib/env.ts` defines schema with `AUTH_SECRET` **optional**; **no** `src/` import of `@/lib/env`, so `validateEnv()` never runs. Docs require secret at deploy (`docs/10`, `docs/13`). |
| **Why** | Misconfigured production can start without project-enforced secret validation. |
| **Remediation** | Require `AUTH_SECRET` (min length) in production; import env at a single boot composition root. |
| **Resolution** | `AUTH_SECRET` required (min 32) except test default; `env` imported from `lib/auth` and Prisma boot. |

#### H-A4 — Soft-delete vs unique `email` (and slug) collision — **RESOLVED**

| | |
|---|---|
| **Area** | Database / Prisma |
| **Evidence** | `User.email` / `LawyerProfile.slug` are `@unique`. App “exists” queries filter `deletedAt: null`. Soft-deleted rows still occupy the unique key. |
| **Why** | Re-registration blocked or unmapped P2002 after soft delete; confusing failures. |
| **Remediation** | Soft-delete rename strategy (e.g. suffix email/slug) or partial unique indexes where supported. |
| **Resolution** | Migration `20260809120000_active_partial_uniques`: partial unique indexes `WHERE deleted_at IS NULL`. Schema drops full `@unique`; `slugExists` filters active rows. |

#### H-A5 — Sprint 2 exit incomplete (M4 / M5) — **DEFERRED**

| | |
|---|---|
| **Area** | Product / deployment readiness |
| **Evidence** | `sprint-2-checklist.md` M4–M5 unchecked; no email adapter or verify/reset flows; incomplete audit DoD. |
| **Why** | Declaring Sprint 2 “done” or production-complete contradicts documented exit criteria (verify email gated for marketplace actions). |
| **Remediation** | Complete M4–M5 before Sprint 2 exit sign-off; do not start Sprint 3 as a substitute for M4. |
| **Resolution** | **Deferred by Product** for this remediaiton pass — explicitly out of scope (“Do not implement Milestone 4 or Milestone 5”). Remains open for Sprint 2 exit. |

#### H-A6 — No CI pipeline — **RESOLVED**

| | |
|---|---|
| **Area** | Build / deployment / testing |
| **Evidence** | No `.github/workflows` (or other CI). Docs expect PR lint + unit + build gating. |
| **Why** | Regressions can ship unnoticed; release discipline missing. |
| **Remediation** | Add CI running `npm test`, `lint`, `typecheck`, `build` (and later migrate deploy). |
| **Resolution** | Added `.github/workflows/ci.yml` (test, lint, typecheck, build) with required env secrets. Also added `db:migrate:deploy` script. |

#### H-A7 — Listing eligibility ignores offerings — **RESOLVED**

| | |
|---|---|
| **Area** | Domain / future marketplace |
| **Evidence** | `update-lawyer-profile` allows `isListed` when verified only. `isLawyerPubliclyListed` / `findListed` do not require ≥1 active offering (`docs/08` Sprint 4 rule). |
| **Why** | Once a lawyer is APPROVED, they can list and match discovery-shaped queries before catalog exists. |
| **Remediation** | Align persist + query eligibility with offerings (acceptable to land with S3/S4 if explicitly deferred with a flag). |
| **Resolution** | `hasActiveOffering` on lawyer profile repo; use-case rejects listing without active offering; `isLawyerPubliclyListed` / `findListed` require offerings; UI disables listing until verified + offering. |

#### H-A8 — Missing profile treated as unauthenticated — **RESOLVED**

| | |
|---|---|
| **Area** | Error handling / UX |
| **Evidence** | `/client/profile` and `/lawyer/profile` redirect to `/login` when profile load is null; dashboards tolerate null. |
| **Why** | Orphan/lookup failure looks like a session failure. |
| **Remediation** | Recovery page or auto-heal; do not map to login. |
| **Resolution** | Discriminated session loaders (`ok` / `unauthenticated` / `profile_missing`); `ProfileMissingState` recovery UI on profile + dashboards. |

---

### Medium

#### M-B1 — Incomplete audit trail for auth lifecycle

| | |
|---|---|
| **Area** | Audit logging |
| **Evidence** | Register audits `User` CREATE only (no profile CREATE). Login audited without IP. `logoutAction` has no `AuditAction.LOGOUT`. Profile UPDATE is audited. |
| **Remediation** | Close M5 audit checklist items. |

#### M-B2 — Registration email enumeration

| | |
|---|---|
| **Area** | Security |
| **Evidence** | Conflict message exposes existing email. Login remains generic. |
| **Remediation** | Generic register response + email-based confirmation path. |

#### M-B3 — Login timing / status oracle residue

| | |
|---|---|
| **Area** | Security |
| **Evidence** | `verify-credentials` returns before bcrypt for missing vs inactive users. |
| **Remediation** | Dummy hash compare; uniform Unauthorized message. |

#### M-B4 — PII in audit metadata

| | |
|---|---|
| **Area** | Security / compliance |
| **Evidence** | Profile updates store phone/company; login/register store email. |
| **Remediation** | Field-change flags / redaction policy. |

#### M-B5 — Profile update + audit not transactional

| | |
|---|---|
| **Area** | Transactions |
| **Evidence** | Update then audit are separate writes; UoW used only for register. |
| **Remediation** | Run mutation + audit inside `UnitOfWork` (same for backfill create + audit). |

#### M-B6 — Backfill N+1

| | |
|---|---|
| **Area** | Performance / N+1 |
| **Evidence** | `findByRole` then per-user `findByUserId` + create + audit. |
| **Remediation** | Query users missing profiles in SQL; batch where safe. |

#### M-B7 — Double `auth()` on role pages

| | |
|---|---|
| **Area** | Performance |
| **Evidence** | Pages call `getSessionUser()` then `get*ProfileForSession()` (each calls `auth()`). |
| **Remediation** | Single loader; `React.cache(auth)` or pass session through. |

#### M-B8 — Prisma global singleton skipped in production

| | |
|---|---|
| **Area** | Performance / Prisma |
| **Evidence** | `prisma.ts` caches client/pool on `globalThis` only when `NODE_ENV !== "production"`. |
| **Remediation** | Align with `docs/13` guidance for serverless reuse. |

#### M-B9 — Duplicate action helpers & unused `action-result`

| | |
|---|---|
| **Area** | Code duplication / dead code |
| **Evidence** | Identical `mapError` / `getClientIp` in `auth.actions.ts` and `profile.actions.ts`. `application/common/action-result.ts` unused. |
| **Remediation** | Shared helpers; adopt one result envelope (`docs/11` §11.4). |

#### M-B10 — Copy-paste register/dashboard surfaces

| | |
|---|---|
| **Area** | Code duplication |
| **Evidence** | Near-identical register forms/actions; parallel dashboard scaffolding. |
| **Remediation** | Shared form/config and page gate helpers. |

#### M-B11 — Unused dependencies

| | |
|---|---|
| **Area** | Dead code / build |
| **Evidence** | `react-hook-form`, `@hookform/resolvers`, `uuid` unused in `src/`. |
| **Remediation** | Remove until needed. |

#### M-B12 — `loginAction` lacks try/catch; Zod timezone loose

| | |
|---|---|
| **Area** | Validation / error handling |
| **Evidence** | Login path unconstrained by `mapError`. Lawyer timezone any 1–64 chars despite UI allowlist. |
| **Remediation** | Uniform error mapping; enum/allowlist timezone. |

#### M-B13 — Auth.js composition root inverted in infrastructure

| | |
|---|---|
| **Area** | Architecture / DI |
| **Evidence** | `infrastructure/auth/auth.config.ts` imports application validators/use-cases + repos. |
| **Remediation** | Thin edge wiring; keep adapters dumb. |

#### M-B14 — No route-level `loading.tsx` / `error.tsx`

| | |
|---|---|
| **Area** | Error handling / UX |
| **Evidence** | Zero App Router loading/error boundaries under `src/app`. Forms use `useActionState` pending. |
| **Remediation** | Segment boundaries for auth and role trees. |

#### M-B15 — Accessibility gaps

| | |
|---|---|
| **Area** | Accessibility |
| **Evidence** | Form errors lack `role="alert"` / `aria-live`. Dashboard nav hidden on mobile with no alternate. No skip link. Disabled listing checkbox + hidden input quirks. |
| **Remediation** | Announce errors; mobile nav; skip link; submit-only hidden field when listing locked. |

#### M-B16 — Unstructured logging only

| | |
|---|---|
| **Area** | Logging |
| **Evidence** | `console.error` in actions; no structured logger, request IDs, or APM hooks. |
| **Remediation** | Structured logs + error monitoring before public launch (`docs/13`). |

#### M-B17 — No migrate-deploy script / release automation

| | |
|---|---|
| **Area** | Deployment readiness |
| **Evidence** | `package.json` has generate/migrate-dev scripts; docs/13 release migrate not automated. |
| **Remediation** | `db:migrate:deploy` + CI/CD release step. |

#### M-B18 — Domain unit-test gaps vs testing strategy

| | |
|---|---|
| **Area** | Testing coverage |
| **Evidence** | Covered: slug, allocate-slug, fee, cancellation, booking SM. Missing: slot-availability, rating-aggregator, lawyer-eligibility, booking-number, RBAC, Zod. No integration/E2E. |
| **Remediation** | Expand domain suite (S2–S4); add Playwright when flows exist (`docs/12`). |

#### M-B19 — License number not unique yet

| | |
|---|---|
| **Area** | Database |
| **Evidence** | `LawyerCredential.licenseNumber` has no unique / composite unique. |
| **Remediation** | Add uniqueness when S3 credentials land. |

---

### Low

#### L-C1 — `bcryptjs` directly in use-cases

| | |
|---|---|
| **Area** | Architecture |
| **Remediation** | Introduce `PasswordHasher` port when auth expands (reset policies). |

#### L-C2 — Use-cases typed against Zod inputs

| | |
|---|---|
| **Area** | Architecture / DI |
| **Remediation** | Acceptable for this stack; keep domain DTOs if contracts diverge. |

#### L-C3 — JWT defaults `CLIENT` / `ACTIVE` if token fields missing

| | |
|---|---|
| **Area** | Authentication |
| **Evidence** | `token.role ?? "CLIENT"`, `token.status ?? "ACTIVE"`. |
| **Remediation** | Fail closed if privilege claims absent. |

#### L-C4 — Empty `next.config.ts` (no security headers)

| | |
|---|---|
| **Area** | Build / deployment |
| **Remediation** | Add standard security headers before public launch. |

#### L-C5 — Forgot-password stub linked from login

| | |
|---|---|
| **Area** | Dead code / UX |
| **Remediation** | Hide or disable until M4. |

#### L-C6 — Future domain ports without Prisma impls

| | |
|---|---|
| **Area** | Folder structure |
| **Remediation** | Keep unused; wire only when owning sprint starts (`docs/06`). |

#### L-C7 — Toast effect depends on whole action `state`

| | |
|---|---|
| **Area** | UI robustness |
| **Remediation** | Success nonce / transition detection. |

#### L-C8 — No Dockerfile / host config in repo

| | |
|---|---|
| **Area** | Deployment |
| **Remediation** | Codify host when environment is finalized (`docs/13` Vercel + PG is fine as strategy). |

---

### Suggestion

#### S-D1 — Cache platform settings reads on register

Short TTL / in-process cache for terms version keys.

#### S-D2 — Plan tagged cache for public lawyer directory

When Sprint 5 discovery lands, use `unstable_cache` + tag revalidation on listing changes.

#### S-D3 — Cache session status checks (H-A1 resolved with 60s TTL)

Node JWT callback already refreshes on a 60s TTL; shared Redis/edge cache remains optional.

#### S-D4 — Prune unused shadcn modules until imported

Bundle risk stays low until imported; delete to reduce noise.

#### S-D5 — Schema indexes adequate for current S2 queries

Revisit composite indexes for discovery filters and “users without profile” backfill SQL when those paths ship.

#### S-D6 — Cascades / Restrict on money & bookings look intentional

Preserve Restrict on payment/booking money paths as features arrive.

---

## Architecture scorecard

| Check | Result |
|-------|--------|
| Domain free of Next / Prisma / Auth.js | Pass |
| Prisma only in infrastructure (+ seed/scripts) | Pass |
| Use-cases depend on ports only | Pass |
| Actions as composition roots | Pass (Auth.js wiring still Medium inversion) |
| Repository pattern + injectable tx client | Pass |
| UnitOfWork on register | Pass |
| Use-case authorization (profiles) | Pass |
| Zod on FormData mutations | Pass (minor timezone gap) |
| Audit completeness | Partial |
| Rate limits | **Pass** (in-memory; H-A2) |
| Session status revoke | **Pass** (H-A1) |
| Env validation at runtime | **Pass** (H-A3) |
| CI | **Pass** (H-A6) |
| Listing offerings gate | **Pass** (H-A7) |
| Missing-profile UX | **Pass** (H-A8) |
| Soft-delete uniqueness | **Pass** (H-A4) |
| Sprint 2 M4/M5 | **Deferred / open** (H-A5) |

---

## Testing snapshot

| Layer | Status |
|-------|--------|
| Unit (`tests/unit`) | Expanded (slug, allocate-slug, fee, cancellation, booking SM, eligibility, rate-limiter) |
| Integration | None |
| E2E | None |
| Authz / security suites (`docs/12` §12.6) | Partial (status revoke + rate limit unit coverage) |
| CI gate | **Present** (`.github/workflows/ci.yml`) |

---

## Deployment readiness snapshot

| Item | Status |
|------|--------|
| Deployment strategy doc | Present (`docs/13-deployment-strategy.md`) |
| `.env.example` | Present (DB/Auth/App) |
| Prisma migrations | Present (init + booking + active partial uniques) |
| Runtime env validation | **Active** (`lib/env` via auth + Prisma) |
| `migrate deploy` automation | Script added; CI does not run migrate yet |
| CI/CD | **CI verify job present** |
| Monitoring / APM | Not wired |
| Go-live checklist (`docs/13` §13.7) | Open |

---

## Recommended order before calling Sprint 2 done

1. ~~**H-A1, H-A2, H-A3**~~ **Done**  
2. ~~**H-A4, H-A6, H-A7, H-A8**~~ **Done**  
3. **H-A5 / M4–M5** — email verify, password reset, unverified gates, audit DoD (**still required for Sprint 2 exit**)  
4. Medium cluster — UoW for profile/audit, N+1, duplication, a11y, logging  

---

## Explicit non-actions

- Original audit did not modify production code  
- High remediaiton implemented under Product approval (excluding M4/M5)  
- Milestone 4 and Milestone 5 were **not** started  
- Sprint 3 was **not** started  
- Further remediations require Product approval  

---

## Production-readiness statement

Technical High findings H-A1–A4 and H-A6–A8 are resolved. **H-A5 remains open by Product deferral** (M4/M5 not implemented). Therefore this audit still does **not** declare:

> SPRINT 2 IS PRODUCTION READY

**STOP — awaiting approval.**
