# TORE Spell — controlled beta: release path and acceptance test

Status words used here: **Verified** = observed in a real run; **Simulated** = exercised against a stand-in (never read it as the real service);
**Not verified** = no evidence yet. Nothing below is a claim of production readiness.

## 1. What exists, and the evidence

| Item | State | Evidence |
|---|---|---|
| Windows installer builds, installs, launches, uninstalls | **Verified (CI, headless)** | `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest`: typecheck, tests, NSIS build, content check, silent install, `--selftest`, silent uninstall all passed |
| Installer identity | Verified in the CI log only | `TORE-Spell-Setup.exe`, 111,335,763 bytes, SHA-256 `C648B7ED3ED4EC26BD59893412BB936EC21C492D0B05996437776A77B3C8C29A`, app version `1.0.0-rc.1` (`desktop/package.json`) |
| Code signing | **Not signed** | CI reports the measured Authenticode status; no `CSC_LINK` / `CSC_KEY_PASSWORD` secrets exist. Pull-request builds are always unsigned test builds and never receive signing secrets; only a `spell-v*` tag (push, or `sign=true` dispatch started from the tag) inside the protected `spell-release-signing` Environment can sign, and it fails unless the signature is `Valid`. The artifact name now says `unsigned` or `signed` from that measurement |
| File bytes re-checked outside CI | **Not verified** | The authoring sandbox could not reach the artifact store, so the hash above has not been recomputed from the downloaded file |
| Purchase → licence → activation logic | **Verified against a simulator** | `npm run e2e:spell`: 29 steps over real HTTP + a real PostgreSQL, with a QPay **sandbox simulator (not QPay)** |
| Real QPay payment | **Not verified** | no merchant credentials exist |
| Private installer delivery (signed S3 URL) | Verified with a **mocked storage layer** | `tests/unit/spell-installer-delivery.test.ts`; never run against a real bucket |
| Human use on Windows 10/11 | **Not verified** | §4 below |

## 2. Operator: getting the installer from CI

1. Build: run the **spell-desktop-windows** workflow (Actions → *Run workflow*) on the exact commit to release, or push a tag `spell-v<version>`.
   A tag must equal the version in `desktop/package.json` (the build fails otherwise).
2. Retrieve: Actions → the run → *Artifacts* → `tore-spell-<version>-<commit7>-windows-<signed|unsigned>`
   (or `gh run download <run-id> -n <artifact-name> -D <new empty folder>`). Needs read access to the repository.
   The artifact holds `TORE-Spell-Setup.exe`, `SHA256SUMS.txt` and `selftest-windows.json`.
3. Retention: GitHub keeps it **90 days** (set explicitly; the previous artifact showed a 90-day expiry). A tag build also creates a **draft
   pre-release** with the exe and `SHA256SUMS.txt` so the file outlives the artifact. *This draft-release job has not been run yet* (it needs a real tag push).
4. Verify yourself before publishing anything: on a Windows machine run
   `Get-FileHash .\TORE-Spell-Setup.exe -Algorithm SHA256` and compare with `SHA256SUMS.txt` **and** the workflow summary. If they differ, stop.
5. Deliver privately: follow `INSTALLER-DELIVERY.md` (S3 key under `spell-installer/<version>/`, `SPELL_INSTALLER_STORAGE_KEY`,
   `SPELL_WINDOWS_INSTALLER_SHA256`, `SPELL_RELEASE_VERSION`), then run `npx tsx scripts/spell-release-config-check.ts` — `INSTALLER_DELIVERY` must read OK.
   A requested private key never falls back to a public URL; production ignores a public URL unless `TORE_ALLOW_PUBLIC_SPELL_INSTALLER=1`.
6. Failure behaviour of the download route: no session → 401; no live licence (none, expired, revoked) → 403; nothing configured or private delivery
   misconfigured → 404 `INSTALLER_NOT_AVAILABLE`; storage error → 503 `DOWNLOAD_UNAVAILABLE` (retry). Signed URLs live **60 seconds**.

## 3. The real customer path

