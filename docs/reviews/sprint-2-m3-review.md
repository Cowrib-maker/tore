# Sprint 2 Milestone 3 — Production Readiness Review

| Field | Value |
|-------|-------|
| Date | 2026-08-09 |
| Scope | Full codebase after Sprint 2 M3 (`ceadfa4`) |
| Status | **Approved — production blockers remediated** |
| Blocker fix commit | `fix(core): resolve production readiness blockers` |
| Next step | Remaining High/Medium/Low items may be planned later; Milestone 4 not started |

### Remediation status (2026-08-09)

| ID | Finding | Status |
|----|---------|--------|
| C1 | JWT role overwrite via `session.update` | **Resolved** |
| H1 | `verify-credentials` CA / infra import | **Resolved** |
| H5 | Non-transactional registration | **Resolved** |
| H6 | Lawyer slug check-then-create race | **Resolved** |
| H8 | Authz only in Server Actions | **Resolved** |
| H9 | Missing `revalidatePath` after profile updates | **Resolved** |
| H2 | Session status revoke | Open (out of blocker scope) |
| H3 | Rate limiting | Open (out of blocker scope) |
| H4 | Env / `AUTH_SECRET` validation | Open (out of blocker scope) |
| H7 | Listing without offerings gate | Open (deferred to catalog/eligibility) |
| H10 | Missing-profile → `/login` | Open (out of blocker scope) |
| M* / L* | Medium / Low backlog | Open |

---

## Executive summary

M3 delivers solid profile settings with generally correct layering for the new profile update path (port-injected use-cases, Zod at actions, session+role checks, audit on update). Domain remains free of Next/Prisma, and Prisma stays in `infrastructure/`.

**Blockers fixed before M4:** JWT role escalation footgun removed; `verify-credentials` uses port injection; registration runs in a `UnitOfWork` transaction; lawyer slug allocation uses create-retry on unique conflicts; profile use-cases authorize via `ActorContext`; profile updates call `revalidatePath`.

**Still open (not in blocker scope):** session status revoke, rate limits, env validation, offerings listing gate, missing-profile UX, and Medium/Low backlog items.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **Critical** | Exploit or integrity failure possible now; fix before public/staging auth traffic |
| **High** | Significant CA/DoD/security gap or latent production failure mode |
| **Medium** | Correctness, compliance, UX, or maintainability issue that should be planned |
| **Low** | Polish, future-proofing, or minor consistency |

---

## Findings

### Critical

#### C1 — JWT callback allows client-driven role escalation — **RESOLVED**

| | |
|---|---|
| **Area** | Security / authorization |
| **Evidence** | `src/infrastructure/auth/auth.callbacks.ts` L11–13: `if (trigger === "update" && session?.role) { token.role = session.role; }` |
| **Issue** | Auth.js session-update payloads can write an arbitrary `role` into the JWT. Middleware and pages trust `session.user.role`. |
| **Impact** | Privilege escalation to `ADMIN` / cross-role access if any client can call `session.update`. |
| **Remediation** | Remove role (and status) updates from the JWT `update` trigger, or only refresh from the database by `token.id`. Never accept role from client session data. |
| **Resolution** | Removed `trigger === "update"` role write. JWT privilege fields are set only at sign-in from verified credentials. |

---

### High

#### H1 — Use-case imports concrete infrastructure repository — **RESOLVED**

| | |
|---|---|
| **Area** | Clean Architecture / dependency rule |
| **Evidence** | `src/application/use-cases/auth/verify-credentials.ts` L6: `import { userRepository } from "@/infrastructure/repositories"` |
| **Issue** | Register/profile use-cases use port injection; credential verify does not. Violates conventions (`docs/11` §11.2) and Sprint 2 CA hygiene. |
| **Remediation** | Inject `UserRepository` (and optionally audit) via deps; wire from Auth.js composition root. |
| **Resolution** | `verifyCredentials(email, password, deps)` takes `UserRepository` port; `auth.config.ts` wires the Prisma adapter. |

