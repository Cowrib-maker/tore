import { getSpellRuntime, parseOrThrow, requireActor, spellErrorResponse, spellJson } from "@/application/common/spell-http";
import { listFeedbackGroups } from "@/application/use-cases/spell/feedback";
import { feedbackListQuerySchema } from "@/application/validators/spell.schema";
import { UserRole } from "@/domain/enums";
import { feedbackGroupsToReviewItems } from "@/spell-engine/review/feedback-bridge";
import { exportQueueTsv } from "@/spell-engine/review/review";

/**
 * GET /api/spell/admin/feedback — feedback grouped by identical report, with the number of DISTINCT users. Admin only.
 * `?format=review-tsv` exports the groups as a native-review sheet (provenance AUTOMATIC: a user report is a signal, not an answer).
 */
export async function GET(request: Request) {
  try {
    const runtime = getSpellRuntime();
    const actor = await requireActor(UserRole.ADMIN);
    const query = parseOrThrow(feedbackListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    const result = await listFeedbackGroups(actor, query, { feedbackRepository: runtime.feedbackRepository });
    if (query.format === "review-tsv") {
      const tsv = exportQueueTsv(feedbackGroupsToReviewItems(result.groups, { at: new Date().toISOString() }));
      return new Response(tsv, { headers: { "content-type": "text/tab-separated-values; charset=utf-8", "cache-control": "no-store" } });
    }
    return spellJson(result);
  } catch (error) {
    return spellErrorResponse(error);
  }
}
