import type {
  HomepageSection,
  HomepageSectionKey,
} from "@/domain/entities/homepage-section";
import type { HomepageSectionRepository } from "@/domain/repositories/homepage-section-repository";
import { prisma } from "@/infrastructure/database/prisma";

function mapHomepageSection(record: {
  key: string;
  imageKey: string | null;
  updatedAt: Date;
}): HomepageSection {
  return {
    key: record.key as HomepageSectionKey,
    imageKey: record.imageKey,
    updatedAt: record.updatedAt,
  };
}

export class PrismaHomepageSectionRepository
  implements HomepageSectionRepository
{
  async findAll(): Promise<HomepageSection[]> {
    const records = await prisma.homepageSection.findMany();
    return records.map(mapHomepageSection);
  }

  async setImage(
    key: HomepageSectionKey,
    imageKey: string | null,
    updatedByUserId: string,
  ): Promise<HomepageSection> {
    const record = await prisma.homepageSection.upsert({
      where: { key },
      create: { key, imageKey, updatedByUserId },
      update: { imageKey, updatedByUserId },
    });
    return mapHomepageSection(record);
  }
}

export const homepageSectionRepository = new PrismaHomepageSectionRepository();
