import type {
  HomepageSection,
  HomepageSectionKey,
} from "@/domain/entities/homepage-section";

export interface HomepageSectionRepository {
  findAll(): Promise<HomepageSection[]>;
  setImage(
    key: HomepageSectionKey,
    imageKey: string | null,
    updatedByUserId: string,
  ): Promise<HomepageSection>;
}
