# ADR-006 — TORE Spell licensing & activation

| Field | Value |
|-------|-------|
| **ADR** | 006 |
| **Title** | TORE Spell licensing & activation |
| **Status** | Accepted |
| **Date** | 2026-10-05 |
| **Related** | [ADR-007](./adr-007-spell-device-identity.md), [ADR-008](./adr-008-spell-entitlement-token.md), [docs/spell](../spell/README.md) |

## Context

TORE Spell is a standalone paid desktop product (Windows/macOS) with 1/3/6/12-month licenses, one active computer per license, device transfer, auditability and server-authoritative validity. TORE already has subscriptions, entitlements, QPay and admin authorization, which must not be disturbed.

## Decision

1. **Separate bounded subsystem.** New tables (`spell_*`) and code (`*/spell/`); no reads or writes of `Subscription`/`Invoice`/`PaymentTransaction`. Standalone licenses and TORE-subscriber entitlement stay conceptually separate; both will feed one entitlement resolver later.
2. **License ≠ activation.** `SpellLicense` is the purchased instrument; `SpellActivation` binds it to one `SpellInstallation`. History is retained; rows are never deleted.
3. **Term starts at first activation**, bounded by `redeemBy`. `EXPIRED` is derived from server time, never stored.
4. **One ACTIVE activation per license** via SERIALIZABLE transactions + bounded retry *and* a partial unique index. Retries exhausted ⇒ typed, retryable 409.
5. **Transfers require explicit, targeted confirmation** (`confirmTransferOfActivationId`), have a configurable cooldown, and are admin-overridable. Every transition appends an immutable `SpellLicenseEvent` (DB triggers forbid UPDATE/DELETE/TRUNCATE).
6. **Code protection:** keyed HMAC for lookup + AES-256-GCM for owner reveal (key version stored beside the ciphertext, AAD-bound) + 4-char hint. Plaintext is shown once at issuance and on authenticated owner reveal only.
7. **Plans are a code catalog** (like `subscription-plans.ts`); issued licenses snapshot `durationMonths`.
8. **Feature-flagged** (`TORE_SPELL_V1`, default off).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Reuse `Subscription` for standalone licenses | Different lifecycle (fixed term, redeem code, device-bound); would entangle billing and make plan changes risky. |
| Store `EXPIRED` and flip it with a job | A missed job means a valid-looking expired license. Derivation from the clock cannot drift. |
| Row lock (`FOR UPDATE`) instead of SERIALIZABLE | Valid, but the decision was SERIALIZABLE (consistent with `BillingUnitOfWork`); the unique index covers the lock's role as a backstop. |
| Hash-only code storage | Conflicts with "owner can view their code". |
| Redis-only brute-force counters | Redis is optional in production here; the in-process limiter is per-instance. DB counters are authoritative. |

## Consequences

* Real-Postgres tests are mandatory for the concurrency guarantees (CI job `spell-db`).
* Under heavy contention some requests get `409 ACTIVATION_CONFLICT`; clients retry.
* Prisma 7 + `adapter-pg` reports serialization failures as `DriverAdapterError{cause.kind:"TransactionWriteConflict"}`, **not** `P2034`; the retry classifier handles that shape and is pinned by tests.
* Adding subscriber entitlement later is additive (nullable `subscription_id`, XOR check, second partial unique index).

## Rollback strategy

Flag off ⇒ every Spell route returns 404. The migration is additive and self-contained; manual rollback SQL is in the migration file. No existing table is altered.
