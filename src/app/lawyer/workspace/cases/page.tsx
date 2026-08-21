import { openSampleCaseAction } from "@/application/actions/case-review.actions";
import { requireActor } from "@/application/common/require-actor";
import { SAMPLE_CASE_VARIANTS } from "@/application/use-cases/case-review";
import { listCaseReviewsForLawyer } from "@/application/use-cases/case-review";
import { CreateCaseFileForm } from "@/components/case-review/create-case-file-form";
import { StatusBadge } from "@/components/case-review/status-badge";
import { DashboardPageHeading } from "@/components/layout/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRole } from "@/domain/enums";
import { cn } from "@/lib/utils";

function formatStamp(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 19).replace("T", " ");
}

export default async function LawyerCasesPage() {
  const actor = await requireActor(UserRole.LAWYER);
  const cases = await listCaseReviewsForLawyer(actor);
  const showSamples = process.env.NODE_ENV !== "production";

  return (
    <>
      <DashboardPageHeading>Cases</DashboardPageHeading>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Lawyer-owned case files. The engine computes reviews; this list does not
        invent legal conclusions.
      </p>

      <h2 className="mb-2 text-sm font-semibold tracking-wide uppercase text-brand-muted">
        New case
      </h2>
      <CreateCaseFileForm />

      <h2 className="mt-8 mb-2 text-sm font-semibold tracking-wide uppercase text-brand-muted">
        Owned cases
      </h2>
      {cases.length === 0 ? (
        <EmptyState
          title="No cases yet"
          description="Create a case to persist facts, MANUAL mappings, and the last engine review."
        />
      ) : (
        <Table data-testid="case-file-list">
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Last analyzed</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((item) => (
              <TableRow key={item.caseId} data-testid={`case-row-${item.caseId}`}>
                <TableCell>
                  <a
                    className="font-medium underline underline-offset-4"
                    href={`/lawyer/workspace/case-review?caseId=${encodeURIComponent(item.caseId)}`}
                  >
                    {item.title}
                  </a>
                </TableCell>
                <TableCell className="font-mono text-xs">{item.domain}</TableCell>
                <TableCell className="font-mono text-xs">
                  {formatStamp(item.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatStamp(item.updatedAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatStamp(item.lastAnalyzedAt)}
                </TableCell>
                <TableCell>
                  <StatusBadge value={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showSamples ? (
        <div className="mt-8 space-y-2" data-testid="dev-sample-cases">
          <p className="text-sm text-muted-foreground">
            Development fixtures — persist a sample CaseFile. Not the production
            create flow.
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CASE_VARIANTS.map((variant) => (
              <form key={variant} action={openSampleCaseAction}>
                <input type="hidden" name="variant" value={variant} />
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Seed {variant.replaceAll("-", " ")} sample
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
