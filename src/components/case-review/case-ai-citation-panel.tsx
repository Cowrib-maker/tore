import type { CaseAiCitation } from "@/domain/entities/case-ai-analysis";

/**
 * Sprint 13 Phase 7 — reusable citation panel for grounded Case Analysis V1
 * and the LAWYER_POSITION draft. Structurally distinguishes a VERIFIED
 * LEGAL SOURCE from a USER UPLOADED DOCUMENT (never implies the latter is
 * official law) and never invents a route: a legal citation links out via
 * its own sourceUrl (exactly like LegalAiCitationList), and a document
 * citation links to the existing internal `/api/files/[...key]` route via
 * the fileReference the caller resolves from the case's evidence list —
 * this component never guesses a storage key on its own.
 */
export function CaseAiCitationPanel({
  citations,
  documentHrefByEvidenceId,
}: {
  citations: CaseAiCitation[] | undefined;
  /** caseEvidenceId -> internal `/api/files/...` href, resolved by the
   * caller (which already has the case's evidence list loaded) from
   * CaseEvidenceRecord.fileReference. Entries with no fileReference on file
   * are simply omitted here — never guessed. */
  documentHrefByEvidenceId?: Record<string, string>;
}) {
  if (!citations?.length) {
    return null;
  }

  const legalSources = citations.filter((c) => c.citationType === "VERIFIED_LEGAL_SOURCE");
  const userDocuments = citations.filter((c) => c.citationType === "USER_DOCUMENT");

  return (
    <div className="mt-3 border-t border-[#0B1F3A]/8 pt-3">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A6B2A]">
        Эх сурвалж
      </p>

      {legalSources.length > 0 ? (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F2EA] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[#1E5B3A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1E5B3A]" />
            БАТАЛГААТАЙ ЭРХ ЗҮЙН ЭХ СУРВАЛЖ
          </span>
          <ul className="mt-2 space-y-2">
            {legalSources.map((citation, index) => (
              <li key={`legal-${index}`} className="text-[13px] leading-5 text-[#3F4852]">
                <p className="font-medium text-[#0A0F14]">{citation.title}</p>
                {citation.reference ? (
                  <p className="text-[#5C6570]">{citation.reference}</p>
                ) : null}
                {citation.excerpt ? (
                  <p className="mt-0.5 text-[#5C6570] italic">“{citation.excerpt}”</p>
                ) : null}
                {citation.sourceUrl ? (
                  <a
                    href={citation.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[#173A66] underline underline-offset-2 hover:text-[#0B1F3A]"
                  >
                    {citation.sourceUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {userDocuments.length > 0 ? (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FBF3E3] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[#8A6B2A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8A6B2A]" />
            ХЭРЭГЛЭГЧИЙН БАЙРШУУЛСАН БАРИМТ · АЛБАН ЁСНЫ ХУУЛЬ БИШ
          </span>
          <ul className="mt-2 space-y-2">
            {userDocuments.map((citation, index) => {
              const href = citation.caseEvidenceId
                ? documentHrefByEvidenceId?.[citation.caseEvidenceId]
                : undefined;
              return (
                <li key={`doc-${index}`} className="text-[13px] leading-5 text-[#3F4852]">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#173A66] underline underline-offset-2 hover:text-[#0B1F3A]"
                    >
                      {citation.title}
                    </a>
                  ) : (
                    <p className="font-medium text-[#0A0F14]">{citation.title}</p>
                  )}
                  {citation.excerpt ? (
                    <p className="mt-0.5 text-[#5C6570] italic">“{citation.excerpt}”</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
