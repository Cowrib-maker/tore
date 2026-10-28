# TORE Spell — updates (V1 = manual, signed notice)

**Status: manual update architecture — VERIFIED by tests; automatic update — NOT BUILT, REQUIRES PRODUCTION CONFIGURATION** (an installer host, a code-signing certificate, a rollback plan).

## What exists
1. **Versioning.** Product version in `desktop/package.json` (semantic: `1.0.0-rc.1` → `1.0.0` → `1.0.1`, `1.1.0`). A pre-release sorts before its release. The engine and data versions travel with every feedback report (`SPELL_ENGINE_VERSION`, data-pack version) and travel with every feedback report, so a behaviour change is traceable.
2. **Signed release notice.** `GET /api/spell/v1/updates/latest` returns `{ available:false }` until the server is configured with `SPELL_RELEASE_VERSION` + `SPELL_WINDOWS_INSTALLER_URL` (https) + `SPELL_WINDOWS_INSTALLER_SHA256` (and optionally `SPELL_WINDOWS_INSTALLER_SIZE`, `SPELL_MIN_SUPPORTED_VERSION`). Otherwise it returns a **JWT signed with the existing Spell Ed25519 key** (`typ tore-spell-release+jwt`, valid 7 days). No URL or hash is ever invented.
3. **Desktop check.** At start and daily the app verifies the notice against the **public keys compiled into it**, compares versions, and — only if newer — shows «Шинэ хувилбар x.y.z бэлэн» with a button that opens the licence page in the browser. Unsigned, expired, wrong-type, unknown-key, malformed, offline, same or older (no downgrades) → silent. **The app never downloads, writes or runs an installer.**
4. **User data survives.** Licence + device key, personal dictionary and the feedback outbox live in the OS user-data directory (`app.getPath("userData")`), not beside the binaries. The installer keeps `appId mn.tore.spell`, `productName`, `deleteAppDataOnUninstall: false`. Tests: `spell-phase4`, `spell-security-phase7`, `spell-desktop-persistence`.

## What must exist before automatic update
Signed installer (certificate) · permanent https host with the SHA-256 · download + hash verification + signature verification before launch · rollback to the previous version · staged rollout. Do not add a second update system: extend this one (electron-updater is the intended base, with the signed notice as its feed).

_Settings:_ the app has no persisted settings yet (the two display toggles reset on restart). When settings are added they must be stored in the same user-data directory.