#### H2 — Suspended / deactivated users retain access until JWT expires

| | |
|---|---|
| **Area** | Security / authorization |
| **Evidence** | Status enforced only in `verify-credentials.ts` L18–20. `middleware.ts` checks login + route prefix only. `UserRepository.isActiveUser` exists but is unused on request path. |
| **Issue** | Admin suspend does not revoke active sessions. |
| **Remediation** | Re-check status in middleware and/or JWT/session callbacks (DB or short-TTL cache); reject non-`ACTIVE` users. |

#### H3 — No rate limiting on login / register

| | |
|---|---|
| **Area** | Security |
| **Evidence** | No rate-limit middleware or action guards; public actions in `auth.actions.ts` + Credentials `authorize`. |
| **Issue** | Credential stuffing and mass account creation. |
| **Remediation** | Edge/API rate limits (IP + email), and consider CAPTCHA before public launch. |

#### H4 — `AUTH_SECRET` / env schema not enforced at runtime

| | |
|---|---|
| **Area** | Security / ops |
| **Evidence** | `src/lib/env.ts` marks `AUTH_SECRET` optional; **nothing under `src/` imports `@/lib/env`**, so `validateEnv()` never runs. Docs require secret validation (`docs/10`, `docs/13`). |
| **Issue** | Misconfigured production can run without validated secrets. |
| **Remediation** | Require `AUTH_SECRET` (min length) in production; import/validate env from a single boot composition point. |

#### H5 — Registration is not transactional — **RESOLVED**

| | |
|---|---|
| **Area** | Reliability / scalability / conventions |
| **Evidence** | `register-client.ts` / `register-lawyer.ts`: sequential user → profile → terms → audit. Conventions require transactions for multi-write register+profile (`docs/11` §11.6). |
| **Issue** | Partial failure recreates orphan users (the class of bug M2 backfill addresses). |
| **Remediation** | Unit-of-work / `prisma.$transaction` spanning user, profile, terms bundle, and audit. |
| **Resolution** | Added `UnitOfWork` port + `PrismaUnitOfWork`. Register use-cases run user/profile/terms/audit inside `runInTransaction`. Repositories accept injectable Prisma tx clients. |

#### H6 — Lawyer slug check-then-create race — **RESOLVED**

| | |
|---|---|
| **Area** | Reliability / error handling |
| **Evidence** | `allocateUniqueLawyerSlug` in `register-lawyer.ts` and `backfill-missing-profiles.ts` (`slugExists` then `create`); slug is `@unique`. |
| **Issue** | Concurrent creates can hit Prisma unique violation → generic unexpected error. |
| **Remediation** | Shared helper with create-retry on unique conflict inside a transaction. |
| **Resolution** | `createLawyerProfileWithUniqueSlug` retries on `ConflictError`; Prisma repos map P2002 → `ConflictError`. Used by register + backfill. Covered by unit tests. |

#### H7 — Listing gate ignores offerings eligibility

| | |
|---|---|
| **Area** | Domain / future scalability |
| **Evidence** | `update-lawyer-profile.ts` only requires `isLawyerVerified`. Product rule: listable when APPROVED + ≥1 active offering (`docs/08` Sprint 4 / eligibility docs). `isLawyerPubliclyListed` / `findListed` do not check offerings. |
| **Issue** | Once verified (S3), a lawyer can set `isListed` and match list queries before offerings exist. |
| **Remediation** | Align persist + `findListed` with full eligibility; or refuse `isListed=true` until offerings exist (even if UI appears earlier). |

#### H8 — Authorization not re-asserted inside profile update use-cases — **RESOLVED**

