# TORE Spell — installer build evidence and delivery

## What has been verified (and what has not)

| Claim | State | Evidence |
|---|---|---|
| NSIS installer builds on Windows | **Verified on a real Windows runner (CI)** | `spell-desktop-windows` run #8 on `f7b74ac` (windows-latest): job `windows` succeeded |
| Artifact | `TORE-Spell-Setup.exe`, 111,335,763 bytes, SHA-256 `C648B7ED3ED4EC26BD59893412BB936EC21C492D0B05996437776A77B3C8C29A` | job summary/log; CI artifact `tore-spell-beta-windows-unsigned` (needs GitHub access; expires 2027-01-07) |
| Packaged content has no secrets, production origin, pinned PUBLIC key | Verified in CI | step "Verify packaged app content" |
| Silent install → launch → uninstall | **Verified in CI** | steps "Silent install", "Launch installed app (--selftest)", "Silent uninstall" |
| Installed app self-test | Verified in CI | crypto verify (valid / tamper rejected / foreign key rejected), licence client refuses without pinned keys, OS secret storage round-trip, spelling engine runs, personal dictionary persists and removes, Mongolian UI loads with the «Идэвхжээгүй» (not activated) badge |
| Code signing | **NOT signed** | CI step reports the real status; `CSC_LINK` / `CSC_KEY_PASSWORD` secrets do not exist |
| Interactive use by a human on Windows 10 / 11 | **Not verified** | CI ran headless on one image |
| Hosted, customer-reachable installer | **Not done** | the CI artifact is not a customer download |
| Real QPay payment | **Not verified** | only a sandbox *simulator* has been exercised |

The offline hash/signature inspection of the downloaded file was **not** possible from the authoring sandbox (egress to the artifact store is blocked), so the numbers above come from the CI log, not from re-hashing the file.

## Delivering the installer to paying customers (recommended: private)

1. Take the installer from the CI artifact of the exact commit being released. Hash it yourself:
   `Get-FileHash .\TORE-Spell-Setup.exe -Algorithm SHA256` and confirm it matches the CI log.
2. Upload it to the **private** production bucket with server-side encryption:
   `aws s3 cp TORE-Spell-Setup.exe s3://<bucket>/spell-installer/<version>/TORE-Spell-Setup.exe --sse AES256`
   (keep the bucket private; no public ACL, no CDN base URL for this prefix).
3. Set on the server (names only — values come from your secret store):
   - `SPELL_INSTALLER_STORAGE_KEY=spell-installer/<version>/TORE-Spell-Setup.exe`
   - `SPELL_WINDOWS_INSTALLER_SHA256=<the hash from step 1>`
   - `SPELL_RELEASE_VERSION=<version>` (must match the installer's version) and optionally `SPELL_WINDOWS_INSTALLER_SIZE`
   - `FILE_STORAGE=s3` (and the existing `S3_*` settings)
4. Run `npx tsx scripts/spell-release-config-check.ts` against that environment. `INSTALLER_DELIVERY` must read OK.
5. Behaviour: `/api/spell/download` checks the signed-in user holds a **live** licence (clock-derived: expired and revoked do not count), then 302s to a signed URL that lives **60 seconds**. The URL is never in any page or response body.

Public-URL mode (`SPELL_WINDOWS_INSTALLER_URL`, an https URL) is a deliberate opt-in: in production it is **ignored** unless `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1` is also set, because the licence check then only gates the page and route and anyone who learns the URL can fetch the installer (the application itself stays locked without a licence). It is never a silent fallback: if `SPELL_INSTALLER_STORAGE_KEY` is set but invalid, or storage is not S3, the download is **unavailable** (404) rather than switching to the public URL. The config checker reports both situations as blockers.

## Before real customers

- Obtain a code-signing certificate and add `CSC_LINK` / `CSC_KEY_PASSWORD` as CI secrets, rebuild, and read the CI "Signature status" step. Until then the page and the licence page say the installer is unsigned (SmartScreen warning).
- Real QPay merchant credentials (`QPAY_*`), a **non-sandbox** `QPAY_BASE_URL`, and a public https callback on the app origin (`/api/billing/qpay/callback`). Do a real small-amount payment end to end.
- Decide the support process promised on the licence page (support@tore.mn).
