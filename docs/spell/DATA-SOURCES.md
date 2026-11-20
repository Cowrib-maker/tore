# TORE Spell — Language data sources (research record)

Status: **research recorded 2026-10-06** · scope: private development · supersedes nothing — `LANGUAGE_DATA_SOURCES.md` (2026-10-05) remains the *shipping* licensing decision; this document is the wider research register behind it.

Rules of this register
1. **Source-code licence ≠ data licence.** A permissive licence on a repository says nothing about its word lists or texts.
2. **No licence statement = all rights reserved.** Such data is at best research/benchmark input, never bundled.
3. **Every row says how we know.** `VERIFIED` = we read the licence text from the source. `UNSTATED` = the source has none. `AMBIGUOUS` = contradictory terms. `UNVERIFIED` = we could not reach the source from the build environment (outbound access in this environment is limited to GitHub raw files, npm and PyPI); the row then records only what public descriptions claim and must be re-checked before any decision rests on it.
4. Anything that cannot legally ship is **not bundled**. The desktop package verifier (`desktop/scripts/verify-package.mjs`) and the pack loader enforce this mechanically (see "Mechanical separation").

## The four classes (never mixed silently)

| Class | Meaning | May ship in the commercial product | Where it lives |
|---|---|---|---|
| **A — TORE_OWNED** | Created by TORE (authored lexicon, TORE UI text, TORE-built morphology tables, error-model data) | Yes | `src/spell-engine/data/` and `dist/spell-pack/` |
| **B — EXTERNAL_LICENSED** | Third-party data whose licence permits commercial redistribution **and** whose conditions we meet (attribution etc.) | Yes, with attribution | none yet |
| **C — RESEARCH_ONLY** | Used locally to design/validate algorithms or give the *private developer build* broad coverage | **No** | `.spell-research/` (git-ignored) |
| **D — BENCHMARK_ONLY** | Used only to measure | **No** | `.spell-research/` (git-ignored) |

Today class B is empty. Class C/D material is fetched on demand by `npx tsx scripts/spell-data/fetch-research.ts`, which records URL, SHA-256 and licence status in `.spell-research/manifest.json`.

## Register

### Verified from the source (reachable)

| Resource | URL | Licence (as found) | Commercial use | Redistribution | Derived data | Attribution | Bundle? | Class | Intended use |
|---|---|---|---|---|---|---|---|---|---|
| **dict-mn** (Hunspell, B. Dorjgotov; LibreOffice `mn_MN` mirror) | github.com/bataak/dict-mn · github.com/LibreOffice/dictionaries/tree/master/mn_MN | README_mn_MN.txt says *«Өөрчлөн тараахыг хориглоно. Зохиогчийн эрх хуулиар хамгаалагдсан»* (do not redistribute modified copies; copyright reserved) **and** carries an LPPL 1.3 notice. **Self-contradictory → AMBIGUOUS.** npm `dictionary-mn` declares LPPL-1.3c; `@cspell/dict-mn-mn` declares MIT for a derivative word list. | Unclear | Treated as **no** | Unclear | Required | **NO** | C | Local second-opinion oracle (broad validity + absence evidence) for audits and the private developer build. **Action: ask the author for a written commercial licence.** |
| **UniMorph khk** | github.com/unimorph/khk | CC BY-SA 3.0 (per project; licence file not retrievable by raw URL) | Yes | Yes, share-alike | Share-alike would bind our pack | Required | NO | D | Morphology acceptance oracle only |
| **tugstugi/mongolian-nlp datasets** (index of Mongolian NLP resources) | github.com/tugstugi/mongolian-nlp | **No LICENSE file** (raw `LICENSE`, `LICENSE.md` → 404). **UNSTATED.** | Unclear | Unclear | Unclear | Unclear | NO | D | See rows below |
| ↳ **Eduge** news corpus (75,662 articles, ~320 MB; credited to Bolorsoft LLC) | `…/datasets/eduge.csv.gz` | Unstated; commercial owner credited | Unclear | Unclear | Unclear | Unclear | NO | D | Real-text clean false-positive benchmark; coverage-gap analysis. Contains genuine typos → flags are adjudicated, never assumed errors |
| ↳ personal / clan / company names (opendata.burtgel.gov.mn) | `…/datasets/mongolian_*_names.csv.gz` | Unstated here; source portal terms not reachable | Unclear | Unclear | Unclear | Unclear | NO | D | Protected-name benchmark (does the engine accuse real names?) |
| ↳ abbreviations (500), districts, countries | `…/datasets/*.csv` | Unstated | Unclear | Unclear | Unclear | Unclear | NO | D | Protected-token benchmark |
| ↳ 250 most frequent words | `…/datasets/most_frequent_words.csv` | Unstated | Unclear | Unclear | Unclear | Unclear | NO | D | Sanity check that function words are VALID |

