# ADR-008 — TORE Spell entitlement token & offline policy

| Field | Value |
|-------|-------|
| **ADR** | 008 |
| **Title** | Signed entitlement token & offline policy |
| **Status** | Accepted |
| **Date** | 2026-10-05 |

## Context

The desktop app must work without continuous internet, yet "when a license moves to a new computer the old one must stop working", and the server — not the client — decides validity.

## Decision

1. **Token:** JWS signed with `jose`, **EdDSA (Ed25519) only**; header `{alg:"EdDSA", kid, typ:"tore-spell+jwt"}`; claims `iss`, `aud`, `sub`(license), `act`(activation), `inst`(thumbprint), `plan`, `lic_exp`, `refresh_after`, `iat`, `exp`, `jti`, `ver`. No hand-rolled JWT code. The verifier pins algorithm, issuer, audience and `typ`, and resolves keys only from the published set by `kid`.
2. **Offline policy (configurable server-side, delivered in every grant):**
   * validate on application start-up,
   * re-validate every **12 h** (`refresh_after`),
   * `exp` = `min(license expiry, issuedAt + 24 h)` — the **hard** offline limit.
3. **Honesty:** after a transfer an *online* old computer is refused at its *next validation*; an *offline* one may keep running only until its last token's `exp` (≤ 24 h). That window is a **technical limitation, not an entitlement**: the old computer has no right to continue, and product copy must not describe it as "24 hours of continued access" nor promise instantaneous offline revocation. Config guard rails (max offline 1 h–7 d, refresh < offline) prevent silently weakening the rule.
4. **Rotation:** `kid`-based key ring; `/api/spell/v1/keys` publishes all public keys; retire an old key after the longest token lifetime.
5. Tokens are bearer entitlements for *display/gating on the client only*; every state decision is re-made by the server on activate/validate.

## Alternatives considered

Short-lived (minutes) tokens — would break normal offline use; no expiry — revocation could never take effect; symmetric (HS256) — secret would have to ship in the client.

## Consequences

Clients must implement start-up + periodic validation and honour `tokenValidUntil`; clock-rollback hardening is a Phase 2 client task (see README).

## Rollback

Token format is versioned (`ver`); a new version can be issued alongside the old during a migration window.
