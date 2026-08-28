/**
 * Constitution paragraphs are stored inline inside the article text
 * (e.g. `1.Монгол Улс ... 2.Ардчилсан ...`). Keep storage unchanged and
 * extract only the requested paragraph at retrieval time.
 */
export function extractConstitutionParagraph(
  articleText: string,
  paragraphNumber: string,
): string | null {
  const wanted = String(Number(paragraphNumber));
  if (!/^\d+$/.test(wanted)) return null;

  const marker = new RegExp(`(?:^|[\\s])${wanted}\\s*\\.\\s*`, "u");
  const match = marker.exec(articleText);
  if (!match) return null;

  const start = match.index + match[0].length;
  const remainder = articleText.slice(start);
  const next = remainder.search(/(?:^|[\s])\d+\s*\.\s*/u);
  const excerpt = (next >= 0 ? remainder.slice(0, next) : remainder).trim();
  return excerpt || null;
}
