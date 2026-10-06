# TORE Spell — licensing & activation backend (Phase 1)

TORE Spell is a standalone desktop spelling/writing product. This directory documents the **licensing and activation backend** that ships in Phase 1. The desktop client, QPay purchase flow, TORE-subscriber entitlement and any new language work are **not** part of Phase 1 (see [Out of scope](#out-of-scope)).

Related ADRs: [ADR-006 licensing & activation](../architecture/adr-006-spell-licensing-activation.md) · [ADR-007 device identity](../architecture/adr-007-spell-device-identity.md) · [ADR-008 entitlement token & offline policy](../architecture/adr-008-spell-entitlement-token.md).

## Architecture

```
TORE Identity (User, requireActor)
        ↓
Spell Entitlement  ── resolver: license today; TORE subscription later (additive)
        ↓
Spell Licensing    ── License: issue / revoke / derive state from server time
        ↓
Spell Activation   ── one ACTIVE activation per license, transfer, cooldown
        ↓
Signed entitlement token (EdDSA, kid-rotated, ≤ 24 h offline)
        ↓
Desktop client     ── Phase 2+
```

It is a bounded subsystem: nothing in Spell reads or writes `Subscription`, `Invoice` or `PaymentTransaction`, and no existing billing, entitlement or orthography behaviour was changed.

| Layer | Location |
|---|---|
| Domain (pure) | `src/domain/spell/` — enums, entities, `license-code`, `license-state`, `transfer-policy`, `device-identity`, `policy`, `errors`, `messages` |
| Repository ports | `src/domain/repositories/spell-*.ts`, `src/domain/ports/spell-*.ts` |
| Use-cases | `src/application/use-cases/spell/` |
| Prisma / in-memory repos, unit of work | `src/infrastructure/repositories/*spell*`, `src/infrastructure/database/prisma-spell-unit-of-work.ts`, `serialization-retry.ts` |
| Crypto, token, config, composition root | `src/infrastructure/spell/` |
| HTTP | `src/app/api/spell/**`, helpers in `src/application/common/spell-http.ts` |
| Language engine (dependency-free) | `src/spell-engine/` (+ adapter `src/infrastructure/spell/orthography-v0-engine.ts`) |

## Business rules (as implemented)

1. **Term starts at first activation.** A license carries `redeemBy` (default **90 days** after issuance, `SPELL_REDEEM_BY_DAYS`). `startsAt`/`expiresAt` are `NULL` until first activation, then `expiresAt = startsAt + durationMonths` (calendar months, UTC, clamped to month end). `EXPIRED` is **never stored**; it is derived from server time (`deriveLicenseState`). At exactly `expiresAt`/`redeemBy` the license is already expired.
2. **One ACTIVE activation per license**, enforced twice: SERIALIZABLE transactions with bounded retry, and a partial unique index (`spell_activations_one_active_per_license`) as the database backstop.
3. **Self-service transfer** needs explicit confirmation naming the activation being replaced (below). The old activation becomes `DEACTIVATED / TRANSFERRED`, the new one `ACTIVE`, and a fresh token is returned.
4. **Transfer policy (approved):** the **first** device transfer after initial activation is **free**. After a successful transfer, the next self-service transfer requires a **30-day cooldown** (`SPELL_TRANSFER_COOLDOWN_DAYS`) measured from the **previous successful transfer**. Deactivating does not bypass it. An ADMIN can override it. Every transfer and override is recorded in the immutable event log. See [Cooldown semantics](#cooldown-semantics).
5. **Owner can view their code** from their authenticated account. Stored: HMAC (lookup), AES-256-GCM ciphertext + `codeEncKeyVersion` (owner reveal), `codeHint` (last 4). Never the plaintext.
6. **Server is authoritative** for validity, expiry, ownership and transfer. The client only verifies a token signature and `validUntil` locally.

## Activation / transfer protocol

All device endpoints are authenticated by an **Ed25519 request signature**, not cookies (`/api` is outside the cookie middleware).

Headers: `X-Spell-Installation` (= `base64url(SHA-256(raw public key))`), `X-Spell-Timestamp` (unix seconds), `X-Spell-Nonce` (≥16 base64url chars, unique per request), `X-Spell-Signature` = `base64url(Ed25519(privateKey, canonical))` where

```
canonical = "TORE-SPELL-V1\n" + METHOD + "\n" + pathname + "\n" + timestamp + "\n" + nonce + "\n" + hex(SHA-256(rawBody))
```

The server checks, in order: header shape → clock window (default ±300 s) → key resolution (activation: key from the signed body must hash to the header thumbprint; otherwise the stored key) → signature → revocation → nonce single-use. A nonce is consumed only after the signature verifies.

### `POST /api/spell/v1/activations`

```json
{ "code": "TSPL-XXXX-…", "installation": { "publicKey": "<b64url raw 32B>", "platform": "WINDOWS|MACOS", "appVersion": "1.0.0", "machineHint": "optional" },
  "confirmTransferOfActivationId": "optional" }
```

| Situation | Response |
|---|---|
| First activation / free computer | `200 { status: "ACTIVATED", token, … }` — term clock starts |
| This computer already holds it | `200 { status: "ALREADY_ACTIVE" }` (idempotent, term unchanged) |
| Held by another computer, **no** confirmation | `409 TRANSFER_CONFIRMATION_REQUIRED` with `warning` (the mandated Mongolian text), `replacesActivationId`, `currentDevice { platform, activatedAt }`. **Nothing changes.** |
| Confirmed (`confirmTransferOfActivationId` equals the activation being replaced) | `200 { status: "TRANSFERRED", token }` |
| Confirmation names a different activation than the current one | `409 TRANSFER_CONFIRMATION_REQUIRED` again with the current id (a stale prompt can never evict a computer the user did not see) |
| Cooldown active | `403 TRANSFER_COOLDOWN_ACTIVE { transferAvailableAt }` — returned *before* any confirmation prompt |
| Revoked / expired / past `redeemBy` | `403 LICENSE_REVOKED / LICENSE_EXPIRED / LICENSE_REDEEM_WINDOW_CLOSED` |
| Unknown, malformed or bad-checksum code | `404 LICENSE_CODE_INVALID` (identical for all three) |
| Lockout | `429 TOO_MANY_ATTEMPTS` + `Retry-After` |
| Lost a race and retries exhausted | `409 ACTIVATION_CONFLICT` (safe to retry; nothing changed) |

The warning text (verbatim, product-mandated):

> Энэ license одоогоор өөр компьютерт идэвхтэй байна. Шинэ компьютерт шилжүүлбэл өмнөх компьютер дээр ашиглах эрх хүчингүй болно.

Desktop flow: call without `confirmTransferOfActivationId` → on `409 TRANSFER_CONFIRMATION_REQUIRED` show `details.warning` and require an explicit confirmation → repeat the call with `confirmTransferOfActivationId = details.replacesActivationId`.

### `POST /api/spell/v1/validations` · `POST /api/spell/v1/deactivations`

Body `{ "activationId": "…" }`. `validations` returns a fresh token only while **this** installation still holds the ACTIVE activation of a non-revoked, non-expired license; otherwise `403 ACTIVATION_NOT_ACTIVE` (with `status`/`endReason` such as `TRANSFERRED`, so the client can say "this license moved to another computer") or `LICENSE_EXPIRED`. `deactivations` releases the computer's own activation (idempotent).

### `GET /api/spell/v1/keys`

Public JWKS (Ed25519) for every key in the ring. Clients select by token `kid`.

### Account / admin (cookie auth, `requireActor`, same-origin check on writes)

| Endpoint | Who |
|---|---|
| `GET /api/spell/licenses` | signed-in owner — own licenses, masked codes, active computer, `transferAvailableAt` |
| `POST /api/spell/licenses/:id/code` | **owner only** — reveals the full code (audited; `no-store`; 20/h); non-owners get 404 |
| `POST /api/spell/licenses/:id/deactivate` | owner — release from the web |
| `GET/POST /api/spell/admin/licenses` | ADMIN — list / issue (the only response containing a plaintext code, shown once) |
| `GET /api/spell/admin/licenses/:id` | ADMIN — detail, activations, immutable event log |
| `POST …/:id/revoke`, `…/reset-transfer-cooldown`, `…/deactivate` | ADMIN — `reason` required |

Every route returns `404 SPELL_DISABLED` until `TORE_SPELL_V1=1`, and `503 SPELL_NOT_CONFIGURED` if enabled without valid keys.

## Offline & revocation (what is and is not guaranteed)

The business rule is *"when a license is activated on a new computer, the old computer must no longer be usable."* The server enforces it; the only gap is a technical one.

| Old computer is… | What happens |
|---|---|
| **Online** | Its next validation (application start-up, or the 12-hourly refresh) fails with `ACTIVATION_NOT_ACTIVE` (`endReason: TRANSFERRED`). It must stop working at once. |
| **Offline** | It cannot learn about the transfer. It can keep running **only** until its last locally verifiable signed token expires (`tokenValidUntil`), which is **at most 24 hours** after that token was issued (and never past the license's own expiry). |

> **This 24-hour limit is a technical limitation of offline operation, not an entitlement.** The old computer has *no right* to keep using the license after a transfer. Do not describe it to users (UI copy, support scripts, marketing, terms) as "24 hours of continued license access" or any similar grant. The only user-facing statement is that the previous computer's access ends when it next connects to the server.

Server-controlled parameters (delivered in every grant, never hard-coded in the client): `SPELL_TOKEN_MAX_OFFLINE_HOURS` (default and production value **24**, guard-railed to 1 h – 7 d) and `SPELL_TOKEN_REFRESH_INTERVAL_HOURS` (default **12**; must be shorter than max offline).

The client **must** validate on start-up and every 12 hours, and refuse to run past `tokenValidUntil`.

**Clock tampering:** a user who rolls back the system clock can extend offline use until the *real* token window passes. Client mitigation (Phase 2): persist a monotonic "latest server time seen" (`serverTime` is in every grant) and refuse to run if the local clock is earlier. It cannot be fully solved offline and is documented rather than hidden.

## Cooldown semantics

`SpellLicense.lastDeviceChangeAt` is set when the license moves to a *different installation* than before — whether the old one was still active (a transfer) or had been released first. It is **not** set by first activation, by re-activating the same computer after releasing it, or by admin actions.

* First device change after initial activation: allowed immediately (`lastDeviceChangeAt` is `NULL`).
* Any later change: blocked until `lastDeviceChangeAt + 30 days`, then allowed. The clock restarts at each successful change.
* Deactivate-then-activate-elsewhere counts as a device change, so it cannot bypass the cooldown.
* ADMIN `reset-transfer-cooldown` clears `lastDeviceChangeAt` (reason required; audited in `SpellLicenseEvent` and `AuditLog`). The admin cannot move the license for the user — only a computer holding a key can activate — so the user then transfers normally, which restarts the cooldown.

## Security model

| Concern | Control | Test |
|---|---|---|
| Code guessing | 115-bit random codes; DB-backed lockout per IP hash **and** per installation (the in-process rate limiter is per-instance without Redis, so it is only a first filter); uniform error for unknown/malformed/bad-checksum | `spell-activation` "locks out…", "same error…" |
| Code at rest | HMAC-SHA256 (keyed, domain-separated, key ring) + AES-256-GCM (AAD = license id + key version); plaintext never stored | `spell-crypto`, `spell-owner-admin`, migration test |
| Code in logs / audit / errors | Events, attempts, AuditLog, installations and `console.*` asserted free of code/hash/ciphertext/hint inputs | `spell-activation` "no secret ever reaches…" |
| Owner reveal | Owner-only; audit event written **before** plaintext is returned (fail closed); non-owner = 404; `no-store`; rate limited | `spell-owner-admin` |
| Replay | Signed timestamp window + single-use nonce table | `spell-activation` "signed device requests" |
| Token forgery | EdDSA only; alg/iss/aud/typ pinned; `kid` from published set only; none/HS256 confusion rejected | `spell-crypto` |
| Race conditions | SERIALIZABLE + bounded retry + partial unique index; typed 409 on exhaustion | `tests/db/spell.db.test.ts` (real Postgres) |
| Audit integrity | Append-only `spell_license_events` (DB triggers reject UPDATE/DELETE/TRUNCATE) | `tests/db` |
| CSRF | Same-origin check on cookie-authenticated writes; device routes ignore cookies | `spell-http` |
| Privacy | Device = random key pair; optional machine hint stored only as a keyed hash and used only as a soft signal; raw IPs never stored | ADR-007 |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `TORE_SPELL_V1` | off | Must be exactly `1`. |
| `SPELL_CODE_HMAC_KEYS`, `SPELL_CODE_HMAC_ACTIVE_KEY_ID` | required | `id:base64(32 bytes)[,…]` |
| `SPELL_CODE_ENC_KEYS`, `SPELL_CODE_ENC_ACTIVE_KEY_ID` | required | `id:base64(32 bytes)[,…]` |
| `SPELL_SIGNING_KEYS`, `SPELL_SIGNING_ACTIVE_KID` | required | `kid:base64(PKCS#8 DER Ed25519)[,…]` |
| `SPELL_REDEEM_BY_DAYS` | 90 | |
| `SPELL_TRANSFER_COOLDOWN_DAYS` | 30 | `0` disables the cooldown |
| `SPELL_TOKEN_MAX_OFFLINE_HOURS` | 24 | 1 – 168 |
| `SPELL_TOKEN_REFRESH_INTERVAL_HOURS` | 12 | ≥ 5 min and < max offline |
| `SPELL_REQUEST_SKEW_SECONDS` | 300 | 30 – 900 |
| `SPELL_MAX_FAILED_CODE_ATTEMPTS`, `SPELL_FAILED_ATTEMPT_WINDOW_MINUTES` | 10 / 15 | |

Generate keys (never commit them; store in the secret manager):

```bash
node -e "console.log('h1:'+require('crypto').randomBytes(32).toString('base64'))"   # HMAC
node -e "console.log('e1:'+require('crypto').randomBytes(32).toString('base64'))"   # encryption
node -e "const c=require('crypto');console.log('k1:'+c.generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64'))"  # signing
```

Configuration is validated at call time (like QPay). Errors name variables, never values.

## Key rotation

* **Signing:** add `k2` to `SPELL_SIGNING_KEYS`, set `SPELL_SIGNING_ACTIVE_KID=k2`, deploy. `/keys` now publishes both; old tokens (≤ 24 h) still verify. Remove `k1` after > 24 h (plus client key-cache TTL).
* **Code HMAC:** add `h2`, make it active. Lookup tries every configured key, so existing licenses keep working; new licenses use `h2`. Never remove an HMAC key while licenses still reference it (`code_hash_key_id`).
* **Code encryption** (key version is persisted with every ciphertext in `spell_licenses.code_enc_key_version`, and is also bound into the AES-GCM AAD):
  1. Generate a new key and add it to `SPELL_CODE_ENC_KEYS` as `e2` **alongside** `e1`; set `SPELL_CODE_ENC_ACTIVE_KEY_ID=e2`; deploy. New licenses use `e2`; existing rows remain readable because their stored version (`e1`) is still in the ring.
  2. Re-encrypt existing rows: for each row with `code_enc_key_version <> 'e2'`, call `KeyRingSpellCodeVault.reencrypt({ ciphertext, keyVersion, licenseId })` and persist the result with `SpellLicenseRepository.updateCodeCiphertext(id, ciphertext, keyVersion)`. (`reencrypt` is idempotent and a no-op for rows already on the active key.) A batch script is intentionally not shipped in Phase 1: it is not needed for correctness, and the rotation round-trip is covered by `tests/db/spell.db.test.ts` and `tests/unit/spell-crypto.test.ts`.
  3. Verify `SELECT count(*) FROM spell_licenses WHERE code_enc_key_version <> 'e2'` is `0`, then remove `e1` from the ring. Removing it earlier makes those owners' "reveal" fail (activation is unaffected — it uses the HMAC).

## Operations (must be done before real traffic)

* **PRE-PRODUCTION REQUIREMENT — schedule `pruneSpellTransientData`** (deletes expired request nonces and attempt rows older than 30 days). The repository has no scheduled-job mechanism (no Vercel cron config, no worker, no scheduled workflow), so it is intentionally **not wired** and no scheduling infrastructure was invented. Until it runs, `spell_request_nonces` and `spell_attempts` only grow (correctness is unaffected). Run it from whatever scheduler the deployment adopts, e.g. a small authenticated route or script that calls `pruneSpellTransientData({ attemptRepository, nonceRepository })` daily. `spell_license_events` is audit data and is never pruned.
* Apply the migration `…_spell_licensing_foundation` (additive; rollback notes are at the bottom of the SQL). It does not alter any existing table; the only link to existing data is a FK from `spell_licenses.owner_user_id` to `users(id)`.
* CI job `spell-db` runs the real-Postgres suite. Locally: `createdb tore_spell_test; DATABASE_URL=… npx prisma migrate deploy; SPELL_TEST_DATABASE_URL=… npm run test:spell-db` (refuses non-local databases).

## Language engine boundary

`src/spell-engine/` defines `LanguageEngine` (+ pipeline stage *types*, a registry and a conformance checker) and imports nothing outside itself — enforced by ESLint and a unit test — so it can ship inside the desktop app or compile to WASM. Licensing depends only on this contract (also asserted by a test).

Engine **v0** (`orthography-rules@0.1.0`) is the existing TORE orthography engine, wrapped unchanged: vowel-harmony/suffix rules and a curated dictionary. It is **word-level baseline** — no morphology, no sentence context, no grammar — and declares `maturity: BASELINE_RULES` and its capabilities honestly. The flag-gated generated legal vocabulary is deliberately excluded so measurements stay reproducible. Accuracy is *not* claimed anywhere; it will be measured against the gold sets in `tests/evaluation/`.

## Out of scope

Desktop client (installer, updater, secure storage, UI) · QPay purchase flow and `PURCHASE`-source issuance · TORE-subscriber entitlement (additive: nullable `subscriptionId` + XOR check + second partial unique index on `spell_activations`, and a second source in the entitlement resolver) · admin UI pages · cron wiring · encryption-key rotation batch script · any grammar/context/morphology work.

## Known limitations

* Offline revocation is bounded by token validity (≤ 24 h), not instantaneous — inherent to offline use.
* An admin revoke can lose a retry race under extreme contention and return `409 ACTIVATION_CONFLICT`; retry. Nothing is half-applied.
* The signing and encryption keys live in environment variables in Phase 1; moving them to a KMS is a drop-in change behind `SpellCodeVault`/`SpellTokenIssuer`.
* The activation endpoint creates an `installation` row only for requests that succeed; rejected requests leave none.
