import { LegalNodeKind } from "../../knowledge/schema";
import { dottedPinpoint } from "../pinpoint";
import type { CitationFormatInput, CitationGrammar } from "../types";

function possessiveTitle(title: string): string {
  if (/хуулийн$/u.test(title)) {
    return title;
  }
  if (/хууль$/u.test(title)) {
    return title.replace(/хууль$/u, "хуулийн");
  }
  return title;
}

function instrumentForms(title: string): string[] {
  const possessive = possessiveTitle(title);
  return possessive === title ? [title] : [title, possessive];
}

function withInstrument(title: string, phrase: string): string[] {
  return instrumentForms(title).map((form) => `${form} ${phrase}`);
}

function ordinalWord(unitNumber: string | undefined): string {
  const last = (unitNumber ?? "").replace(/\D/g, "").slice(-1);
  return last === "1" || last === "4" || last === "9" ? "дүгээр" : "дугаар";
}

function particle(unitNumber: string | undefined): string {
  const last = (unitNumber ?? "").replace(/\D/g, "").slice(-1);
  return last === "1" || last === "4" || last === "9" ? "дэх" : "дахь";
}

function articlePhrases(article: string): string[] {
  return [
    `${article} ${ordinalWord(article)} зүйл`,
    `${article} дугаар зүйл`,
    `${article} дүгээр зүйл`,
  ];
}

/**
 * Mongolian statute citation wording.
 * Other jurisdictions supply their own {@link CitationGrammar}.
 */
export const mnStatuteGrammar: CitationGrammar = {
  id: "mn-statute",

  formatCanonical(input: CitationFormatInput): string {
    const inst = possessiveTitle(input.instrumentTitle);
    const dotted = dottedPinpoint(input.pinpoint);
    const article = input.pinpoint.article;

    if (input.kind === LegalNodeKind.ARTICLE && article) {
      return `${inst} ${article} ${ordinalWord(article)} зүйл`;
    }
    if (input.kind === LegalNodeKind.PARAGRAPH && dotted) {
      return `${inst} ${dotted} ${particle(input.pinpoint.paragraph)} хэсэг`;
    }
    if (input.kind === LegalNodeKind.SUBPARAGRAPH && dotted) {
      return `${inst} ${dotted} ${particle(input.pinpoint.subparagraph)} заалт`;
    }
    if (input.kind === LegalNodeKind.ITEM) {
      const item = dotted ?? input.pinpoint.item ?? input.path;
      return `${inst} ${item}`;
    }
    if (input.kind === LegalNodeKind.CHAPTER && input.pinpoint.chapter) {
      const n = input.pinpoint.chapter;
      return `${inst} ${n} ${ordinalWord(n)} бүлэг`;
    }
    if (input.locator?.display) {
      return `${inst} ${input.locator.display}`;
    }
    return `${inst} ${input.path}`;
  },

  formatAliases(input: CitationFormatInput): string[] {
    const aliases: string[] = [];
    const dotted = dottedPinpoint(input.pinpoint);
    const title = input.instrumentTitle;

    if (input.kind === LegalNodeKind.ARTICLE && input.pinpoint.article) {
      for (const phrase of articlePhrases(input.pinpoint.article)) {
        aliases.push(phrase, ...withInstrument(title, phrase));
      }
    }

    if (input.kind === LegalNodeKind.PARAGRAPH && dotted) {
      const phrases = [
        `${dotted} ${particle(input.pinpoint.paragraph)} хэсэг`,
        `${dotted} дэх хэсэг`,
        `${dotted} дахь хэсэг`,
      ];
      for (const phrase of phrases) {
        aliases.push(phrase, ...withInstrument(title, phrase));
      }
    }

    if (input.kind === LegalNodeKind.SUBPARAGRAPH && dotted) {
      const phrases = [
        `${dotted} ${particle(input.pinpoint.subparagraph)} заалт`,
        `${dotted} дахь заалт`,
        `${dotted} дэх заалт`,
      ];
      for (const phrase of phrases) {
        aliases.push(phrase, ...withInstrument(title, phrase));
      }
    }

    if (input.kind === LegalNodeKind.ITEM && input.pinpoint.item) {
      const item = input.pinpoint.item;
      aliases.push(item, `${item})`, `/${item}/`);
    }

    return aliases;
  },
};
