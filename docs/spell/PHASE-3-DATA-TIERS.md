# Data tiers and what a «release-quality claim» may use (Phase 3)

| Tier | Meaning | Today |
|---|---|---|
| REVIEWED | ≥2 distinct NATIVE reviewers approved it through the review pipeline (`vocab-reviewed/lemmas.tsv`, verified against `gold/native`) | 0 entries |
| TRUSTED | human-authored, committed to the repository's production dictionaries BEFORE the language-engine work (`CORE_DICTIONARY_WORDS`, `legal-lexicon`) — git-verifiable. Engineer-vetted, **not native-validated** | 411 entries |
| PROVISIONAL | AI-drafted or rule-generated from provisional data. The engine uses it; claims may not | ~9,200 entries + ~2,400 rule-generated |
| REJECTED | reviewed and refused; never loaded | 0 |

Two engine configurations are always reported side by side:
* `createSpellEngineV1()` — product configuration (all tiers except REJECTED);
* `createSpellEngineV1({ minTier: "TRUSTED" })` — **RELEASE-CLAIM** configuration (TRUSTED + REVIEWED only).

Phase-3 start (2026-10-08): the product configuration reaches ≈89% VALID on news; the release-claim configuration reaches **≈33%**. The
difference is vocabulary nobody has verified. Closing it needs native review of the lemma queue (`gold/model/P_LEMMAS_PROVISIONAL.json`),
not more engineering. Rules (morphology) are not tiered: they are code, tested, and listed in `MORPHOLOGY-RULES-P2.md`; they are still pending native review.
