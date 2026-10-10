# Phase 8 Report — Release candidate hardening

## 1. Release objective
Prove DOWNLOAD → INSTALL → BUY → LICENSE → ACTIVATE → USE → REPORT → UPDATE outside in-process tests. No new features.

## 2. Release audit
Single source of truth: `RELEASE-CHECKLIST.md`. Env checklist: `PRODUCTION-ENV-CHECKLIST.md`.

## 3. Real HTTP + real DB E2E — VERIFIED (payment provider is a simulator, NOT real QPay)
`npm run e2e:spell`: 29/29 steps — production `next start`, PostgreSQL 16, NextAuth sessions, real QPay HTTP gateway against a sandbox simulator, real desktop licence client (Ed25519 requests, EdDSA tokens vs pinned JWKS), feedback outbox, update check. Covers purchase, wrong/absent payment, callback via the real endpoint, duplicate/concurrent callbacks, owner-only reveal, activation, second-device rejection, transfer + cooldown, expiry, renewal (personal dictionary intact), feedback, admin review, feature-flag off.

## 4. Real bug found and fixed
`/api/spell/download` allowed an expired licence whose stored status was still ACTIVE. It now uses clock-derived `deriveLicenseState`. Unit assertion updated; E2E step I1 covers it.

## 5. Clean-DB migrations — VERIFIED
38 migrations applied to an empty cluster; `migrate status` up to date.

## 6. Production-like config — VERIFIED (tool)
`scripts/spell-release-config-check.ts` + 8 unit tests; names/shapes only, no values printed. Production configuration itself: REQUIRES PRODUCTION CONFIGURATION.

## 7. QPay — REQUIRES PRODUCTION CONFIGURATION
Audited (callback re-verified with provider, amount checked, idempotent). Real QPay NOT VERIFIED.

## 8. Windows installer — INFRASTRUCTURE BLOCKED
`win-unpacked/resources/app.asar` builds and passes `verify-package.mjs` (6 files, no forbidden content, production origin + pinned public key). NSIS finalisation needs wine/Windows; wine 9.0 installed in the container fails (wow64 `ntdll.dll` c0000135). GitHub Actions jobs (Ubuntu CI and Windows) end in ~2–3 s with no steps, runner or logs → runner-allocation/account-level block, not workflow YAML. Install, launch, activation on Windows, uninstall and user-data across reinstall: NOT VERIFIED.

## 9. Signing — REQUIRES PRODUCTION SIGNING CERTIFICATE
No `CSC_LINK`/`CSC_KEY_PASSWORD`. No installer exists to inspect; no signature claimed.

## 10. Hosting / integrity — REQUIRES PRODUCTION HOSTING
Fallback UI kept; no fake URLs. SHA-256/version plumbing verified with a placeholder in the test env only.

## 11. Update notice — VERIFIED
Signed, informational, no auto download/execute.

## 12. Security
No secrets committed; configuration checker leaks no values; asar verifier passed.

## 13. Performance
50-page first check, 6 repetitions this phase: 847, 772, 920, 770, 764, 922 ms (Phase 6: 693, Phase 7: 792). 1-page ~110–140 ms, 10-page ~300–355 ms, edit-one-paragraph p50 ~2 ms. No engine/data file changed since Phase 6 (diff vs 6bfdbef only adds feedback/update files), and run-to-run spread (~160 ms) exceeds the difference → measurement noise/environment, not a regression. Not a controlled benchmark.

## 14. Language engine — UNCHANGED
VALID 89.98%, UNKNOWN 10.01%, release-claim 33.34%, synthetic precision 99.47%. Native-reviewed: 0 → REQUIRES NATIVE REVIEW.

## 15. Remaining blockers
Runner (INFRASTRUCTURE BLOCKED); Windows installer build + install verification; signing certificate; installer hosting; real QPay credentials; native review.

## 16. Release recommendation
**INTERNAL ALPHA.** PRIVATE BETA requires a real Windows install, real activation, a usable hosted installer, and production-like commerce.

## Gates run
vitest 300 files / 3,226 tests pass; `tsc --noEmit` root and desktop clean; lint of touched scope 0 errors; E2E 29/29.
