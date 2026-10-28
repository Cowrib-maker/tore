# TORE Spell — Phase 4 report (product hardening and polish)

Status: **INTERNAL ALPHA** (unchanged). Local development only. No production, QPay, secrets, feature-flag, deployment or `main` changes.
Windows is **not** verified (no Windows runner has executed). The 95% coverage target is **not** reached. Native-reviewed items: **0**.

Phase 3 commit `340341a` is untouched; Phase 4 is new commits on top of it.

## 1. What changed

| Area | Change | Evidence |
|---|---|---|
| Public page `/spell` | Rewritten short: title, one support line, Windows + «from» price (only when a server price exists), 4 benefits, price/buy, 4 steps (buy → install → code → use). Removed: UNKNOWN wording, «Бидний амлалт», beta-limitation lists, roadmap, relationship card, «найруулгын» claim. | `tests/unit/spell-product-page.test.ts` (6 tests); screenshots at 1280 px and 390 px inspected |
| Page example | The example word on the page was «сайнн», which the shipped engine does **not** flag (doubled final «н» is how loanwords are written, so it stays UNKNOWN). Replaced by «сургуулын → сургуулийн», and a test now fails if the shown example is not really flagged with that confident fix. | same test file |
| Desktop correction UX | Click (or arrow into) an underlined word → popover at the word: up to 3 corrections, **Үл тоох**, **Тольд нэмэх**, **Алдаа мэдээлэх**, Esc closes. Side list is one compact line per issue. Settings (unknown words, spacing/capital advisories, licence actions) and feedback export moved into collapsed menus. Check runs 350 ms after typing stops (was 900 ms + a manual button). | Playwright run against the real `DesktopSpellSession`, screenshot inspected |
| Underline bug | Underlines were declared as `border-bottom: wavy` (invalid CSS), so **no underline was ever drawn** in the desktop window. Now `text-decoration: underline wavy`. | screenshot before/after |
| Tests | `spell-phase4.test.ts` (33 tests): protected content (22 forms, also with unknown-reporting on), Latin look-alikes, 35k-char incremental equivalence and bound, personal dictionary, desktop identity (`appId`, `deleteAppDataOnUninstall:false`), renderer CSP and no `innerHTML`. | vitest |
| Tools | `scripts/spell-data/doc-scale-perf.ts`, `scripts/spell-data/soft-suggest-eval.ts` (research tooling, local data only). | below |

## 2. What did NOT change (deliberately)
- Language engine, morphology, vocabulary packs, error model, benchmark definitions, baselines: **unchanged**. No vocabulary was added: no lawful, verified source is available, and adding more AI-drafted words would only inflate the PROVISIONAL surface.
- Engine verdicts VALID / MISSPELLED / UNKNOWN are unchanged; UNKNOWN is only removed from marketing wording.
- Licence, purchase, QPay, Windows workflow, packaging code, release status.

## 3. Measured results

Language benchmark re-run on the frozen holdout (aggregates only; engine unchanged → identical to Phase 3):

| | Phase 2 frozen engine | Phase 3 / now |
|---|---|---|
| VALID share of word tokens | 89.12% | **89.98%** (89.88% excluding 1,412 structurally protected tokens) |
| UNKNOWN | 10.87% | **10.01%** |
| MISSPELLED | 143 tokens | 144 tokens (0.10%) |
| flagged-but-dictionary-accepts (FP candidates) | 0 | 0 |
| release-claim configuration (TRUSTED+REVIEWED only) | – | 33.34% |

**Correction:** earlier Phase 3 wording said «~8.4% UNKNOWN». That number is wrong for the holdout; 8.4% is the share of synthetic mutations that happen to be real words. UNKNOWN is 10.01%. Corrected in `BENCHMARK.md` and `PHASE-3-REPORT.md`.

Confident-suggestion precision (synthetic mutations of real words, shipping configuration; this phase, 3 independent runs): 99.1% (n=232), 99.6% (681/684), 99.4% (639/643). Pooled over the two large runs: **99.47%** (7 wrong of 1,327). Earlier phase runs gave 99.68% and 99.73%. So precision sits **at, not clearly above,** the 99.5% floor and varies by seed (±0.3 pp). Of the 7 wrong confident suggestions, 5 were vowel-harmony cases where the true word is not in the lexicon, so no rival could be found — a vocabulary gap, not a ranking bug.
Detection of synthetic typos in the shipping configuration is only **8%** overall (UNKNOWN 90%); top-1 7.8%, top-3 8.1%, MRR 0.08. With a broad local dictionary (research mode, never shipped) the same engine detects 55% at 98.8% top-1 of flagged. **The ceiling on typo detection is lexicon breadth, not the algorithm.**

