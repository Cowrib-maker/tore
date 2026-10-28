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

## Deploy-order safety (enforced in code)
The build does not run migrations, so this code can be deployed before the Spell migrations are applied. A plain Prisma read selects every mapped column, which would make **every invoice query of the existing products fail** (`The column invoices.spell_plan_code does not exist`). This was reproduced on a local database that had only `main`'s 35 migrations.

`src/infrastructure/database/spell-schema-gate.ts` therefore makes the Prisma client leave `invoices.spell_plan_code` out of every query, and `PrismaInvoiceRepository.create` stops writing it for ordinary invoices, **while `TORE_SPELL_V1` is not `1`**. Consequences:
- Merging/deploying this code before the migrations is safe for the existing products as long as `TORE_SPELL_V1` stays unset (verified locally: reads and creates of ordinary invoices work against the pre-migration schema).
- **Never set `TORE_SPELL_V1=1` before all three Spell migrations are applied.** With the flag on, the column is read and written; on an unmigrated database every invoice query fails (also verified locally).
- **Do not switch `TORE_SPELL_V1` off again after Spell invoices exist and can still be paid.** With the flag off the Spell plan code is hidden, so a late QPay callback for a Spell invoice would be handled like a plan-less invoice and be marked `FAILED` instead of licensing the customer. To pause sales, remove the QPay variables (or the price entries) instead of the flag.

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

## Selling TORE Spell (purchase flow) — additional configuration
Flow: `/spell` → sign in → pick 1 / 3 / 6 / 12 months → QPay invoice (server price) → server-to-server payment check → licence issued **after** verified payment → `/spell/license` (code reveal, Windows download) → desktop activation.

| Variable / change | Notes |
|---|---|
| Migration `20261006120000_spell_purchase_fields` | additive: `invoices.spell_plan_code`, `spell_licenses.purchase_invoice_id` (UNIQUE). Apply with the first migration, before enabling the flag. |
| `SPELL_PRICES_MNT` | the ONLY price source. JSON, whole tugrik, e.g. `{"SPELL_1M":<n>,"SPELL_3M":<n>,"SPELL_6M":<n>,"SPELL_12M":<n>}`. A plan without a valid price shows «Үнэ удахгүй» and cannot be bought. **No price is committed to the repository.** |
| `SPELL_INSTALLER_STORAGE_KEY` | **Recommended.** Private S3 key `spell-installer/<version>/TORE-Spell-Setup.exe` (needs `FILE_STORAGE=s3`). Licence-gated 60-second signed URL; never public. Requested-but-invalid (typo, non-S3) → download unavailable, **never** a public fallback. See `INSTALLER-DELIVERY.md`. |
| `SPELL_WINDOWS_INSTALLER_URL` + `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1` | Public-URL mode. In production the URL is **ignored** unless the opt-in flag is also set (anyone who learns the URL can download the installer). Neither configured → the pages say the installer is coming soon and show no link. |
| `SPELL_RELEASE_VERSION`, `SPELL_WINDOWS_INSTALLER_SHA256`, `SPELL_WINDOWS_INSTALLER_SIZE` (optional), `SPELL_MIN_SUPPORTED_VERSION` (optional) | the latest release advertised to the desktop updater (signed server-side with the existing Spell signing key, valid 7 days). All of version + https URL (above) + 64-hex SHA-256 are required, otherwise no update notice is published. See `UPDATES.md`. |
| Migration `20261008120000_spell_feedback` | additive: enums `SpellFeedbackType` / `SpellFeedbackStatus` and the table `spell_feedback`. Apply before enabling the flag; see `FEEDBACK.md`. |
| `QPAY_BASE_URL`, `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE`, `QPAY_CALLBACK_URL` | existing TORE QPay configuration (none is set in production today). The callback stays `/api/billing/qpay/callback`. |
| `TORE_SPELL_V1=1` | purchases are refused (404) while Spell is disabled, so no money moves when the licence could not be issued. |

Security properties (tested): the browser sends only a plan code; price/duration/product are server-resolved; payment is verified with QPay `payment/check` against the invoice's server-set amount; licence issuance is idempotent per invoice (UNIQUE index), so repeated or concurrent callbacks never create a second licence; a failed fulfilment is retried by the next callback / status poll / account-page visit; licences, purchase status, code reveal and download are owner-only.

## Windows installer: build, host, link
* **Build:** `.github/workflows/spell-desktop-windows.yml` (windows-latest). A branch push alone does not run it. It runs on (a) a pull request touching `desktop/**` or `src/spell-engine/**`, (b) a pushed tag `spell-v*` (no merge needed), (c) manual dispatch once the file is on the default branch. Output artifact `tore-spell-beta-windows-unsigned` → `TORE-Spell-Setup.exe`, `SHA256SUMS.txt`, `selftest-windows.json`.
* **What CI proves:** typecheck of the Electron code, desktop/Spell tests, NSIS build, **package content check** (no private key / vault / QPay / database strings, production origin and pinned *public* key present), installer size + SHA-256, silent install, `--selftest` of the INSTALLED app (exit 0), silent uninstall.
* **Host:** a CI artifact is not a public download (it expires and needs GitHub login). Publish `TORE-Spell-Setup.exe` at a permanent **https** URL you control (e.g. object storage / CDN / a public release asset), verify its SHA-256 against `SHA256SUMS.txt`, then configure delivery (preferably the private `SPELL_INSTALLER_STORAGE_KEY`; the public `SPELL_WINDOWS_INSTALLER_URL` also needs `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1` in production). Until that variable is set the account page says the Windows installer is not ready and `/api/spell/download` answers 404. **No URL is committed or invented.**
* **Unsigned — REQUIRES PRODUCTION SIGNING CERTIFICATE:** Windows SmartScreen will warn until one exists. Integration point (already wired): add repository secrets `CSC_LINK` (base64 .pfx or secure URL) and `CSC_KEY_PASSWORD`; the build step passes them to electron-builder, and the «Signature status» step prints `Authenticode status` (NotSigned / Valid) in the run summary. The installer must not be called signed until that line says Valid. Never commit a certificate.

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
