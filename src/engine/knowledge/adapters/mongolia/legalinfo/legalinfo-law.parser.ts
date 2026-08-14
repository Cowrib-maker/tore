import type { LegalDocument } from "../../../schema";
import { LawParser } from "../../../parsers/law";
import { LegalInfoSourceAdapter } from "./adapter";

export type LegalInfoLawParserOptions = {
  /** Optional official URL if it is not present in the HTML. */
  officialUrl?: string;
};

/**
 * Compatibility facade: LegalInfo adapter + source-agnostic law parser.
 *
 * Input is a raw HTML string. Output is a {@link LegalDocument} tree.
 * Does not fetch, store, embed, translate, summarize, or call a model.
 */
export class LegalInfoLawParser {
  constructor(
    private readonly adapter: LegalInfoSourceAdapter = new LegalInfoSourceAdapter(),
    private readonly parser: LawParser = new LawParser(),
  ) {}

  /**
   * Parses one LegalInfo law detail page (or an HTML fragment of the law body).
   */
  parse(html: string, options: LegalInfoLawParserOptions = {}): LegalDocument {
    const canonical = this.adapter.adapt({
      html,
      officialUrl: options.officialUrl,
    });
    return this.parser.parse(canonical);
  }
}
