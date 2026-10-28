# TORE Spell — production environment checklist

Names and shapes only. Never commit values. Verify with
`npx tsx scripts/spell-release-config-check.ts` against the production env.

| Variable | Requirement |
|----------|-------------|
| `TORE_SPELL_V1` | feature flag on |
| `DATABASE_URL` | non-local PostgreSQL; run `prisma migrate deploy` (includes `20261005120000`, `20261006120000`, `20261008120000_spell_feedback`) |
| `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | https production origin, no localhost |
| `SPELL_PRICES_MNT` | JSON for SPELL_1M / 3M / 6M / 12M |
| `QPAY_BASE_URL` | production (not sandbox) |
| `QPAY_CLIENT_ID`, `QPAY_CLIENT_SECRET`, `QPAY_INVOICE_CODE` | from QPay merchant account |
| `QPAY_CALLBACK_URL` | `https://<origin>/api/billing/qpay/callback` |
| Spell key rings (licence signing / entitlement / HMAC / AES) | generated per environment; public key pinned in `desktop/config/pinned-keys.production.json` must match |
| `SPELL_INSTALLER_STORAGE_KEY` | **preferred**: private S3 object `spell-installer/<version>/TORE-Spell-Setup.exe`; needs `FILE_STORAGE=s3`; licence-gated 60 s signed URL (see INSTALLER-DELIVERY.md) |
| `SPELL_WINDOWS_INSTALLER_URL` | public-URL mode only; **ignored in production** unless `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1` (anyone who learns the URL can download). A requested private key never falls back to it |
| `SPELL_WINDOWS_INSTALLER_SHA256` | 64 hex of the signed installer |
| `SPELL_RELEASE_VERSION` | e.g. 1.0.0 |
| `SPELL_WINDOWS_INSTALLER_SIZE`, `SPELL_MIN_SUPPORTED_VERSION` | optional |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | CI secrets only (REQUIRES PRODUCTION SIGNING CERTIFICATE) |
| `TORE_ALLOW_*` escape hatches | must be unset in production (checker WARNs) |

Release order: apply migrations → set env → build signed installer on Windows runner →
host it → set URL + SHA-256 + version → run checker → enable flag.
