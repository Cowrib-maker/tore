# TORE Spell — environments and configuration

| | development | staging | production (Beta) |
|---|---|---|---|
| Desktop build | `node build.mjs` (default) | `TORE_SPELL_ENV=staging` | `node build.mjs --release` / `npm run dist:win` |
| API origin | `http://localhost:3000` (or `TORE_SPELL_API_BASE`) | **not configured** — no staging host is known; the build refuses | `https://www.tore.mn` (fixed in `desktop/config/environments.json`) |
| Pinned public key | none (fetches the key set from the API; DEV ONLY) | `config/pinned-keys.staging.json` (required) | `config/pinned-keys.production.json` (required, build fails if empty) |
| Fails closed without pinned key | no | yes | yes |
| UI label | "TORE Spell (dev)" | Бета | **Бета** |

The origin is not a secret. Nothing secret is read or baked in at build time.

## Server (Next.js app) — required for Spell to work
| Variable | Notes |
|---|---|
| `TORE_SPELL_V1=1` | feature flag; Spell routes answer 404 `SPELL_DISABLED` otherwise |
| `SPELL_SIGNING_KEYS`, `SPELL_SIGNING_ACTIVE_KID` | Ed25519 PKCS#8 (base64) ring; **private**, server only |
| `SPELL_CODE_HMAC_KEYS`, `SPELL_CODE_HMAC_ACTIVE_KEY_ID`, `SPELL_CODE_ENC_KEYS`, `SPELL_CODE_ENC_ACTIVE_KEY_ID` | license-code vault keys |
| optional: `SPELL_TOKEN_MAX_OFFLINE_HOURS` (default 24), `SPELL_TOKEN_REFRESH_INTERVAL_HOURS` (12), `SPELL_TRANSFER_COOLDOWN_DAYS`, … | see `spell-config.ts` |

## Signing key ceremony — superseded by DEPLOYMENT_CHECKLIST.md (read that first)
1. `npx tsx scripts/spell-generate-signing-key.ts --kid spell-2026-10 --secret-out .secrets/spell-signing.env --public-out desktop/config/pinned-keys.production.json`
   * The **public** half (kid `spell-2026-10`) is now in `desktop/config/pinned-keys.production.json` and is baked into release builds.
   * The **private** half is in the git-ignored `.secrets/spell-signing.env` on the machine that ran the script (two lines: `SPELL_SIGNING_KEYS`, `SPELL_SIGNING_ACTIVE_KID`).
2. **REQUIRED, NOT DONE:** copy those two lines into the production server's environment (e.g. Vercel project env), redeploy, then delete the file. Until then, production activations fail closed with «Эрхийн мэдээллийг баталгаажуулах түлхүүр танигдсангүй» (`TOKEN_UNKNOWN_KEY`) — safe, but the product cannot be activated.
3. If the server already holds a production signing key, do **not** install this one: replace `pinned-keys.production.json` with that key's public JWK (`GET /api/spell/v1/keys` of the real server, verified out-of-band) and rebuild.
4. Rotation: add the new key to the server ring (both public keys are served), ship a desktop build pinning **both** kids, then retire the old key after the longest token lifetime (24 h).
