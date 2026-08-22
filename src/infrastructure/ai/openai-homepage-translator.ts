import OpenAI from "openai";

import type { HomepageLandingContent } from "@/domain/entities/homepage-content";
import type {
  HomepageTranslationResult,
  HomepageTranslatorPort,
  TranslatableLocale,
} from "@/domain/ports/homepage-translator";
import { localeMeta } from "@/i18n/config";

const DEFAULT_MODEL = "gpt-5.6-luna";

export class OpenAiHomepageTranslator implements HomepageTranslatorPort {
  private client: OpenAI | null = null;

  constructor(private readonly model: string = DEFAULT_MODEL) {}

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  /** Lazily constructs the OpenAI client — never at module load, since no
   *  API key is required unless a translation is actually requested. */
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  async translate(
    source: HomepageLandingContent,
    targetLocales: TranslatableLocale[],
  ): Promise<HomepageTranslationResult> {
    const entries = await Promise.all(
      targetLocales.map(async (locale) => {
        const content = await this.translateOne(source, locale);
        return [locale, content] as const;
      }),
    );
    return Object.fromEntries(entries) as HomepageTranslationResult;
  }

  private async translateOne(
    source: HomepageLandingContent,
    locale: TranslatableLocale,
  ): Promise<HomepageLandingContent> {
    const targetLanguage = localeMeta[locale].label;

    const completion = await this.getClient().chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You translate marketing copy for a legal-tech platform's homepage.",
            `Translate every string value in the given JSON object from Mongolian into ${targetLanguage}.`,
            "Keep every JSON key exactly as given, in the exact same structure, with the exact same array lengths and item order.",
            "Translate ONLY the string values — never rename, add, or remove keys, and never change array lengths.",
            "Keep tone concise, professional, and suitable for a legal services product.",
            "Respond with a single JSON object and nothing else.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(source),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error(`Homepage translation to "${locale}" returned no content`);
    }

    return JSON.parse(raw) as HomepageLandingContent;
  }
}

export const homepageTranslator = new OpenAiHomepageTranslator();
