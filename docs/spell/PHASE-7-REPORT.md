# TORE Spell — Phase 7 report (Windows V1 commercial flow, download, feedback, update foundation)

Status: **INTERNAL ALPHA.** Language metrics, vocabulary, engine and benchmarks are **unchanged** (no file under `src/spell-engine` except one new feedback→review bridge). Native-reviewed items: **0**. Windows installer: built by CI configuration only — **INFRASTRUCTURE BLOCKED** (every GitHub run on this branch, latest for 6bfdbef, ends in ≈3 s before any step). Nothing was deployed; production, QPay, secrets, flags untouched.

## Journey: what exists and how it is proven
| step | state | evidence |
|---|---|---|
| discover / understand / plan | VERIFIED | short `/spell` page (Phase 4); screenshots |
| price | VERIFIED (server-side only) | `spell-purchase` tests; page shows a «from» price only when configured |
| pay (QPay) | NOT VERIFIED — REQUIRES PRODUCTION CONFIGURATION | code + tests with a gateway stub; no QPay credentials exist |
| licence created, exactly one per payment | VERIFIED (tests) | UNIQUE invoice id; duplicate/concurrent callbacks tested |
| code revealed only to the owner | VERIFIED (tests) | `spell-owner-admin`, others get 404 |
| download | VERIFIED (logic) / REQUIRES PRODUCTION CONFIGURATION (the URL) | public CTA «Windows-д татах» appears only when `SPELL_WINDOWS_INSTALLER_URL` is a real https URL; it links to «Миний лиценз» and never contains the installer URL; `/api/spell/download` needs an ACTIVE licence; unset → «Windows суулгац удахгүй», no link (checked in a running dev server both ways) |
| install (NSIS `TORE-Spell-Setup.exe`) | NOT VERIFIED — INFRASTRUCTURE BLOCKED | workflow exists (build, SHA-256, verifier, silent install, `--selftest`, silent uninstall); never executed on Windows |
| activate one computer | VERIFIED (real server logic behind the real client, in tests) | second computer refused until explicit transfer; nothing moved silently |
| use offline, validate periodically | VERIFIED (tests) | usable at 23 h, validation required after 24 h; never silently extended |
| expiry | VERIFIED (tests) | «Таны TORE Spell-ийн эрх дууссан байна…» + [Шинэ эрх авах]; dictionary stays on disk; a NEW licence restores access |
| transfer | VERIFIED (tests) / web UI added | «Миний одоогийн компьютер», next transfer date, «Шилжүүлэх (чөлөөлөх)»; first transfer free, then 30-day cooldown (from policy) |
| report problems | VERIFIED (tests) | below |
| updates | manual notice VERIFIED; automatic NOT BUILT | below |

## Changes
* **Feedback pipeline** (`FEEDBACK.md`): 5 report types, desktop dialog «Юу буруу байна?», local outbox → signed request → `spell_feedback` (PENDING only), grouping by identical report with the **distinct-user** count, admin review (`/admin/spell/feedback`, API) with ACCEPT / REJECT / DUPLICATE / NEEDS_NATIVE_REVIEW and a mandatory reason, contribution counts (accepted = only credit). Reports never promote anything: a test scans the feedback code for any path to lexicon packs, gold sets or tiers, and another checks that accepting a report leaves engine verdicts unchanged. Exported review items from feedback are provenance AUTOMATIC, undecided; reporter count only raises priority.
* **Privacy:** one word + engine suggestion/reason/versions + user's form + ≤200-character note; no context, no document, no dictionary. The old local-export TSV was removed.
* **Update foundation** (`UPDATES.md`): signed release notice (existing Ed25519 key, 7-day lifetime), version comparison, desktop check that only informs; user data lives in the OS user-data directory. Desktop version set to `1.0.0-rc.1`.
* **Signing integration point:** the Windows workflow passes `CSC_LINK` / `CSC_KEY_PASSWORD` secrets to electron-builder and prints the real Authenticode status. **REQUIRES PRODUCTION SIGNING CERTIFICATE** — the installer is unsigned and must not be called signed.
* **Fixes found on the way:** the desktop textarea styles leaked into the report dialog (scoped to the editor); the earlier comment «add secrets and nothing else changes» was wrong (secrets must be mapped into the build step) — corrected.
* Migration `20261008120000_spell_feedback` (additive).

## Tests
3,218 / 3,218 pass (299 files) — 93 new this phase: `spell-feedback` (25), `spell-desktop-commercial` (14), `spell-security-phase7` (13), `spell-download` (8), plus updates to product-page/desktop-client tests. Typecheck (root + desktop) clean; Spell-scope lint 0 errors (32 warnings); production build passes (placeholder env); package verifier passes on a release-mode build.

## Performance (unchanged engine; this container)
word p50/p95/p99 0.02 / 0.19 / 0.45 ms · 20k warm p50 12.9 / p95 14.8 ms · 20k cold p50 26.3 / p95 53.5 ms · cold start ≈55 ms · 1 page 108 ms, 10 pages 303 ms, 50 pages 792 ms (first check) · edit one paragraph ≈2 ms. Baseline was 12.6/14.6, 26.4/47.4, 54 ms, 693 ms: within run-to-run noise except the 50-page first check (+14%, one run; not investigated, engine untouched).

## Language metrics (explicitly unchanged)
VALID 89.98% · UNKNOWN 10.01% · release-claim 33.34% · confident-suggestion precision 99.47% (AUTO synthetic) · synthetic detection ≈8% · native-reviewed 0 · TRUSTED 411 · PROVISIONAL ≈10.6k entries.

## Remaining blockers
INFRASTRUCTURE BLOCKED: a working Windows runner (installer build/install/selftest/uninstall never executed). REQUIRES PRODUCTION CONFIGURATION: prices, QPay, installer hosting URL + hash (+ release env vars), applying the feedback migration, Spell flag. REQUIRES PRODUCTION SIGNING CERTIFICATE. REQUIRES NATIVE REVIEW: all language claims; acting on accepted feedback. NOT BUILT: automatic update; persisted desktop settings; contributor levels; rate limiting beyond IP/user caps; interactive end-to-end test with real HTTP + database (the use cases and desktop client were tested together in-process; the HTTP routes and Prisma repository compile and are statically checked but were not exercised against a database).

## Release status
**INTERNAL ALPHA.** Not PRIVATE BETA: Windows installation, activation on a real machine, a signed installer, a hosted download and real payment are all unverified.
