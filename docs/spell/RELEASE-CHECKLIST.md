# TORE Spell — Release checklist (single source of truth)

Status labels: **VERIFIED** (observed by a real run in this repo), **NOT VERIFIED**,
**INFRASTRUCTURE BLOCKED**, **REQUIRES PRODUCTION CONFIGURATION**,
**REQUIRES PRODUCTION SIGNING CERTIFICATE**, **REQUIRES PRODUCTION HOSTING**,
**REQUIRES NATIVE REVIEW**. Nothing here is marked VERIFIED without a run.
Release status: **INTERNAL ALPHA**.

## Journey: DOWNLOAD → INSTALL → BUY → LICENSE → ACTIVATE → USE → REPORT → UPDATE

| # | Step | Status | Evidence / blocker |
|---|------|--------|--------------------|
| 1 | `/spell` page, concise, CTA | VERIFIED | Rendered by production `next start` in E2E (A1); fallback UI when installer URL is unset |
| 2 | Download (gated to active licence) | VERIFIED (flow) / REQUIRES PRODUCTION HOSTING (file) | E2E: 401/403 without licence, 403 after expiry (bug fixed in Phase 8), redirect with licence. Real installer URL not configured |
| 3 | Download integrity (SHA-256, version) | VERIFIED (plumbing) / NOT VERIFIED (real file) | `SPELL_WINDOWS_INSTALLER_SHA256` surfaced; no real hosted file to hash |
| 4 | Windows installer build (NSIS) | INFRASTRUCTURE BLOCKED | `win-unpacked` + `app.asar` build and pass `verify-package.mjs` on Linux; NSIS stage needs wine/Windows; wine 9.0 in the container fails (wow64 `ntdll.dll` c0000135). CI runner never starts (below) |
| 5 | Windows install / launch / uninstall / reinstall keeps user data | NOT VERIFIED | No Windows machine. `deleteAppDataOnUninstall:false` configured only |
| 6 | Authenticode signing | REQUIRES PRODUCTION SIGNING CERTIFICATE | `CSC_LINK` / `CSC_KEY_PASSWORD` not available; workflow prints real signature status; installer would be UnsignedNotSigned |
| 7 | Buy (checkout → invoice) | VERIFIED vs sandbox simulator | Real HTTP + real PostgreSQL; real `QpayHttpGateway`; provider is **not real QPay** |
| 8 | Payment callback via real endpoint | VERIFIED vs simulator | `/api/billing/qpay/callback`; re-verified through provider check |
| 9 | Duplicate callback → exactly one licence | VERIFIED | UNIQUE `purchaseInvoiceId` |
| 10 | Licence created, owner-only reveal | VERIFIED | Other user gets 403/404; reveal audited |
| 11 | Activation (Ed25519-signed request, EdDSA token vs pinned JWKS) | VERIFIED | Real `SpellLicenseClient` |
| 12 | Second device rejected; explicit transfer; cooldown | VERIFIED | E2E |
| 13 | Expiry enforced server-side; renewal preserves data | VERIFIED | Expiry simulated by DB date edit (labelled) |
| 14 | Max 24 h offline | VERIFIED (unit + token TTL) | `tokenMaxOfflineSeconds` |
| 15 | Feedback (strict schema, PENDING, admin review) | VERIFIED | E2E, real outbox |
| 16 | Signed update notice (informational) | VERIFIED | JWT verified against pinned keys; no auto download/execute |
| 17 | Real QPay (production/sandbox provider) | REQUIRES PRODUCTION CONFIGURATION | No credentials exist; none invented |
| 18 | Native language validation | REQUIRES NATIVE REVIEW | native-reviewed count = 0 |

## Test matrix

| Area | Result | Detail |
|------|--------|--------|
| UNIT | PASS | `npx vitest run` (see PHASE-8-REPORT for counts) |
| INTEGRATION | PASS | included in vitest |
| REAL HTTP | PASS | `npm run e2e:spell` (production server) |
| REAL DB | PASS | PostgreSQL 16, clean cluster, 38 migrations via `migrate deploy` |
| DESKTOP | PASS | desktop typecheck + tests |
| PACKAGE | PASS (asar) / BLOCKED (installer) | `verify-package.mjs` on real electron-builder output |
| WINDOWS | NOT VERIFIED / INFRASTRUCTURE BLOCKED | |
| LICENSE | PASS | invariants below |
| PAYMENT | PASS vs simulator; real provider NOT VERIFIED | |
| FEEDBACK | PASS | |
| UPDATE | PASS | |
| SECURITY | PASS | no secrets in artifact; verifier + scan |
| PERFORMANCE | PASS | no regression; see PHASE-8-REPORT |

## Licence invariants (all enforced and exercised)

1. Exactly one licence per payment — UNIQUE `purchaseInvoiceId`.
2. One owner; code reveal is owner-only and audited.
3. One active device per licence — partial unique index; second device rejected.
4. Transfer is explicit (confirmation), 30-day cooldown after a device change.
5. Expiry is derived from the clock (`deriveLicenseState`), not trusted from stored status — including the download route.
6. Entitlement token lives at most 24 h offline.
7. Renewal extends the same licence; personal data is kept.

## 13 release gates

| Gate | Status |
|------|--------|
| G1 Real HTTP + DB E2E | PASS |
| G2 Clean-DB migrations | PASS |
| G3 Licence invariants | PASS |
| G4 Production config checker (`scripts/spell-release-config-check.ts`) | PASS (tool); production config itself REQUIRES PRODUCTION CONFIGURATION |
| G5 Real QPay | REQUIRES PRODUCTION CONFIGURATION |
| G6 Installer built | INFRASTRUCTURE BLOCKED |
| G7 Windows install verified | NOT VERIFIED |
| G8 Code signing | REQUIRES PRODUCTION SIGNING CERTIFICATE |
| G9 Installer hosting | REQUIRES PRODUCTION HOSTING |
| G10 Security (verifier, secret scan, no secrets committed) | PASS |
| G11 Feedback / update | PASS |
| G12 Language engine unchanged, no release claim beyond data | PASS |
| G13 CI runner | INFRASTRUCTURE BLOCKED (jobs end in ~2–3 s with no steps/runner/logs) |

Gates 5–9 and 13 block PRIVATE BETA.

## QPay audit (code reading + simulator)

- Gateway: token auth, invoice create, payment check; callback body carries only the provider invoice id and is **re-verified with the provider** before fulfilment — a forged callback cannot create a licence.
- Callback URL must be same-origin HTTPS `/api/billing/qpay/callback` (checked by the config checker).
- Amount/currency are compared to the order; mismatches do not fulfil.
- Idempotent: duplicate callbacks are no-ops.
- Not verified against a real QPay account.

## Reproduce

- `npm run e2e:spell` — clean-room cluster, migrate deploy, 29-step E2E (local DBs only; refuses non-local `DATABASE_URL`).
- `npx tsx scripts/spell-release-config-check.ts` — production env shape check (no values printed).
- Installer: `.github/workflows/spell-desktop-windows.yml` on a working Windows runner.
