// Plain (non "use server") module — same reason as student-action-messages.ts.
import { WRITTEN_EXAM_ANSWER_MAX_CHARS, WRITTEN_EXAM_ANSWER_MIN_CHARS } from "@/domain/student/written-exam-validation";

const WRITTEN_EXAM_ACTION_ERROR_MESSAGES: Record<string, string> = {
  invalid: "Хариултын мэдээлэл буруу байна. Дахин оролдоно уу.",
  not_found: "Бодлого олдсонгvй.",
  too_short: `Хариулт хэтэрхий богино байна (доод тал нь ${WRITTEN_EXAM_ANSWER_MIN_CHARS} тэмдэгт).`,
  too_long: `Хариулт хэтэрхий урт байна (дээд тал нь ${WRITTEN_EXAM_ANSWER_MAX_CHARS} тэмдэгт).`,
  rate_limited: "Тvр хугацаанд хэт олон удаа илгээлээ. Хэдэн минутын дараа дахин оролдоно уу.",
  no_session: "Сессийн мэдээлэл олдсонгvй. Хуудсыг дахин ачаална уу.",
  no_attempt_yet: "Эхлээд хариултаа нэг удаа илгээнэ vv.",
  no_hint_available: "Одоогоор өгөх санамж алга — бvх шаардлагатай шалгуур хангагдсан эсвэл бvгд аль хэдийн санамжтай.",
};

export function writtenExamActionErrorMessage(error: string): string {
  return WRITTEN_EXAM_ACTION_ERROR_MESSAGES[error] ?? "Алдаа гарлаа. Дахин оролдоно уу.";
}
