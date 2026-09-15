"use client";

import { useActionState } from "react";

import {
  generateCaseDraftAction,
  type CaseDraftActionState,
} from "@/application/actions/case-review.actions";
import {
  CaseDraftType,
  LAWYER_POSITION_SECTION_ORDER,
  type CaseDraftResult,
} from "@/domain/entities/case-draft";
import { CaseAiCitationPanel } from "@/components/case-review/case-ai-citation-panel";
import { Button } from "@/components/ui/button";

const initial: CaseDraftActionState = {};

export function CaseDraftPanel({
  caseId,
  initialDrafts,
  documentHrefByEvidenceId,
}: {
  caseId: string;
  initialDrafts: CaseDraftResult[];
  documentHrefByEvidenceId: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(generateCaseDraftAction, initial);
  const drafts = state.draft ? [state.draft, ...initialDrafts] : initialDrafts;
  const latest = drafts[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">
            Өмгөөлөгчийн байр суурийн төсөл
          </h2>
          <p className="text-[13px] text-[#5C6570]">
            Энэ бол засварлах ТӨСӨЛ — эцсийн баримт биш. Улсын яллагчийн дүгнэлт болон
            шүүх хуралдааны асуултын төрөл дараагийн шатанд бэлэн болно.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="draftType" value={CaseDraftType.LAWYER_POSITION} />
          <Button type="submit" disabled={pending}>
            {pending ? "Боловсруулж байна…" : "Төсөл боловсруулах"}
          </Button>
        </form>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-[#FCEBEA] px-3 py-2 text-[13px] text-[#B3261E]">
          {state.error}
        </p>
      ) : null}

      {!latest ? (
        <p className="rounded-2xl border border-dashed border-[#0B1F3A]/15 p-6 text-center text-[13px] text-[#8A939D]">
          Хараахан төсөл боловсруулаагүй байна.
        </p>
      ) : latest.status === "FAILED" ? (
        <div className="rounded-2xl border border-[#B3261E]/20 bg-[#FCEBEA] p-4 text-sm text-[#B3261E]">
          {latest.failureReason ?? "Төсөл боловсруулах явцад алдаа гарлаа."}
        </div>
      ) : latest.content ? (
        <div className="space-y-4">
          {LAWYER_POSITION_SECTION_ORDER.map((key) => {
            const section = latest.content!.sections[key];
            return (
              <div key={key} className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
                <h3 className="text-sm font-semibold text-[#0B1F3A]">{section.heading}</h3>
                {section.statements.length === 0 ? (
                  <p className="mt-2 text-[13px] text-[#8A939D]">Мэдээлэл олдсонгүй.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {section.statements.map((statement, index) => (
                      <li key={index} className="text-[13px] leading-5 text-[#3F4852]">
                        {statement.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-[#0B1F3A]">Эх сурвалж</h3>
            <CaseAiCitationPanel
              citations={latest.content.citations}
              documentHrefByEvidenceId={documentHrefByEvidenceId}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
