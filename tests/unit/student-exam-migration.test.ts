import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261003120000_student_lawyer_exam/migration.sql"), "utf8");
const schema = readFileSync(path.resolve(__dirname, "../../prisma/schema.prisma"), "utf8");

describe("student lawyer exam migration (static check of the SQL file; not executed against a database)", () => {
  it("is additive only: creates enums and the five new tables, and never drops, truncates or rewrites existing data", () => {
    expect(sql.match(/CREATE TABLE/g)).toHaveLength(5);
    expect(sql.match(/CREATE TYPE/g)).toHaveLength(4);
    expect(sql).not.toMatch(/DROP |TRUNCATE|DELETE FROM|UPDATE "|RENAME/i);
    // Every ALTER touches only the new student_* tables.
    for (const m of sql.matchAll(/ALTER TABLE "([^"]+)"/g)) expect(m[1]).toMatch(/^student_/);
  });

  it("keeps the answer key in a different table from the problem a student sees", () => {
    const problems = /CREATE TABLE "student_exam_problems" \(([\s\S]*?)\n\);/.exec(sql)![1]!;
    expect(problems).not.toMatch(/model_answer|rubric|legal_provisions|court_citations|answer_outline/);
    const keys = /CREATE TABLE "student_exam_problem_keys" \(([\s\S]*?)\n\);/.exec(sql)![1]!;
    expect(keys).toMatch(/"model_answer"/);
    expect(keys).toMatch(/"rubric"/);
  });

  it("enforces one active exam per student and one active study attempt per student and problem in the database", () => {
    expect(sql).toMatch(/UNIQUE INDEX "student_exam_attempts_one_active_exam_idx"[^;]*WHERE "mode" = 'EXAM' AND "status" = 'IN_PROGRESS'/);
    expect(sql).toMatch(/UNIQUE INDEX "student_exam_attempts_one_active_study_idx"[^;]*WHERE "mode" = 'STUDY' AND "status" = 'IN_PROGRESS'/);
  });

  it("constrains difficulty, score range and the attempt shape", () => {
    expect(sql).toContain('CHECK ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5)');
    expect(sql).toContain('"score_total" BETWEEN 0 AND "score_max"');
    expect(sql).toContain('"mode" = \'EXAM\' AND "deadline_at" IS NOT NULL');
  });

  it("deletes attempts with the account but protects problems that attempts reference", () => {
    expect(sql).toMatch(/"student_exam_attempts_user_id_fkey"[^;]*ON DELETE CASCADE/);
    expect(sql).toMatch(/"student_exam_attempt_items_attempt_id_fkey"[^;]*ON DELETE CASCADE/);
    expect(sql).toMatch(/"student_exam_attempt_items_problem_id_fkey"[^;]*ON DELETE RESTRICT/);
  });

  it("matches the Prisma models it was generated from (same table names)", () => {
    for (const table of ["student_exam_problems", "student_exam_problem_keys", "student_exam_attempts", "student_exam_attempt_items", "student_court_decisions"]) {
      expect(schema).toContain(`@@map("${table}")`);
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });
});
