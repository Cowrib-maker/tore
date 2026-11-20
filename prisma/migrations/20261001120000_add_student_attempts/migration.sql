CREATE TABLE "student_attempts" (
    "id" TEXT NOT NULL,
    "guest_session_id" TEXT,
    "problem_id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "answer_history" JSONB NOT NULL DEFAULT '[]',
    "hints_revealed" JSONB NOT NULL DEFAULT '[]',
    "final_grade" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_attempts_guest_session_id_problem_id_updated_at_idx"
ON "student_attempts"("guest_session_id", "problem_id", "updated_at" DESC);

ALTER TABLE "student_attempts"
ADD CONSTRAINT "student_attempts_guest_session_id_fkey"
FOREIGN KEY ("guest_session_id")
REFERENCES "guest_sessions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;