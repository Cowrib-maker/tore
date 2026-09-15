"use client";

import { useActionState } from "react";

import {
  generateCaseAiAnalysisAction,
  type CaseAiAnalysisActionState,
} from "@/application/actions/case-review.actions";
import type { CaseAiAnalysisResult } from "@/domain/entities/case-ai-analysis";
import { CaseAiAnalysisView } from "@/components/case-review/case-ai-analysis-view";
import { Button } from "@/components/ui/button";

const initial: CaseAiAnalysisActionState = {};

export function CaseAiAnalyzePanel({
  caseId,
  initialAnalysis,
  documentHrefByEvidenceId,
}: {
  caseId: string;
  initialAnalysis: CaseAiAnalysisResult | null;
  documentHrefByEvidenceId: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    generateCaseAiAnalysisAction,
    initial,
  );
  const analysis = state.analysis ?? initialAnalysis;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">Хэргийн AI шинжилгээ</h2>
          <p className="text-[13px] text-[#5C6570]">
            Хэргийн баримт болон баталгаатай эрх зүйн эх сурвалжид үндэслэсэн бүтэцтэй
            шинжилгээ.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <Button type="submit" disabled={pending}>
            {pending
              ? "Боловсруулж байна…"
              : analysis
                ? "Дахин шинжлэх"
                : "Шинжилгээ хийх"}
          </Button>
        </form>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-[#FCEBEA] px-3 py-2 text-[13px] text-[#B3261E]">
          {state.error}
        </p>
      ) : null}

      {analysis ? (
        <CaseAiAnalysisView
          analysis={analysis}
          documentHrefByEvidenceId={documentHrefByEvidenceId}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-[#0B1F3A]/15 p-6 text-center text-[13px] text-[#8A939D]">
          Хараахан шинжилгээ хийгдээгүй байна.
        </p>
      )}
    </div>
  );
}
