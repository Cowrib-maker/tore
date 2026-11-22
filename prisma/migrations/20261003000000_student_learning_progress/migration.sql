-- TORE Student account-linked learning progress. Additive only: two new tables, no change to existing data.
CREATE TABLE "student_lesson_progress" (
    "user_id" TEXT NOT NULL,
    "track_id" VARCHAR(40) NOT NULL,
    "lesson_id" VARCHAR(80) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_lesson_progress_pkey" PRIMARY KEY ("user_id", "track_id", "lesson_id")
);

CREATE TABLE "student_quiz_best" (
    "user_id" TEXT NOT NULL,
    "quiz_id" VARCHAR(80) NOT NULL,
    "percent" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_quiz_best_pkey" PRIMARY KEY ("user_id", "quiz_id"),
    CONSTRAINT "student_quiz_best_range" CHECK ("percent" BETWEEN 0 AND 100 AND "total" > 0 AND "correct" BETWEEN 0 AND "total")
);

ALTER TABLE "student_lesson_progress" ADD CONSTRAINT "student_lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_quiz_best" ADD CONSTRAINT "student_quiz_best_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