Performance (clean process, `perf-v3.ts`, this container, machine dependent): warm 20k chars p50 12.1 ms / p95 14.1 ms; cold first window ≈263 ms; word p50 0.02 / p95 0.17 / p99 0.44 ms; cold start 52 ms; engine heap ≈5 MB.
Document scale, desktop path (`doc-scale-perf.ts`, real news text, ≈3,000 chars/page):

| size | first full check | edit one paragraph (p50 / max) | unchanged re-check |
|---|---|---|---|
| 1 paragraph (700 chars) | 56 ms | 1.8 / 7.1 ms | 0.0 ms |
| 1 page | 102 ms | 2.0 / 2.6 ms | 0.0 ms |
| 10 pages | 299 ms | 1.7 / 3.5 ms | 0.1 ms |
| 50 pages (150k chars) | 712 ms | 2.0 / 3.4 ms | 0.9 ms |

Typing costs ≈2 ms at any size (paragraph cache). A first check of a pasted 50-page document takes ≈0.7 s in the main process.

## 4. Ideas measured and rejected (not built)
- **Soft suggestions on UNKNOWN words** (show the unique edit-1 neighbour): on the dev slice, of UNKNOWN words with such a neighbour (3,243 types / 18,290 tokens), **78.4% of tokens are valid words** per the independent dictionary (залуус→залуу, түрүүнд→түрүүн, суугаа→руугаа). Would be a false accusation four times out of five. Rejected until the lexicon is broad.
- **Keyboard-neighbour substitution costs:** no real keyboard-slip ground truth exists (synthetic data would only confirm the assumption). Not built.
- **Bulk vocabulary / morphology growth:** no lawful verified source this phase; Phase 3 already exhausted measured-productive rules.

## 5. Security, privacy, licence, purchase — what was verified
- Existing tests re-run and passing: server-authoritative price (browser sends only a plan code), no built-in prices, one licence per verified payment (repeat/concurrent callbacks), no licence for unpaid/underpaid, owner-only status and code reveal (others get 404), audit event fails closed, admin-only operations, code stored as hash + ciphertext, expiry without auto-renew, transfer rules.
- Desktop package: built in release mode, packed to an asar, package verifier passes (no forbidden content; production origin and pinned **public** key present). Renderer CSP is `default-src 'none'`; renderer uses `textContent` only; no remote scripts. Checked by tests.
- Privacy: checking is local; the licence client sends licence/installation data only; the feedback file stores one word + verdict and is exported manually by the user. There is no telemetry or analytics in the desktop app, and none was added.
- Not verified: tamper resistance beyond what exists; online validation behaviour on a real Windows machine; production QPay; installer hosting.

## 6. Update boundary (documented, not invented)
User data lives in the OS user-data directory (`userData`): licence state (DPAPI-protected), personal dictionary, settings. The installer has a stable `appId` (`mn.tore.spell`), `productName`, and `deleteAppDataOnUninstall: false`, so an in-place update or a reinstall keeps activation and the dictionary (covered by persistence tests on real files). **No auto-update mechanism exists yet**; adding one must use electron-builder/`electron-updater` with signed artifacts and must not touch `userData`. That requires a signing certificate and an update host, neither of which exist; nothing was invented.

## 7. Native review
Infrastructure exists (Phase 3): item schema, append-only decisions, ≥2 distinct native reviewers for NATIVE_REVIEWED, TSV export/import. Native-reviewed items: **0**. Known gap: the lemma review sheet records lemma, POS, flags, domain and kind, but **not a reviewer's list of valid and invalid inflected forms**; that needs a schema addition before a linguist can sign off a paradigm. MODEL_ADJUDICATED data is never described as native-reviewed.

## 8. Remaining blockers
1. Native review of the 5,197 PROVISIONAL lemmas, the morphology rules and the gold sets.
2. Lexicon breadth: no lawful broad lexicon; typo detection is 8% in the shipping configuration.
3. Coverage 89.98% VALID vs the 95% target; release-claim coverage 33.34%.
4. Windows installer unverified (GitHub-hosted Windows runners fail before any step).
5. Production configuration (prices, QPay, installer hosting, signing certificate, update host), Spell flag still OFF.
6. Repo-wide lint has unrelated pre-existing errors (not touched).

## 9. Release status
**INTERNAL ALPHA.** Not a beta, not production-ready, not «native-grade».
