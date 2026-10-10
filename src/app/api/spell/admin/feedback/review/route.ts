import { assertSameOrigin, getSpellRuntime, parseOrThrow, readBoundedBody, requireActor, spellErrorResponse, spellJson } from "@/application/common/spell-http";
import { reviewFeedbackGroup } from "@/application/use-cases/spell/feedback";
import { feedbackReviewSchema } from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";

/** POST /api/spell/admin/feedback/review — ACCEPT | REJECT | DUPLICATE | NEEDS_NATIVE_REVIEW for a whole group, with a reason. Admin only. Changes no language data. */
export async function POST(request: Request) {
  try {
    const runtime = getSpellRuntime();
    assertSameOrigin(request);
    const actor = await requireActor(UserRole.ADMIN);
    const { json } = await readBoundedBody(request);
    const body = parseOrThrow(feedbackReviewSchema, json);
    return spellJson(await reviewFeedbackGroup(actor, body, { feedbackRepository: runtime.feedbackRepository }));
  } catch (error) {
    return spellErrorResponse(error);
  }
}
