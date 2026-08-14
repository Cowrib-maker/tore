import { dottedPinpoint } from "../pinpoint";
import type { CitationFormatInput, CitationGrammar } from "../types";

/** Fallback grammar: instrument title + dotted pinpoint or locator display. */
export const genericCitationGrammar: CitationGrammar = {
  id: "generic",

  formatCanonical(input: CitationFormatInput): string {
    const dotted = dottedPinpoint(input.pinpoint);
    if (dotted) {
      return `${input.instrumentTitle} ${dotted}`;
    }
    if (input.locator?.display) {
      return `${input.instrumentTitle} ${input.locator.display}`;
    }
    return `${input.instrumentTitle} ${input.kind} ${input.path}`;
  },

  formatAliases(input: CitationFormatInput): string[] {
    const aliases: string[] = [];
    const dotted = dottedPinpoint(input.pinpoint);
    if (dotted) {
      aliases.push(dotted, `${input.instrumentTitle} ${dotted}`);
    }
    return aliases;
  },
};
