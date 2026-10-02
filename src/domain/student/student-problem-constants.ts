/**
 * Answer-length limits for the Student case-study problem. Kept in this tiny
 * dependency-free module because client components need them (for the error
 * messages) -- importing them from the evaluator use-case would drag the
 * server-only env/OpenAI code into the browser bundle.
 */
export const STUDENT_PROBLEM_ANSWER_MIN_CHARS = 60;
export const STUDENT_PROBLEM_ANSWER_MAX_CHARS = 6_000;