| Step | Built | Tested how |
|---|---|---|
| `/spell` shows price (server-side), Windows, requirements, unsigned note | yes | unit + E2E page render |
| Buy → QPay invoice at the server's price | yes | **Simulated** provider (E2E); a client-supplied amount is ignored |
| Payment verified server-side (provider re-check, exact amount) | yes | **Simulated**; wrong/absent/failed payments never issue a licence |
| Licence issued exactly once (duplicate and concurrent callbacks) | yes | E2E: 3 sequential + 8 concurrent callbacks → 1 licence |
| Licence page: code reveal (owner only), version/size/SHA-256, help if something fails | yes | E2E (reveal), UI copy tests |
| Download only with a live licence | yes | unit (route), E2E (URL mode); **real S3 not tested** |
| Install → launch | yes | CI headless; **human not done** |
| Activate → one computer, transfer, expiry, renewal | yes | E2E with the real desktop licence client against the real server logic; **installed app against a live server not done** |
| Spelling check, suggestions, personal dictionary | yes | CI self-test (engine + dictionary persistence); **human not done** |

## 4. Acceptance test for a person on Windows 10/11 (no developer knowledge needed)

You need: the installer file and its expected SHA-256 (from the operator), a valid licence code, and — for 4.7 — help from the operator.
Write down what you actually saw next to each line; "looked fine" is not a result.

1. **Download.** ☐ Get `TORE-Spell-Setup.exe` from the licence page (signed-in, with an active licence). Save it somewhere you can find it.
2. **Check the file.** ☐ Open PowerShell in that folder, run `Get-FileHash .\TORE-Spell-Setup.exe -Algorithm SHA256`.
   ☐ The value equals the one on the licence page and in `SHA256SUMS.txt`. ☐ The size is about 106 MB. *If the value differs, stop and report it.*
3. **Install and open.** ☐ Run the file. ☐ Windows may warn (SmartScreen) because the beta is unsigned: *More info → Run anyway* is expected.
   ☐ After installing, TORE Spell opens and shows that it is **not activated** («Идэвхжээгүй»).
4. **Spelling (after activation, §6).** ☐ Type or paste: `Манай сургуулын захирал ирлээ.` ☐ `сургуулын` is marked and the suggestion `сургуулийн` is offered.
   ☐ Click the suggestion: the text changes. ☐ Type a word you know is correct but unusual, choose *add to dictionary* («Тольд нэмэх»); it is no longer marked.
5. **Personal dictionary persists.** ☐ Close the app completely and open it again: the word is still accepted. ☐ Remove it («Хасах»): it is marked again.
6. **Activate.** ☐ Enter your licence code. ☐ The app shows it is active and when it ends. ☐ The licence page shows this computer.
7. **Things that should fail politely** (a clear Mongolian message, no technical text, the app stays locked or limited):
   ☐ a made-up code. ☐ an **expired** licence (the operator must prepare one). ☐ a code already active on another computer (you are told how to move it).
   ☐ **no internet** during activation. ☐ no internet *after* activating: it keeps working and shows offline mode; it must stop only after about 24 hours offline.
8. **Real payment (only when the operator says real merchant credentials are configured).** ☐ Buy the shortest term. ☐ The invoice amount equals the price on the page.
   ☐ After paying in your bank app the page moves to *paid* by itself. ☐ Your licence code appears **once**. ☐ No second licence exists. ☐ If you refresh or the callback repeats, nothing changes.
   *Until real credentials exist this step cannot be done, and nothing in this document counts as having done it.*
9. **Uninstall.** ☐ Windows Settings → Apps → TORE Spell → Uninstall. ☐ The program is gone.
   ☐ Your licence and personal dictionary are **kept** in `%APPDATA%\TORE Spell` on purpose (they come back if you reinstall). ☐ Reinstalling does not require a new licence code, only re-activation if the app asks.

## 5. Automated evidence versus what still needs a human or a real service

| Needs | Cannot be replaced by |
|---|---|
| A person on a real Windows 10 *and* 11 machine (§4: SmartScreen, IME typing of Ө/Ү, scaling, offline, uninstall) | CI headless self-test |
| Real QPay merchant account + small real payment | the simulator |
| Real S3 bucket + object upload + a signed-URL download of the real file | mocked storage tests |
| A code-signing certificate and a rebuilt, measured-signed installer | nothing — the beta is unsigned until then |
| Operator recomputing the hash of the downloaded file | the CI log |
| A tag push to exercise the draft-release job | structural tests of the workflow |
