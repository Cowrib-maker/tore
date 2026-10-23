# Lawyer-selection examination module: import and staging steps

Status: **implemented, not applied anywhere.** No database has been written to. Nothing below has been run against staging or production.

## What is imported

| Source | Becomes |
| --- | --- |
| `ЭРҮҮГИЙН ЭРХ ЗҮЙН БОДЛОГО.docx`, `Иргэний эрх зүйн бодлого.docx`, `ЗЭ бодлого.docx`, `ҮНДСЭН ХУУЛИЙН ЭРХ ЗҮЙН БОДЛОГО.docx` | `student_exam_problems` (public part) + `student_exam_problem_keys` (model answer, outline, citations, rubric) |
| `<N>-р бүлэг … .pdf` (Supreme Court decision extracts) | `student_court_decisions`: an **index** of the table of contents (date, case number, topic, page range). No decision text is stored and nothing is linked to a problem automatically. |

DOCX files carry no page numbers, so `source_locator.page` is `null`; the paragraph range in the extracted text is recorded instead.

## Dry run (no database)

```bash
npx tsx scripts/student-exam/import-docx.ts --dir "D:/Desktop" --pdf-dir "C:/Users/user/Downloads" --report import-report.json
```

Prints and writes: problems per file, how many need review, skipped blocks (with a text excerpt), flag counts, and for each PDF the parsed index entries next to the number of dotted-leader lines found (a difference is reported, not hidden).

Missing files are reported under `missingFiles`; nothing is fabricated. Expected names are listed in `SOURCES` in the script.

## Review rules

* `IMPORTED`: parsed cleanly. Visible to students with a "not legally reviewed" notice.
* `NEEDS_REVIEW`: structure uncertain (no answer marker, empty answer, no question marker, empty statement, duplicate number). **Hidden from students** until an admin decides at `/admin/student-problems`.
* Advisory flags that do not hide a problem but are shown to students: `POSSIBLY_OUTDATED_LAW`, `OCR_NOISE_SUSPECTED`, `MODEL_ANSWER_TRUNCATED_OR_SHORT`. `POSSIBLY_OUTDATED_LAW` is a heuristic (old abbreviations such as "ЭБШ" / "ЭХ-ийн", "Эрүүгийн хууль. 2002"); it is not a legal verification and every problem is shown as "not checked against the law in force".
* Nothing is silently dropped. A stray repeated heading (e.g. a "Жич:" note) is imported as its own hidden `NEEDS_REVIEW` record; a problem whose statement repeats but whose questions or answer differ is imported and flagged `DUPLICATE_STATEMENT`. Only a byte-for-byte duplicate (same statement, questions and answer) is left out, and it is listed under `skipped` in the report. The database applies the same rule (identical statement hash **and** content hash within an area).
* Re-running the import never overwrites a reviewer's decision. If the source text changed, the problem goes back to `NEEDS_REVIEW` with `SOURCE_CHANGED`.

## Source manifest (the four DOCX files as analysed on 2026-10-22)

| File | Records | Held back (NEEDS_REVIEW) |
| --- | --- | --- |
| Criminal | 15 | Бодлого-10 (marker present, no answer text), Бодлого-15 (no answer marker) |
| Civil | 15 | Бодлого 10 (no answer in the source) |
| Administrative | 15 | Бодлого-6 (no answer in the source), the stray repeated "Бодлого-11" note |
| Constitutional | 4 | none |
| **Total** | **49** | **5** (44 visible to students) |

Every non-empty line of the four files is present in exactly these records (headings are kept as labels). 0 records are left out as exact duplicates. The nine PDFs yield 48 table-of-contents entries (the chapter 10 PDF also lists 3 "Хуулийн тайлбар" sections that are reported, not indexed).

Reproduce without a database:

```bash
STUDENT_EXAM_SOURCE_DIR="D:/Desktop" STUDENT_EXAM_PDF_DIR="C:/Users/user/Downloads" npx vitest run tests/unit/student-exam-real-sources.test.ts
```

## Applying to a disposable or staging database (operator steps)

**Order matters.** Run the real-database tests (step 3) on the EMPTY migrated database, before importing the real problems (step 4): the exam test draws its random exams from every visible problem in the database, so imported real problems could be drawn instead of the test's own and make its assertions fail. Use one dedicated database for steps 1-5 and delete it afterwards.

1. **You create** an empty database on a PostgreSQL you own, with a name the test guard accepts: `tore_student_progress_test` or `tore_student_progress_test_<suffix>` (letters/digits only after the underscore). Example: `createdb tore_student_progress_test_acc1`. The URL host must be exactly `localhost`, `127.0.0.1` or `::1`. The test refuses anything else, and "local" alone is never treated as proof that a database is disposable. Never reuse a database that holds real data.
2. Apply the migrations to that database only (the two Student ones are `20261003000000_student_learning_progress` and `20261003120000_student_lawyer_exam`; both are additive and sort before the Spell migrations):
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/tore_student_progress_test_acc1" npx prisma migrate deploy
   ```
   (`prisma.config.ts` also refuses a non-local `DATABASE_URL` for mutating commands.)
3. Real-database acceptance tests. They create and remove their own users, and refuse a database that already contains any user:
   ```bash
   STUDENT_PROGRESS_TEST_DATABASE_URL="postgresql://<user>:<password>@localhost:5432/tore_student_progress_test_acc1" \
   STUDENT_PROGRESS_TEST_DB_DISPOSABLE=I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE npm run test:student-db
   ```
4. Import the real sources, twice (the script refuses a non-local database and requires the confirmation variable; for staging, review and relax that guard deliberately, do not bypass it). The second run must report `created: 0`, `unchanged: 49`, `duplicate: 0`:
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@localhost:5432/tore_student_progress_test_acc1" \
   STUDENT_EXAM_IMPORT_DB_CONFIRM=I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE_OR_AUTHORIZED \
     npx tsx scripts/student-exam/import-docx.ts --dir "D:/Desktop" --pdf-dir "C:/Users/user/Downloads" --write
   ```
5. Reconcile the database with the manifest above (expected: 49 problems = 15 criminal + 15 civil + 15 administrative + 4 constitutional; 49 keys; 44 `IMPORTED` + 5 `NEEDS_REVIEW`; 48 court decisions):
   ```sql
   SELECT area, review_status, count(*) FROM student_exam_problems GROUP BY 1, 2 ORDER BY 1, 2;
   SELECT count(*) FROM student_exam_problem_keys;
   SELECT count(*) FROM student_court_decisions;
   ```
6. Browser pass with two test users: run the built app with `DATABASE_URL` pointing at the same dedicated database, register two test accounts through the app's own registration page, promote one to `ADMIN` in that database to review problems, then: as user A browse/filter, study and submit a problem (the model answer appears only afterwards), start a timed exam, reload, let the timer run out, submit, self-assess; as user B confirm A's attempts, results and progress are not reachable. Check desktop and a phone-width viewport, and the loading/failure/retry/empty states.
7. As an admin, open `/admin/student-problems`, review the `NEEDS_REVIEW` items (and spot-check the `IMPORTED` ones against the DOCX), then approve.

## What is deliberately not done

* No AI grading. The score is the student's own assessment against a visible rubric, computed on the server and locked after saving. The automatic provision-coverage indicator is guidance only.
* No automatic link between problems and court decisions; no current-law verification.
* Topic and difficulty are not stated by the sources, so they stay empty until a reviewer sets them (the exam draw treats unrated problems as eligible).
