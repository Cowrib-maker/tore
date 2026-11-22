# Migration history reconciliation (Production vs Preview)

Status (recorded 2026-11-22 on branch `integration/reconcile-20261121`):

- **Repository preparation is still uncommitted** (this note, the two restored migration files and the `.gitattributes` rule).
- **Disposable PostgreSQL rehearsal: completed** (section 6). It used a local PostgreSQL 18.7 and Prisma CLI 7.9.1 only.
- **Preview migration reconciliation: completed successfully on 2026-11-22** (section 7). `tore_preview` now has all 42 migrations.
- **Production has not been accessed or modified** by any of this work. Statements about Production below come from the earlier
  report of its migration history, not from a read of the Production database.

## 1. History differences between the two Neon databases

| Migration | Production (`tore` / `neondb`), as reported | Preview (`tore-staging` / `tore_preview`) | In this repo |
|---|---|---|---|
| `20261003000000_student_learning_progress` | applied | **applied 2026-11-22** (was not applied) | added unchanged (this change) |
| `20261003120000_student_lawyer_exam` | applied | **applied 2026-11-22** (was not applied) | added unchanged (this change) |
| `20261115040000_add_student_attempts` | **not applied** (still pending) | applied | already present |
| `20260830133000_ai_conversation_documents_multi_format` | applied (checksum `133e9ebf…`) | applied (checksum `de8e57f0…`) | present; see section 3 |

The two 20261003 migrations were applied to production from feature work (`feat/marketplace-consultation-flow`,
`preview/lawyer-workspace-20261028`) that never reached `main`. Until this change `student_learning_progress` existed only as an
untracked file in the `tore-marketplace-flow` worktree and in backup ref `refs/backup/20261121/marketplace-flow` (`9739eb1`).
`student_lawyer_exam` was committed in `13dcfde`.

Files added here are byte-identical copies (LF, no edits, no rename, original timestamps):

| File | Bytes | SHA-256 (first 16) |
|---|---|---|
| `20261003000000_student_learning_progress/migration.sql` | 1237 | `cc292e7eb550590c` |
| `20261003120000_student_lawyer_exam/migration.sql` | 6265 | `fc3d66cc27cabdaa` |

Dependencies and ordering:

- The 20261003 migrations sort before `20261005120000_spell_licensing_foundation` and before `20261115040000_add_student_attempts`.
  They depend only on `users` and on their own tables, not on any Spell or `student_attempts` object, and `add_student_attempts`
  depends only on `guest_sessions`.

## 2. `20261115040000_add_student_attempts`: two valid hashes of one SQL

The SQL was not changed. The Preview run was made from a Windows checkout (`core.autocrlf=true`), so the file was hashed as CRLF.

| Source | Bytes | Line endings | SHA-256 (first 16) |
|---|---|---|---|
| Preview `_prisma_migrations` (prefix `48a4eb72`) = Windows working copy | 857 | CRLF | `48a4eb72071a61ca` |
| Git blob (`HEAD`) | 835 | LF | `582eea984642018c` |

After this change `.gitattributes` makes new checkouts write LF, so they hash to `582eea98…`. The existing Windows working copy keeps its
CRLF bytes until it is re-checked-out.

## 3. `20260830133000_ai_conversation_documents_multi_format`: equivalent hashes

Introduced by commit `40841c2e51a629b406fcde5454bc8ceaa41e105c` (2026-08-31), an ancestor of `origin/main`. Only one SQL content exists.

| Version | Bytes | Line endings | SHA-256 (first 16) | Database |
|---|---|---|---|---|
| Git blob | 379 | LF | `133e9ebff1f47810` | Production |
| Windows working copies | 387 | CRLF (8 lines) | `de8e57f04ba09873` | Preview |

LF-normalised, both are `133e9ebff1f47810`. There is no SQL difference.

Five migrations differ between CRLF and LF bytes (CRLF prefix on Preview, LF prefix): `20260830133000_ai_conversation_documents_multi_format`
(`de8e57f0` / `133e9ebf`), `20261005120000_spell_licensing_foundation` (`736d08a9` / `c1506d23`),
`20261006120000_spell_purchase_fields` (`9e1d2a3a` / `5f520fa3`), `20261008120000_spell_feedback` (`ceb72801` / `2f11c4c5`) and
`20261115040000_add_student_attempts` (`48a4eb72` / `582eea98`). The Production values for the Spell migrations have not been read.

