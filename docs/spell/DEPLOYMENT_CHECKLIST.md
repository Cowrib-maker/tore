# TORE Spell Beta — production deployment checklist

State observed on **2026-10-06** via read-only Vercel inspection (project `tore`, team `tore4`). Values of secrets were never read or printed.

| Fact | Observed | Consequence |
|---|---|---|
| Production domain | `www.tore.mn` (canonical); `tore.mn` → 308 → `www.tore.mn`; `tore-seven.vercel.app` | Desktop production origin = `https://www.tore.mn` ✔ (matches `desktop/config/environments.json`) |
| Code in production | `main` @ `74fddfb` "fix(marketplace): enable lawyer profile photo uploads" | **The Spell routes, migration and this work are NOT deployed** — they exist only in the uncommitted working tree of branch `claude/tore-spell-foundation-lv0j6l` |
| `TORE_SPELL_V1` in production | **not set** | Even after deploy, every Spell route answers `404 SPELL_DISABLED` |
| `SPELL_*` key variables in production | **none set** | Spell would answer `503 SPELL_NOT_CONFIGURED` |
| Build script | `prisma generate && next build` | The build does **not** run migrations |
| QPay variables | none set | Paid consultations are refused honestly (no fake payments) |

## Required, in this order (all need production access — not done)
1. **Ship the code.** Commit + push the branch, open a PR, merge to `main` (needs your go-ahead; nothing was staged/committed).
2. **Apply the migration** `prisma/migrations/20261005120000_spell_licensing_foundation` to the production database. It is *purely additive* (new enums/tables/indexes; no existing table altered). Use the guarded CLI (`prisma.config.ts` refuses non-local URLs by design after the Sprint-14 incident — run it deliberately, from a trusted shell, with the production URL; back up first).
3. **Set production environment variables** (Production target, mark Sensitive):

   | Variable | Where the value comes from |
   |---|---|
   | `TORE_SPELL_V1` | literal `1` |
   | `SPELL_SIGNING_KEYS` | `.secrets/spell-signing.env` (format `kid:base64-PKCS8`) |
   | `SPELL_SIGNING_ACTIVE_KID` | `spell-2026-10` (must equal the kid pinned in the desktop) |
   | `SPELL_CODE_HMAC_KEYS`, `SPELL_CODE_HMAC_ACTIVE_KEY_ID` | `.secrets/spell-vault.env` |
   | `SPELL_CODE_ENC_KEYS`, `SPELL_CODE_ENC_ACTIVE_KEY_ID` | `.secrets/spell-vault.env` |

   These are the names the code already reads (`src/infrastructure/spell/spell-config.ts`); no new name was invented. Back the two `.secrets/*.env` files up in your password manager, then delete them from the machine. **Losing the vault keys makes issued license codes unrecoverable.**
4. Redeploy, then run the read-only preflight from any machine: `BASE=https://www.tore.mn npx tsx scripts/spell-live-smoke.ts` → must show `Spell enabled and configured` and `server serves the pinned key id`.
5. Issue a throw-away beta license (admin API/UI), then run the full smoke: `BASE=https://www.tore.mn LICENSE_CODE=… npx tsx scripts/spell-live-smoke.ts` (14 steps; uses the shipped pinned key). Revoke/deactivate afterwards.

## Key split (must never be crossed)
| | Server (Vercel production env) | Desktop installer |
|---|---|---|
| Signing key | **PRIVATE** PKCS#8 + `kid` | **PUBLIC** JWK + `kid` (`desktop/config/pinned-keys.production.json`) |
| Code vault keys | HMAC + encryption keys | never |
| Origin | — | `https://www.tore.mn` (not secret) |

Proven locally with real HTTP: the exact production keypair (secret on a local Next server, public pinned in the client) passes activate → validate → check → transfer-prompt → offline → deactivate (14/14).

## If production already has a different signing key
Do not install ours. Replace `desktop/config/pinned-keys.production.json` with the public JWK of the real key (fetch `GET /api/spell/v1/keys` from the real server after step 4 and verify the kid out-of-band), rebuild the desktop.

## Known, accepted for Controlled Beta
* Matter research: non-owner → 403, missing → 404 (existence disclosure, low risk; existing tests assert it) — deferred.
* `npm audit` high-severity transitive advisories — deferred, no churn before release.
* "Expired booking request" does not exist as a feature — not implemented, not invented.
* QPay: **NOT VERIFIED — CREDENTIALS UNAVAILABLE.** Code evidence: server-side verification (`verifyQpayCatalogPayment`), paid offerings refused without gateway.
* Admin has API-level photo management for lawyers (`targetUserId`, tested); there is no admin UI control for it yet.