| | |
|---|---|
| **Area** | Authorization / DoD |
| **Evidence** | `update-*-profile.ts` accept raw `userId`. Actions gate correctly (`profile.actions.ts` `requireSessionUser`). DoD asks authz in use-case, not only middleware/actions (`docs/10` §10.2, `docs/11` §11.5). |
| **Issue** | Future callers can IDOR by passing another `userId`. |
| **Remediation** | Pass actor context; assert `actor.id === profile.userId` (and role) inside the use-case. |
| **Resolution** | Profile updates take `ActorContext`; enforce role + load/update only by `actor.userId` with ownership assert. |

#### H9 — Profile save has no cache revalidation — **RESOLVED**

| | |
|---|---|
| **Area** | Missing loading/error UI / correctness |
| **Evidence** | Profile forms toast on success; actions return `{ success: true }` without `revalidatePath` / `revalidateTag`. |
| **Issue** | Dashboard completeness / listing badges can stay stale until a full navigation remount. |
| **Remediation** | Revalidate profile + dashboard paths after successful updates. |
| **Resolution** | `updateClientProfileAction` / `updateLawyerProfileAction` call `revalidatePath` for profile + dashboard routes. |

#### H10 — Authenticated users with missing profiles redirected to login

| | |
|---|---|
| **Area** | Missing error handling / UX |
| **Evidence** | `client/profile/page.tsx`, `lawyer/profile/page.tsx`: `get*ProfileForSession()` null → `redirect("/login")`. Dashboards tolerate null. |
| **Issue** | Orphan/lookup failure looks like auth failure. |
| **Remediation** | Dedicated recovery UI or auto-heal use-case; do not treat as unauthenticated. |

---

### Medium

#### M1 — Duplicate `mapError` / `getClientIp` (and unused `action-result`)

| | |
|---|---|
| **Area** | Duplicate code / naming consistency |
| **Evidence** | Identical helpers in `auth.actions.ts` and `profile.actions.ts`. `application/common/action-result.ts` unused; conventions prefer it (`docs/11` §11.4). |
| **Remediation** | Shared action helpers; adopt one result envelope. |

#### M2 — Copy-paste across register forms, actions, and dashboards

| | |
|---|---|
| **Area** | Duplicate code |
| **Evidence** | Near-identical `register-*-form.tsx`, register actions, dashboard session/nav scaffolding. |
| **Remediation** | Shared register form/config; thin role pages; shared dashboard gate helper. |

#### M3 — Registration email enumeration

| | |
|---|---|
| **Area** | Security |
| **Evidence** | Conflict message “An account with this email already exists” returned to the client. Login correctly uses a generic message. |
| **Remediation** | Generic register response + out-of-band email if account exists. |

#### M4 — Login timing / status oracle residue

| | |
|---|---|
| **Area** | Security |
| **Evidence** | `verify-credentials.ts` branches before bcrypt when user missing vs inactive; UI maps all authorize failures to null. |
| **Remediation** | Constant-time path (dummy hash compare) and uniform error. |

#### M5 — PII in audit metadata

| | |
|---|---|
| **Area** | Security / audit |
| **Evidence** | Profile update audits store `phone` / `companyName`; login/register store email. |
| **Remediation** | Prefer field-change flags / hashes; tighten retention policy. |

#### M6 — Soft-deleted email uniqueness edge case

| | |
|---|---|
| **Area** | Missing error handling |
| **Evidence** | `emailExists` filters `deletedAt: null` while DB unique is on `email`. |
| **Remediation** | Soft-delete rename strategy or map unique conflicts to domain errors. |

#### M7 — Incomplete auth audit trail

| | |
|---|---|
| **Area** | Missing audit logging |
| **Evidence** | Login audited without IP; `logoutAction` has no `AuditAction.LOGOUT`. Register audits `User` create but not profile create (M5 checklist still open). |
| **Evidence (bug)** | Backfill client path audits `entityId: user.id` instead of profile id (`backfill-missing-profiles.ts`); lawyer path correct. |
| **Remediation** | Close auth lifecycle audits; fix backfill `entityId`; add profile-create audit on register. |

#### M8 — Zod gaps on profile inputs