## 4. Why applied-migration checksums must not be rewritten

- Prisma stores a SHA-256 of `migration.sql` in `_prisma_migrations` when a migration is applied. It is a historical record of what was run.
  In the rehearsal the recorded checksum equalled the SHA-256 of the raw file bytes for all 42 migrations.
- The differences above are line endings only. Editing a migration file or updating a checksum row to "make them match" gains nothing,
  and risks real damage: a changed file no longer matches the history, and a hand-edited `_prisma_migrations` row can hide a genuine
  divergence later.
- Never rename or reorder an applied migration. `migrate deploy` would try to re-run it ("already exists") or record a failure.
- **Prisma 7.9.1 did not warn about line-ending differences in the tested scenarios** (section 6): `migrate deploy` and `migrate status`
  exited 0 and printed no warning or error when the migrations folder differed from the applied bytes (LF over CRLF-applied, and CRLF over
  LF-applied for `deploy`). Do not rely on Prisma to detect them. Whether `migrate dev` or `migrate diff` reacts was not tested.
- Both historical hashes are recorded here instead, so neither database needs to change.

## 5. Line-ending hardening

`.gitattributes` now contains `prisma/migrations/**/migration.sql text eol=lf`. It affects how files are written on checkout and
normalised on commit; blobs already in history are untouched. Existing working copies are not rewritten by this change.

## 6. Disposable PostgreSQL rehearsal (local only; NOT evidence about Production)

Environment: Prisma CLI 7.9.1 (schema engine `e922089b7d7502aff4249d5da3420f6fa55fc6ad`), PostgreSQL 18.7 on `127.0.0.1:55441`
(a disposable embedded instance). Every scenario used a fresh database, a scratch Prisma config that does not load `.env*`, and a copy of
the migrations folder outside the repository. No remote connection was observed. These are results from a disposable database; they
show how Prisma 7.9.1 behaves, not what is in Production.

| Scenario | Result |
|---|---|
| All 42 migrations on an empty database | Applied in folder order; 42 rows, all finished; 77 tables. |
| Preview-like: 40 applied, then the two 20261003 migrations restored | `migrate deploy` applied exactly `20261003000000_student_learning_progress` then `20261003120000_student_lawyer_exam`, after the already-applied later migrations (out-of-order application **succeeded**); final schema identical to the in-order result. |
| Production-like: 41 applied, then `add_student_attempts` | `migrate deploy` applied exactly that one migration (disposable environment only; recorded checksum `582eea98` from LF bytes); final schema identical. |
| Second `migrate deploy` | Applied nothing ("No pending migrations to apply"); history unchanged. |
| Failure sequence | See below. |
| CRLF vs LF checksums | See below. |
| Schema drift (`migrate diff`, database to `schema.prisma`) | 22 statements: drop 6 foreign keys, 7 tables and 4 enums of the 20261003 migrations, plus the 5 known `legal_knowledge_*_trgm_idx` indexes. Nothing for `student_attempts`. |

Failure sequence (a conflicting `student_quiz_best` table was pre-created, so the second statement of the first 20261003 migration failed):

- The first `migrate deploy` failed with **P3018** (database error `42P07`, relation already exists).
- **Migration SQL is not automatically rolled back.** The earlier successful `CREATE TABLE student_lesson_progress` **remained** in the
  database. Partial objects can be left behind by a failed migration.
- The `_prisma_migrations` row was recorded as not finished and not rolled back, `applied_steps_count` 0, with the error text in `logs`.
- The next `migrate deploy` was blocked with **P3009** and applied nothing.
- No `migrate resolve` or other recovery was attempted; the disposable database was discarded.

CRLF/LF checksum behaviour (Prisma 7.9.1, tested):

- Deploying the LF folder over a database applied from CRLF bytes: exit 0, "No pending migrations to apply", **no warning**, recorded
  checksums unchanged. `migrate status` reported "Database schema is up to date!" with no warning.
