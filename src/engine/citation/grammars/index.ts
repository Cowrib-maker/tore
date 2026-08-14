import type { LegalDocument } from "../../knowledge/schema";
import { genericCitationGrammar } from "./generic";
import { mnStatuteGrammar } from "./mn-statute";
import type { CitationGrammar } from "../types";

export { genericCitationGrammar } from "./generic";
export { mnStatuteGrammar } from "./mn-statute";

export function grammarForDocument(document: LegalDocument): CitationGrammar {
  const language = document.identity.language.toLowerCase();
  if (language === "mn" || language.startsWith("mn-")) {
    return mnStatuteGrammar;
  }
  return genericCitationGrammar;
}
