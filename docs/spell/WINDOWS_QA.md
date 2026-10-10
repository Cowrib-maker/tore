# TORE Spell Beta — Windows QA

Legend: **CI** = performed automatically by `.github/workflows/spell-desktop-windows.yml` on `windows-latest` · **MANUAL** = a person on a real Windows PC must do it · status column records what has **actually** been done. No row is marked done unless it ran.

| # | Check | Where | Status |
|---|---|---|---|
| 1 | `npm ci` (root + desktop), desktop typecheck, spell + desktop unit tests | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09) |
| 2 | NSIS x64 installer builds (`dist:win`, production config) | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09). (It cannot be built on Linux: NSIS needs Windows/wine — verified failing in the authoring sandbox.) |
| 3 | Installer exists and is ≥ 50 MB; SHA-256 recorded | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09): `TORE-Spell-Setup.exe`, 111,335,763 bytes, SHA-256 `C648B7ED…C29A` (from the CI log; the file itself was not re-hashed outside CI) |
| 4 | Silent install (`/S /D=…`) exit code 0, `TORE Spell.exe` present | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09) |
| 5 | Installed app starts and passes `--selftest` (config + pinned key loads, crypto verify/tamper/foreign-key rejection, license client initialises, engine, personal dictionary persistence, DPAPI round-trip, Mongolian UI renders) | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09): crypto verify (valid / tamper rejected / foreign key rejected), licence client refuses without pinned keys, OS secret storage round-trip (DPAPI), engine runs, personal dictionary persists and removes, Mongolian UI loads with the «Идэвхжээгүй» badge. |
| 6 | Silent uninstall removes the executable | CI | **PASSED in CI** — `spell-desktop-windows` run #8, commit `f7b74ac`, `windows-latest` (2026-10-09) |
| 7 | SmartScreen dialog appears for the unsigned installer; "More info → Run anyway" works | MANUAL | NOT DONE |
| 8 | Activation with a real beta license code against `https://www.tore.mn` (requires the production signing key to be installed server-side) | MANUAL | NOT DONE — blocked on server key |
| 9 | Spell check of ordinary text; suggestion → «Солих»; «Үл тоох»; «Үргэлж үл тоох»; «Тольд нэмэх» / «Хасах» | MANUAL | Passed in Electron/Linux smoke test; Windows NOT DONE |
| 10 | Mongolian typing through the Windows IME (Cyrillic, Ө/Ү), paste from Word | MANUAL | NOT DONE |
| 11 | Offline: disconnect network → app keeps working until the token limit; "Офлайн горим" badge | MANUAL | Logic covered by unit tests; UI NOT DONE on Windows |
| 12 | Expired license screen («Хугацаа дууссан», no auto-renew) | MANUAL | Unit-tested; UI NOT DONE on Windows |
| 13 | Transfer: activate on PC B → confirmation text → PC A locks after its next online validation | MANUAL | Unit/integration-tested against real server logic; two-PC run NOT DONE |
| 14 | Upgrade install over an existing install keeps license + personal dictionary | MANUAL | NOT DONE (data lives in `%APPDATA%\TORE Spell`, uninstall keeps it by design) |
| 15 | High-DPI / 125–150 % scaling, dark mode | MANUAL | NOT DONE |

Rows 7–15 are the human acceptance test: follow `CONTROLLED-BETA.md` §4.

## Known behaviours to expect
* Unsigned installer → SmartScreen warning (see release notes).
* If `%APPDATA%\TORE Spell\license.json` is deleted, the computer must be re-activated; the server will ask for a transfer confirmation from the previous installation of the same PC.
* No auto-update: install a newer installer over the old one.
