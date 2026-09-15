import {
  CASE_AI_ANALYSIS_SECTION_ORDER,
  type CaseAiAnalysisResult,
  type CaseAnalysisSection,
  type CaseAnalysisStatementKind,
} from "@/domain/entities/case-ai-analysis";
import { CaseAiCitationPanel } from "@/components/case-review/case-ai-citation-panel";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<CaseAnalysisStatementKind, string> = {
  FACT: "БАРИМТ",
  LAW: "ХУУЛЬ",
  INFERENCE: "ДҮГНЭЛТ",
  UNCERTAINTY: "ТОДОРХОЙГҮЙ",
};

const KIND_CLASS: Record<CaseAnalysisStatementKind, string> = {
  FACT: "bg-[#E7F0FB] text-[#173A66]",
  LAW: "bg-[#E7F2EA] text-[#1E5B3A]",
  INFERENCE: "bg-[#F1EEFB] text-[#4A3A8A]",
  UNCERTAINTY: "bg-[#FCEBEA] text-[#B3261E]",
};

function SectionView({
  section,
  citations,
  documentHrefByEvidenceId,
}: {
  section: CaseAnalysisSection;
  citations: CaseAiAnalysisResult["citations"];
  documentHrefByEvidenceId?: Record<string, string>;
}) {
  return (
    <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
      <h3 className="text-sm font-semibold text-[#0B1F3A]">{section.heading}</h3>
      {section.statements.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#8A939D]">
          Энэ хэсэгт мэдээлэл олдсонгүй.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {section.statements.map((statement, index) => {
            const usedCitations = statement.citationRefs
              .map((ref) => citations[ref])
              .filter((c): c is CaseAiAnalysisResult["citations"][number] => Boolean(c));
            return (
              <li key={index} className="text-[13px] leading-5 text-[#3F4852]">
                <span
                  className={cn(
                    "mr-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em]",
                    KIND_CLASS[statement.kind],
                  )}
                >
                  {KIND_LABEL[statement.kind]}
                </span>
                {statement.text}
                {usedCitations.length > 0 ? (
                  <CaseAiCitationPanel
                    citations={usedCitations}
                    documentHrefByEvidenceId={documentHrefByEvidenceId}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Sprint 13 Phase 6/7 — renders a grounded Case Analysis V1 result. Purely
 * presentational: the caller loads the CaseAiAnalysisResult via
 * getLatestCaseAiAnalysisForLawyer / the /api/lawyer/case-review/ai-analysis
 * route and passes it in — this component never fetches or mutates
 * anything itself, so it has no way to bypass the use-case's authorization.
 */
export function CaseAiAnalysisView({
  analysis,
  documentHrefByEvidenceId,
}: {
  analysis: CaseAiAnalysisResult;
  documentHrefByEvidenceId?: Record<string, string>;
}) {
  if (analysis.status === "FAILED") {
    return (
      <div className="rounded-2xl border border-[#B3261E]/20 bg-[#FCEBEA] p-4 text-sm text-[#B3261E]">
        {analysis.failureReason ?? "Шинжилгээ амжилтгүй боллоо."}
      </div>
    );
  }

  if (analysis.status === "PENDING" || !analysis.sections) {
    return (
      <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4 text-sm text-[#5C6570]">
        Шинжилгээ боловсруулагдаж байна…
      </div>
    );
  }

  const sections = analysis.sections;

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-4 text-[#8A939D]">
        Энэ бол TORE-ийн AI хэрэг шинжилгээ — эцсийн эрх зүйн дүгнэлт биш. Баримт,
        баталгаатай хууль, дүгнэлт, тодорхойгүй зүйлийг ялгаж үзнэ үү.
      </p>
      {CASE_AI_ANALYSIS_SECTION_ORDER.map((key) => (
        <SectionView
          key={key}
          section={sections[key]}
          citations={analysis.citations}
          documentHrefByEvidenceId={documentHrefByEvidenceId}
        />
      ))}
      <div className="rounded-2xl border border-[#0B1F3A]/10 bg-white p-4">
        <h3 className="text-sm font-semibold text-[#0B1F3A]">Эх сурвалж</h3>
        <CaseAiCitationPanel
          citations={analysis.citations}
          documentHrefByEvidenceId={documentHrefByEvidenceId}
        />
        {analysis.citations.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#8A939D]">Ашигласан эх сурвалж алга.</p>
        ) : null}
      </div>
    </div>
  );
}
