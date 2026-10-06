# TORE Spell — Windows desktop MVP (RC1)

Status: **Beta candidate. The Windows installer has NOT been built or run by CI yet, and will be UNSIGNED.** [CERTAIN]
See `WINDOWS_QA.md` (what has really been tested), `ENVIRONMENTS.md` (API origin, key pinning, signing-key ceremony).

## What exists (verified)

| Piece | Where | Verified by |
|---|---|---|
| License client (activate / validate / transfer / deactivate / offline) | `desktop/core/license-client.ts` | `tests/unit/spell-desktop-client.test.ts` (13 tests) against the real Phase-1 use-cases |
| Spell session (licence gate, suggestions, replace, ignore once/all, personal dictionary) | `desktop/core/spell-session.ts` | same file |
| Electron shell (hardened window, narrow preload, Mongolian UI) | `desktop/app/**` | `scripts/spell-desktop-smoke.ts` — real Electron under Xvfb: wrong code → Mongolian error, activate, check, personal dictionary |
| Windows build config | `desktop/package.json` (`electron-builder`, NSIS x64) | `win-unpacked` produced on Linux; **NSIS finalisation needs Windows** (`wine` missing here) |
| CI installer job | `.github/workflows/spell-desktop-windows.yml` (manual) | not yet run |

## Protocol conformance
Ed25519 key generated on first run; private key stored through an injected `SecretProtector` (Electron `safeStorage` → DPAPI on Windows; **fails closed** if unavailable, never plaintext). Requests are signed with the exact `TORE-SPELL-V1` canonical string (a test pins client == server). Entitlement tokens (EdDSA JWS) are verified locally with `jose`, pinning alg/iss/aud/typ, and must carry this installation's thumbprint and activation id.

## Offline policy (as implemented, per ADR-008)
* `ACTIVE` until the token's `exp` (≤ 24 h after the last successful validation); `refreshDue` after `refresh_after` (12 h) → validate on start-up and hourly check.
* Network failure never locks early and never unlocks.
* A definitive server refusal (transferred away, revoked, expired) locks immediately and records why.
* Clock rollback beyond 10 minutes → `VALIDATION_REQUIRED` until an online validation. **This is a soft guard**: an attacker who also edits the local state file can defeat it. Real enforcement is the server on every validation. [CERTAIN]
* After a transfer, the old computer stays usable offline until its last token expires (≤ 24 h). This is a documented technical limitation, not an entitlement.
* Expired licenses are never auto-renewed.

## Honest limitations
1. **The unsigned installer will trigger Windows SmartScreen.** A code-signing certificate is an external purchase. [CERTAIN]
2. **Key pinning:** release builds pin the public key in `desktop/config/pinned-keys.production.json` and **fail closed** (wrong key / unknown kid / bad signature / malformed / expired → refused; tests in `spell-desktop-client.test.ts`). The matching **private** key is not yet installed on the production server (see ENVIRONMENTS.md) — until it is, activation is refused. [CERTAIN]
3. **Language data:** the bundled lexicon is a SEED set (~1,600 entries after the Beta coverage batch; was ~570). Most real Mongolian words are `UNKNOWN`, which the UI deliberately does not call errors. In the smoke test, «докумнт» is *not* flagged. The product value of Spell is bounded by licensed lexicon coverage, not by this app. [CERTAIN]
4. The production API origin `https://www.tore.mn` is fixed in `desktop/config/environments.json` (taken from the app's own configuration comments; not verified live from the authoring sandbox, and Spell routes are behind `TORE_SPELL_V1`).
5. Electron UI has been exercised on Linux/Xvfb only; no Windows run, no DPI/IME testing. Mongolian Cyrillic input through Windows IME is untested.
6. No auto-update, no application icon, no word-processor integration (it is a standalone editor window; the "check in any app" product is not built).

## Build (on Windows / CI)
```
cd desktop && npm ci
set TORE_SPELL_API_BASE=https://<production origin>
npm run dist:win        # → desktop/release/TORE Spell Setup <ver>.exe (unsigned)
```
