import { notFound, redirect } from "next/navigation";

import { openStudyAction } from "@/application/actions/student-exam.actions";
import { requirePageSession } from "@/application/common/session";

/**
 * Opening a problem for study resumes the student's attempt on it (or creates one) and continues on the attempt page, which
 * shows the editor while the attempt is open and the comparison with the model answer once it has been submitted.
 */
export default async function LawyerExamProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ problemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageSession();
  const [{ problemId }, query] = await Promise.all([params, searchParams]);
  const result = await openStudyAction(problemId, query.fresh === "1");
  if (!result.ok) {
    if (result.error === "not_found") notFound();
    throw new Error("Could not open the problem.");
  }
  redirect(`/student/lawyer-exam/attempt/${result.attemptId}`);
}
