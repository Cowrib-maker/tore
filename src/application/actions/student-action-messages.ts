// Plain (non "use server") module: Next.js Server Actions files may only
// export async functions, so this error-message mapping — a synchronous
// helper used by client components — must live outside student.actions.ts.
import {
  STUDENT_PROBLEM_ANSWER_MAX_CHARS,
  STUDENT_PROBLEM_ANSWER_MIN_CHARS,
} from "@/application/use-cases/student/evaluate-student-problem";

const PROBLEM_ACTION_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Хариултын мэдээлэл буруу байна. Дахин оролдоно уу.",
  not_found: "Бодлого олдсонгүй.",
  too_short: `Хариулт хэтэрхий богино байна (доод тал нь ${STUDENT_PROBLEM_ANSWER_MIN_CHARS} тэмдэгт).`,
  too_long: `Хариулт хэтэрхий урт байна (дээд тал нь ${STUDENT_PROBLEM_ANSWER_MAX_CHARS} тэмдэгт).`,
  rate_limited: "Түр хугацаанд хэт олон удаа илгээлээ. Хэдэн минутын дараа дахин оролдоно уу.",
};

export function studentProblemActionErrorMessage(error: string): string {
  return PROBLEM_ACTION_ERROR_MESSAGES[error] ?? "Алдаа гарлаа. Дахин оролдоно уу.";
}