| | |
|---|---|
| **Area** | Missing validation |
| **Evidence** | Timezone is any 1–64 char string (UI options not enforced). Phone is length-only. |
| **Remediation** | Enum/allowlist timezone; optional E.164-ish phone refine. |

#### M9 — `loginAction` lacks try/catch; Prisma unique races unmapped

| | |
|---|---|
| **Area** | Missing error handling |
| **Evidence** | Register/profile use `mapError`; `loginAction` does not wrap Auth.js failures. Unique collisions become generic errors. |
| **Remediation** | Uniform catch + map Prisma P2002 → `ConflictError`. |

#### M10 — No route-level `loading.tsx` / `error.tsx`

| | |
|---|---|
| **Area** | Missing loading/error UI states |
| **Evidence** | Zero `loading.tsx` / `error.tsx` under `src/app`. Forms correctly use `useActionState` pending. |
| **Remediation** | Segment loading/error boundaries for auth and role trees. |

#### M11 — Dead / deferred UI and unused dependencies

| | |
|---|---|
| **Area** | Dead code |
| **Evidence** | Forgot-password page is a stub; `forgotPasswordSchema` unused; login still links to it. Packages `react-hook-form`, `@hookform/resolvers`, `uuid` unused. Large unused shadcn modules exist (safe until imported). |
| **Remediation** | Hide stub link until M4; prune unused packages. |

#### M12 — Dashboard/profile double `auth()` calls

| | |
|---|---|
| **Area** | Performance |
| **Evidence** | Pages call `getSessionUser()` then `get*ProfileForSession()`, each calling `auth()`. |
| **Remediation** | Single loader; `React.cache(auth)` or pass session into profile loaders. |

#### M13 — Backfill N+1 query pattern

| | |
|---|---|
| **Area** | Performance |
| **Evidence** | `findByRole` then per-user `findByUserId` + create + audit. |
| **Remediation** | Query users missing profiles in SQL; batch writes; dry-run flag (`docs/10`). |

#### M14 — Accessibility gaps in forms and shell

| | |
|---|---|
| **Area** | Accessibility |
| **Evidence** | Error boxes lack `role="alert"` / `aria-live`. Dashboard nav is `hidden sm:flex` with no mobile alternate. No skip link. Lawyer `isListed` uses disabled checkbox + hidden input (fragile; label targets disabled control). Raw `<select>` / `<textarea>` weaker than `Input` focus styles. |
| **Remediation** | Announce errors; mobile nav; skip link; hidden-only submit for listing when not eligible. |

#### M15 — Infrastructure Auth.js config depends on application layer

| | |
|---|---|
| **Area** | Clean Architecture / folder organization |
| **Evidence** | `infrastructure/auth/auth.config.ts` imports application validators + use-case and infrastructure repos. |
| **Issue** | Inverts preferred dependency direction; composition root should live at the edge. |
| **Remediation** | Thin Auth.js wiring at `lib/` or `application/actions` composition; keep adapters dumb. |

#### M16 — Admin RBAC can access all role prefixes

| | |
|---|---|
| **Area** | Authorization |
| **Evidence** | `canAccessRoute` allows ADMIN everywhere (`rbac.ts`). Documented intentionally; amplifies C1 if JWT is poisoned. |
| **Remediation** | Keep for ops if intended; pair with C1 fix and admin audit trails. |

---

### Low

#### L1 — `bcryptjs` imported directly in use-cases (no `PasswordHasher` port)

| | |
|---|---|
| **Area** | Clean Architecture / scalability |
| **Evidence** | `register-*.ts`, `verify-credentials.ts` |
| **Remediation** | Introduce port when auth expands (reset/hashing policy). |

#### L2 — Use-cases typed on application Zod inputs

| | |
|---|---|
| **Area** | Naming / layering consistency |
| **Evidence** | Update/register use-cases import `@/application/validators/*` |
| **Remediation** | Acceptable for this stack; keep Zod at boundary if types drift into domain. |

