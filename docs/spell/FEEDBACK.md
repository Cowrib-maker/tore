# TORE Spell — user feedback pipeline

Purpose: let licensed users report real-world problems so the language engine can be improved **through review**, never directly.

```
user report → PENDING → admin/engineer review → (NEEDS_NATIVE_REVIEW) → ACCEPTED | REJECTED | DUPLICATE
                                                        ↓
                        a SEPARATE, reviewed, tested change to language data (and native validation when it is a linguistic claim)
```

## The three layers (never merged)
| layer | role |
|---|---|
| user feedback | a real-world **signal**: how many different people hit this |
| native review | linguistic **authority** (`NATIVE-REVIEW.md`) |
| the engine | **implementation** |

A report never becomes TRUSTED, REVIEWED, NATIVE_REVIEWED or release-grade by itself, and nothing in the feedback code touches lexicon packs, gold sets or data tiers (a test scans the source for that). A high number of distinct reporters raises **review priority** only.

## What users can report (desktop: popover → «Алдаа мэдээлэх», or sidebar → «Санал илгээх»)
| option | type |
|---|---|
| Энэ үг буруу гэж танигдсан | `WRONG_CORRECTION` (engine accused a word the user believes is right) |
| Санал болгосон засвар буруу | `WRONG_SUGGESTION` (+ optional correct form) |
| Алдаа илрээгүй | `MISSING_ERROR` (+ the correct form, required) |
| Шинэ үг санал болгох | `MISSING_WORD` |
| Бусад | `GENERAL` (a note, no word) |

## Privacy
A report holds **one word**, the engine's suggestion / reason code / engine and data versions, the user's suggested form and an optional note of ≤ 200 characters. No document text, no surrounding sentence, no personal dictionary, no file names. (A «short context» field was deliberately **not** built in V1.) Reports are written to a local outbox first (`feedback-outbox.json` in the user-data directory) and sent signed by the installation; offline reports wait. The server accepts reports only from an **ACTIVE** activation of a live licence.

## Server
* `POST /api/spell/v1/feedback` — device-signed (same scheme as validation: proof of possession, nonce, clock window), strict body (a request carrying `status`, `userId` or any extra field is refused), rate limits (IP and 50 reports / user / day). Always stored `PENDING`.
* `POST /api/spell/v1/contributions` — the caller's own counts.
* `GET /api/spell/admin/feedback[?status=…&format=review-tsv]` — admin only; groups of identical reports with the number of **distinct** users (one user repeating counts once). `review-tsv` exports a native-review sheet (provenance AUTOMATIC).
* `POST /api/spell/admin/feedback/review` — admin only, same-origin, decision `ACCEPT | REJECT | DUPLICATE | NEEDS_NATIVE_REVIEW` + a mandatory reason, applied to the whole group; ACCEPTED / REJECTED / DUPLICATE are final; NEEDS_NATIVE_REVIEW stays open. A new report in an already-reviewed group starts PENDING again.
* Admin view: `/admin/spell/feedback`.
* Table `spell_feedback` (migration `20261008120000_spell_feedback`, additive). Admin grouping reads at most the newest 5,000 rows of a filter and says when it truncated.

## Contribution accounting (no money, no promises)
`submitted` (distinct reports; informational), `accepted` (distinct reports a reviewer accepted — **the only credit**), `rejected`, `pending`. Computed from the rows, so there is no counter to drift or inflate. The app shows «Хүлээн авсан санал: N» only when N > 0. Contributor levels / badges / leaderboards are not built; the data needed (accepted counts) exists if they are ever wanted.

## Not built / requires people
* Acting on an accepted report (a lexicon change) is manual and needs tests; linguistic claims need native review (**REQUIRES NATIVE REVIEW**).
* No spam classifier beyond the caps; no reporter reputation.