The same index lists, without us having been able to inspect them: Mongolian WordNet (kbatsuren/monwn, NUM), MorphyNet derivational morphology (kbatsuren/MorphyNet), a 670 M-word "dirty" news corpus and 5-gram LM, CC-100 Mongolian, the NUM POS dataset (100 k words, PanL10n/CRLP), mongolian-bert / ALBERT / GPT-2 models. **None of these is used.** WordNet and MorphyNet are the first to chase for licences (both are small, annotated, linguistically clean and could become class B).

### Not reachable from this environment — **UNVERIFIED**

| Resource | Public description | Likely class | Next step |
|---|---|---|---|
| Mongolian Corpus (mongoliancorpus.org) | Academic corpus site | C/D | Read terms of use; ask for a research/commercial statement |
| NUM Mongolian written corpus / CRLP POS data | National University of Mongolia research data | D | Written permission |
| UD Mongolian-MG treebank, MonTree (UD) | Annotated text, CC BY-SA (UD default) | D | Fetch from universaldependencies.org when reachable; share-alike → benchmark only |
| Mongolian Wikipedia dump | CC BY-SA 4.0 text | D | Share-alike text; word-frequency *statistics* may be defensible but needs legal review |
| CC-100 / OSCAR / Common Crawl Mongolian | Web text; compilation licences differ from the underlying copyright | D | Legal review before any derived frequency list is bundled |
| legalinfo.mn legislation | Statutes/regulations are generally not copyrightable subject matter in Mongolian law (**verify with counsel**) | A or B for the LEGAL pack | Best lawful source for the legal lexicon; TORE already has an ingestion adapter and 5 fixtures (`tests/fixtures/legalinfo-*.html`) |
| Government/ministry public documents, toli.gov.mn «Зөв бичих дүрэм» (Dictionary of orthography) | State publications | A/B (grammar *rules* are facts, not expression) | Rules already implemented from the standard orthography; dictionary text itself is not copied |

## What each class is used for today

* **A (bundled):** `general.json`, `general-corpus.json` (TORE-authored text, 917 forms), `legal.json`, `proper-nouns.json`, `abbreviations.json`, `typo-pairs.json`, the morphology tables in `src/spell-engine/morphology/`.
* **C (local only):** dict-mn through the research lexicon provider (`src/spell-engine/research/`), loaded only when `TORE_SPELL_RESEARCH_DIR` is set and refused when `TORE_SPELL_ENV=production`.
* **D (measurement only):** Eduge, names, abbreviations, UniMorph — read by `scripts/spell-data/*` and `tests/evaluation/` runners from `.spell-research/`; absent in CI, where those suites skip themselves.

## Mechanical separation

* `PackProvenance.dataClass` is **required** in pack schema `tore-spell-pack/2`; `validatePack` rejects class C/D data in a pack.
* A research provider declares `redistributable: false`; the engine refuses to construct with one when `environment === "production"`.
* `desktop/scripts/verify-package.mjs` fails the Windows build if a packaged `app.asar` contains dict-mn markers, a research-provider module, or any pack whose `dataClass` is not A/B.
* `.spell-research/` and `dist/spell-pack/` are git-ignored.

## Legal follow-ups (owner action — nothing here is legal advice)

1. Written commercial licence from the dict-mn author, **or** keep it class C forever and build the lexicon from class A/B sources.
2. Licence statements from the tugstugi collection owner / Bolorsoft / state registry for Eduge and the names.
3. Counsel's opinion on Mongolian legislative texts as an LEGAL-pack source and on frequency statistics derived from CC BY-SA text.
4. Until 1–3 are resolved the shipping product's lexicon is class A only, and the benchmark honestly reports how much recall that costs.

## Phase 2 additions (2026-10-07)
Registry now lists 25 sources (6 VERIFIED_SHIPPABLE, all TORE-created). Searched, **not downloaded, not shipped**:
* Hunspell `mn_MN` (openmn): GPLv2 → cannot be bundled (local QA oracle only; already enforced by `verify-package`).
* Mongolian WordNet (monwn): reported CC BY-SA 4.0 — share-alike; counsel must rule on whether a spelling pack is a derivative. UNVERIFIED.
* Common Voice Mongolian sentences: CC0-1.0 per the dataset page, ~6,100 sentences (needs a Mozilla Data Collective login to fetch). Smallest but cleanest lawful corpus; UNVERIFIED until fetched and hashed.
* Tatoeba Mongolian: CC BY (per-sentence licence must be filtered; attribution). UNVERIFIED.
No external data entered a release pack in this phase; all new vocabulary is TORE-authored (AI-drafted, PENDING_NATIVE_REVIEW).
