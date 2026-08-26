import type { LegalAiSafeCitation } from "@/application/ai/legal-ai-citation";

export function formatCitationArticleLine(
  citation: Pick<LegalAiSafeCitation, "article" | "paragraph">,
): string | null {
  if (citation.article?.trim()) {
    const article = citation.article.trim();
    if (/зүйл/i.test(article)) {
      return article;
    }
    return `${article} дүгээр зүйл`;
  }
  if (citation.paragraph?.trim()) {
    return `${citation.paragraph.trim()} дэх хэсэг`;
  }
  return null;
}

export function LegalAiCitationList({
  citations,
}: {
  citations: LegalAiSafeCitation[] | undefined;
}) {
  if (!citations?.length) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-[#0B1F3A]/8 pt-3">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A6B2A]">
        Эх сурвалж
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#8A939D]">
        Доорх нь баталгаатай эх. Дээрх хариулт нь TORE-ийн дүгнэлт — ишлэл биш.
      </p>
      <ul className="mt-2 space-y-2">
        {citations.map((citation) => {
          const articleLine = formatCitationArticleLine(citation);
          return (
            <li key={citation.id} className="text-[13px] leading-5 text-[#3F4852]">
              <p className="font-medium text-[#0A0F14]">{citation.title}</p>
              {articleLine ? <p>{articleLine}</p> : null}
              {citation.sourceVersion ? (
                <p>Хувилбар: {citation.sourceVersion}</p>
              ) : null}
              {citation.validFrom ? <p>Хүчинтэй: {citation.validFrom}</p> : null}
              {citation.validTo ? <p>Хүчинтэй дуусах: {citation.validTo}</p> : null}
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
          );
        })}
      </ul>
    </div>
  );
}
