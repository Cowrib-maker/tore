import type {
  IKnowledgeMetadataExtractor,
  KnowledgeMetadata,
  NormalizedKnowledgeDocument,
} from "../types";

/**
 * Rule-based metadata extractor.
 *
 * Language is inferred from script (Cyrillic → `mn`, otherwise `en`).
 * Replace with a catalog-backed extractor later via the same port.
 */
export class RuleBasedKnowledgeMetadataExtractor
  implements IKnowledgeMetadataExtractor
{
  extract(document: NormalizedKnowledgeDocument): KnowledgeMetadata {
    const sample = [document.normalizedTitle, ...document.articles.map((a) => a.text)]
      .join(" ")
      .slice(0, 4000);

    return {
      title: document.normalizedTitle,
      language: looksCyrillic(sample) ? "mn" : "en",
      jurisdiction: "MN",
      documentType: inferDocumentType(sample),
      sourceUrl: document.sourceUrl,
      articleCount: document.articles.length,
    };
  }
}

function looksCyrillic(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) {
    return false;
  }
  const cyrillic = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter));
  return cyrillic.length / letters.length >= 0.3;
}

function inferDocumentType(sample: string): string | null {
  const text = sample.toLowerCase();
  if (/үндсэн хууль|constitution/.test(text)) {
    return "CONSTITUTION";
  }
  if (/эрүүгийн|criminal code/.test(text)) {
    return "CRIMINAL_CODE";
  }
  if (/хөдөлмөр|labor|employment/.test(text)) {
    return "LABOR_LAW";
  }
  if (/гэрээ|contract/.test(text)) {
    return "CONTRACT";
  }
  if (/хууль|statute|law/.test(text)) {
    return "LAW";
  }
  return null;
}
