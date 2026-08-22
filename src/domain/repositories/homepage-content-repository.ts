import type {
  HomepageContentRecord,
  HomepageLandingContent,
} from "@/domain/entities/homepage-content";
import type { Locale } from "@/i18n/config";

export interface HomepageContentRepository {
  findByLocale(locale: Locale): Promise<HomepageContentRecord | null>;
  findAll(): Promise<HomepageContentRecord[]>;
  upsert(
    locale: Locale,
    content: HomepageLandingContent,
    updatedByUserId: string,
  ): Promise<HomepageContentRecord>;
}
