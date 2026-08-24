import { openSampleCaseAction } from "@/application/actions/case-review.actions";
import { requireActor } from "@/application/common/require-actor";
import {
  SAMPLE_CASE_VARIANTS,
  analysisStatusLabelMn,
  legalDomainLabelMn,
  listCaseReviewsForLawyer,
} from "@/application/use-cases/case-review";
import { CreateCaseFileForm } from "@/components/case-review/create-case-file-form";
import { buttonVariants } from "@/components/ui/button";
import { UserRole } from "@/domain/enums";
import { cn } from "@/lib/utils";

function formatStamp(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 16).replace("T", " ");
}

export default async function LawyerCasesPage() {
  const actor = await requireActor(UserRole.LAWYER);
  const cases = await listCaseReviewsForLawyer(actor);
  const showSamples = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0A0F14]">
            Хэргүүд
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#5C6570]">
            Өөрийн хэргүүдээ нээж, AI яриа болон баримттайгаа үргэлжлүүлнэ үү.
          </p>
        </div>
        <a
          href="/lawyer/workspace"
          className="text-sm font-medium text-[#0F3D33] underline-offset-4 hover:underline"
        >
          Ажлын талбар руу буцах
        </a>
      </header>

      <section id="create-case">
        <h2 className="mb-3 text-sm font-semibold tracking-[0.12em] text-[#0A0F14] uppercase">
          Шинэ хэрэг
        </h2>
        <CreateCaseFileForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-[0.12em] text-[#0A0F14] uppercase">
          Миний хэргүүд
        </h2>
        {cases.length === 0 ? (
          <div
            data-testid="case-file-empty"
            className="rounded-2xl border border-[#0B1F3A]/10 bg-white px-6 py-10 text-center"
          >
            <p className="font-semibold text-[#0A0F14]">Одоогоор хэрэг алга.</p>
            <p className="mt-2 text-sm text-[#5C6570]">
              Шинэ хэрэг үүсгээд ажлаа эндээс эхлүүлээрэй.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="case-file-list">
            {cases.map((item) => (
              <li
                key={item.caseId}
                data-testid={`case-row-${item.caseId}`}
                className="flex flex-col gap-3 rounded-2xl border border-[#0B1F3A]/8 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <a
                    className="font-semibold text-[#0A0F14] underline-offset-4 hover:underline"
                    href={`/lawyer/workspace/case-review?caseId=${encodeURIComponent(item.caseId)}`}
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-sm text-[#5C6570]">
                    {legalDomainLabelMn(item.domain)} ·{" "}
                    {analysisStatusLabelMn(item.status)}
                  </p>
                  <p className="mt-1 text-xs text-[#8A939D]">
                    Шинэчилсэн {formatStamp(item.updatedAt)}
                  </p>
                </div>
                <a
                  href={`/lawyer/workspace/case-review?caseId=${encodeURIComponent(item.caseId)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 border-[#0B1F3A]/14 text-[#0B1F3A]",
                  )}
                >
                  Нээх
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showSamples ? (
        <div className="space-y-2" data-testid="dev-sample-cases">
          <p className="text-xs text-[#8A939D]">
            Хөгжүүлэлтийн жишээ хэрэг — үйлдвэрлэлийн үүсгэлт биш.
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CASE_VARIANTS.map((variant) => (
              <form key={variant} action={openSampleCaseAction}>
                <input type="hidden" name="variant" value={variant} />
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {variant.replaceAll("-", " ")} жишээ
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