#### L3 — Toast effect depends on whole `state` object

| | |
|---|---|
| **Area** | UI robustness |
| **Evidence** | Profile forms `useEffect(..., [state])` |
| **Remediation** | Success nonce / transition detection to avoid brittle re-toasts. |

#### L4 — Prisma global singleton only outside production

| | |
|---|---|
| **Area** | Performance / scalability |
| **Evidence** | `infrastructure/database/prisma.ts` caches on `globalThis` when not production. |
| **Remediation** | Document lifecycle; consider always caching for serverless reuse patterns. |

#### L5 — Domain ports for future sprints without implementations

| | |
|---|---|
| **Area** | Folder organization / dead code risk |
| **Evidence** | e.g. `LawyerCredentialRepository` has no Prisma impl yet (S3). Grow-by-sprint is documented. |
| **Remediation** | OK if unused; avoid wiring in composition roots early. |

#### L6 — Schema indexes adequate for current paths

| | |
|---|---|
| **Area** | Performance |
| **Evidence** | User role/status and lawyer listing/verification indexes present. |
| **Note** | No Critical index gap for current S2 queries; revisit for discovery/booking. |

---

## What is in good shape

- Domain layer free of Next.js / Auth.js / Prisma imports
- Prisma confined to `infrastructure/` (+ seed/scripts)
- M3 profile update path: Zod → action → port-injected use-case → audit
- Listing blocked for unverified lawyers in the use-case (partial product rule; see H7)
- bcrypt cost factor 12; password hashes not exposed on `User` entity selects
- Middleware coarse RBAC for `/client`, `/lawyer`, `/admin`
- No `dangerouslySetInnerHTML` sinks found
- Form pending states via `useActionState`
- Folder/naming for new M3 artifacts largely matches conventions (`profile.actions.ts`, `update-*-profile.ts`, `components/profiles/`)
- **Post-blocker pass:** JWT privilege fields immutable after sign-in; `verify-credentials` port-injected; register via `UnitOfWork`; slug create-retry; profile use-case authz; profile `revalidatePath`

---

## Checklist matrix (post-blocker remediation)

| Check | Result |
|-------|--------|
| Domain free of framework/ORM | Pass |
| Prisma only in infrastructure | Pass |
| Use-cases depend on ports only | **Pass** (H1 resolved) |
| Actions as composition roots | Pass (with M15 note) |
| Mutating actions: session + role | Pass for profile updates |
| Authz inside use-cases | **Pass** for profile updates (H8 resolved) |
| Zod on FormData mutations | Pass for auth register/login + profile |
| Audit on sensitive mutations | **Partial** (M7) |
| Transactions on register | **Pass** (H5 resolved) |
| Rate limits | **Fail** (H3 — open) |
| Session revoke via status | **Fail** (H2 — open) |
| Env secret validation | **Fail** (H4 — open) |
| Route loading/error UI | **Fail** (M10) |
| Accessibility baseline | **Gaps** (M14) |

---

## Suggested remediation order (remaining)

1. ~~**C1** — Kill JWT role update~~ **Done**  
2. ~~**H1** — verify-credentials ports~~ **Done**  
3. ~~**H5 + H6** — Transactional register + slug race~~ **Done**  
4. ~~**H8 + H9** — Use-case authz + revalidate~~ **Done**  
5. **H2 + H4 + H3** — Status revoke; env validation; rate limits  
6. **H10** — Profile-missing UX  
7. **H7** — Align listing eligibility with offerings (S3/S4)  
8. **Medium cluster** — Shared action helpers, audits, a11y, prune dead deps, loading/error boundaries  

---

## Explicit non-actions from this review

- Original review did not modify production code  
- Blocker remediation implemented under approved scope (C1, H1, H5, H6, H8, H9 only)  
- Milestone 4 was **not** started  
- Remaining open findings still await separate approval  

**STOP — awaiting approval to start Milestone 4.**
