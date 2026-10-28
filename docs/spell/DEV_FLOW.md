# TORE Spell — private development flow (Windows)

Scope: **private development only.** Nothing here touches production, QPay, the public site, or a public download. The result is a TORE Spell you can run and type Mongolian into on your own Windows computer.

There are two configurations. Know which one you are in — the app title and the data version say so.

| | Shipping configuration | Developer configuration |
|---|---|---|
| Lexicon | TORE-owned class-A packs only (≈1.6 k entries) | the same **plus** a local research dictionary (class C, not redistributable) |
| Licence gate | real licensing (activation against a server) | optional `TORE_SPELL_DEV_LICENSE=1` stand-in |
| Window title | `TORE Spell Бета` | `TORE Spell (dev + судалгааны толь, dev licence)` |
| Data version shown | `tore-general-seed@…` | `…+research:dict-mn` |
| Can be built into the installer | yes | **no** — dead-code-eliminated from release builds and rejected by `desktop/scripts/verify-package.mjs` |

## 0. One-time setup

```powershell
git clone <repo> ; cd tore
git checkout claude/tore-spell-foundation-lv0j6l
npm ci                      # root: engine, tests, research tooling (hunspell-asm is a devDependency)
cd desktop ; npm ci ; cd ..
```

### Research data (optional, local only — class C/D)
```powershell
npx tsx scripts/spell-data/pipeline.ts discover     # what exists, its class and licence status
npx tsx scripts/spell-data/pipeline.ts fetch        # downloads into .spell-research\ (git-ignored)
npx tsx scripts/spell-data/pipeline.ts frequency    # ~2 min: word frequencies from the local news corpus
```
`fetch` pulls dict-mn (licence **ambiguous**, see `DATA-SOURCES.md`) and a news corpus (licence **unstated**). They are used on your machine only: they are never committed, never bundled, never uploaded. Skip this step to stay on class-A data.

## 1. Spell Lab (fastest way to look at quality)

```powershell
npx tsx scripts/spell-lab.ts            # → http://127.0.0.1:4318  (loopback only)
```
Pick a sample (legal, government, business, news, informal, names, mixed, numbers, academic) or paste your own text. Three columns: **OLD** (legacy v0 engine), **NEW** (shipping V1), **RESEARCH** (V1 + local dictionary). Red = error, yellow = unknown (*not* an error). Text never leaves the process.

## 2. Desktop app on your PC

```powershell
cd desktop
$env:TORE_SPELL_ENV = "development"          # (default for `npm start`)
$env:TORE_SPELL_DEV_LICENSE = "1"            # deterministic stand-in licence: no server needed
$env:TORE_SPELL_RESEARCH_DIR  = "..\.spell-research\dict-mn"                  # optional broad lexicon
$env:TORE_SPELL_RESEARCH_FREQ = "..\.spell-research\derived\freq-eduge.tsv"   # optional (noisy-channel gate)
npm start
```
Without `TORE_SPELL_DEV_LICENSE` the app asks for a licence and talks to `http://localhost:3000` (or `TORE_SPELL_DEV_API_BASE`). To exercise the *real* licence path locally: start TORE.MN (`npm run dev` in the repo root with `TORE_SPELL_V1=1` and the keys from `.secrets\`), buy through the local QPay test double (`npx tsx scripts/qpay-mock-server.ts`, `docs/spell/DEPLOYMENT_CHECKLIST.md`), copy the code from **Миний лиценз**, and paste it into the app.

Typing loop to try: type a sentence with a slip (`маргаш`, `хуулын`, `хамтт`) → red underline → click it → suggestion → **Replace**; **Ignore** / **Ignore all**; **Add to dictionary**; search your dictionary in the *Миний толь* box; close the app and start it again — the words are still there.

## 3. Personal dictionary persistence

* Stored in `%APPDATA%\TORE Spell\dictionary.json` (Electron `userData`) — **not** in the install folder, so updates and reinstalls keep it (`deleteAppDataOnUninstall: false`).
* Atomic writes (temp file + rename) and a last-good copy `dictionary.json.bak`; a damaged main file falls back to the backup instead of wiping the list.
* Tests: `tests/unit/spell-desktop-persistence.test.ts` (restart survival, backup fallback, both-corrupt, search, ignore/add/remove).

## 4. Data pipeline commands

```powershell
npx tsx scripts/spell-data/pipeline.ts extract      # TORE-owned text → candidate forms (class A, evidence gate)
npx tsx scripts/spell-data/pipeline.ts build        # sources/*.tsv → packs → dist\spell-pack\ + manifest (A/B only; refuses C/D)
npx tsx scripts/spell-data/pipeline.ts audit --limit 3000 --research   # real-news audit vs second opinion
npx tsx scripts/spell-data/pipeline.ts synthetic --n 4000 --docs 3000  # seeded error injection on real text
npx tsx scripts/spell-data/pipeline.ts benchmark                       # full benchmark + gates
```
Language knowledge lives in `src/spell-engine/data/sources/*.tsv` (`overrides.tsv` holds audit-driven corrections). Generated JSON is never edited by hand.

## 5. Gates before any commit

```powershell
npx vitest run ; npx tsc --noEmit ; (cd desktop ; npx tsc -p tsconfig.json)
npx tsx scripts/spell-data/pipeline.ts benchmark
```
