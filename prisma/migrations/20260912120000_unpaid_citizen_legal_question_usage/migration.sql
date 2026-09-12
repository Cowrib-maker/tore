-- CreateTable
CREATE TABLE "unpaid_citizen_legal_question_usages" (
    "user_id" TEXT NOT NULL,
    "questions_used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unpaid_citizen_legal_question_usages_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "unpaid_citizen_legal_question_usages" ADD CONSTRAINT "unpaid_citizen_legal_question_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