- Deploying the CRLF folder over an LF-applied database: exit 0, "No pending migrations to apply", no warning observed.

## 7. Preview migration reconciliation (executed 2026-11-22; live evidence)

Target: Neon project `tore-staging`, branch `preview`, database `tore_preview`, role `neondb_owner`, direct endpoint, PostgreSQL 18.7.

- **Restore point** (Neon snapshot of the Preview branch taken before the migration): id `snap-twilight-shape-axzcowut`, name
  `pre-20261003-migrations-preview-20261122`, created `2026-11-22T12:07:42Z`, no expiry.
- **Pre-checks (read-only):** 40 migration rows, all finished, none failed, rolled back or duplicated; every recorded checksum matched the
  repository; the 7 target tables and 4 target enums were absent; `migrate status` listed exactly the two target migrations as pending.
- **Execution:** `prisma migrate deploy` was run once (started 2026-11-22T12:10:37Z, exit 0) from an LF-normalised copy of the migrations
  folder with a scratch Prisma config. Exactly two migrations were applied, in this order, both finished with 1 step and no logs:
  - `20261003000000_student_learning_progress`, checksum prefix `cc292e7eb550590c`
  - `20261003120000_student_lawyer_exam`, checksum prefix `fc3d66cc27cabdaa`
- **Result:** Preview now has **42 finished migrations (was 40), with zero failed, unfinished or rolled-back rows.** The 40 earlier rows
  are unchanged, including their CRLF-derived checksums.
- **Objects verified (read-only):** all 7 tables (`student_lesson_progress`, `student_quiz_best`, `student_exam_problems`,
  `student_exam_problem_keys`, `student_exam_attempts`, `student_exam_attempt_items`, `student_court_decisions`); all 4 enums
  (`StudentExamArea`, `StudentExamReviewStatus`, `StudentExamAttemptMode`, `StudentExamAttemptStatus`) with the labels the migration
  defines; 7 primary keys; 17 indexes (10 secondary, including the two partial unique indexes, plus the 7 primary-key indexes);
  6 foreign keys (targets and `ON DELETE` actions as defined); 4 CHECK constraints.
- **Existing schema intact:** every pre-existing table, enum, column, index, constraint and trigger is unchanged (including
  `student_attempts`), and the resulting schema is identical to the rehearsal result. ACLs of existing tables are unchanged.

Runtime permissions:

- `tore_preview_runtime` still has no DDL privileges, and **no privileges on the newly created tables or enums.** No grants were made.
- Any future application use of these tables needs a separately approved permission review.

## 8. Remaining plan, NOT yet executed (each step needs separate explicit approval)

1. Commit this repository preparation and merge it through PR review (still uncommitted).
2. **Production read-only preflight (not done):** read the full `_prisma_migrations` list (name, checksum prefix, `finished_at`,
   `rolled_back_at`), confirm whether the Spell migrations (`20261005`, `20261006`, `20261008`) are applied, and confirm none of the
   `student_attempts` objects exist.
3. **Production:** only after step 2, take a Neon restore point, then apply only `20261115040000_add_student_attempts` (one additive table,
   one index, one foreign key to `guest_sessions`) with `migrate deploy` as the owner role on the direct endpoint from an LF checkout, as the
   Vercel build does not run migrations. **`add_student_attempts` has not been applied to Production, and Production has not been touched.**
   Because failed migrations are not rolled back (section 6), confirm beforehand that no target objects already exist.
4. Decide separately whether to add the Prisma models and application code for the 20261003 tables to this branch, and whether to grant
   `tore_preview_runtime` access to the new tables.

## 9. Schema drift warning

`prisma/schema.prisma` on this branch still does **not** define models for the seven 20261003 tables or the four enums (it does define
`StudentAttempt`). The migrations describe tables that this branch's Prisma client does not use, and the rehearsal showed that a
schema-diff proposes dropping them. Until this is resolved, **do not run `prisma migrate dev`, `prisma db push`, or any destructive
schema-diff operation (such as applying a `migrate diff` script) against Preview or Production.** Also never use `migrate reset`, or edit
`_prisma_migrations`, on either database.
