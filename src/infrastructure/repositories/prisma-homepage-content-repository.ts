import type {
  HomepageContentRecord,
  HomepageLandingContent,
} from "@/domain/entities/homepage-content";
import type { HomepageContentRepository } from "@/domain/repositories/homepage-content-repository";
import { isLocale, type Locale } from "@/i18n/config";
import { prisma } from "@/infrastructure/database/prisma";

function mapHomepageContent(record: {
  locale: string;
  contentJson: unknown;
  updatedAt: Date;
}): HomepageContentRecord {
  if (!isLocale(record.locale)) {
    throw new Error(`Unknown homepage content locale: ${record.locale}`);
  }
  return {
    locale: record.locale,
    content: record.contentJson as HomepageLandingContent,
    updatedAt: record.updatedAt,
  };
}

export class PrismaHomepageContentRepository
  implements HomepageContentRepository
{
  async findByLocale(locale: Locale): Promise<HomepageContentRecord | null> {
    const record = await prisma.homepageContent.findUnique({
      where: { locale },
    });
    return record ? mapHomepageContent(record) : null;
  }

  async findAll(): Promise<HomepageContentRecord[]> {
    const records = await prisma.homepageContent.findMany();
    return records.map(mapHomepageContent);
  }

  async upsert(
    locale: Locale,
    content: HomepageLandingContent,
    updatedByUserId: string,
  ): Promise<HomepageContentRecord> {
    const record = await prisma.homepageContent.upsert({
      where: { locale },
      create: {
        locale,
        contentJson: content as object,
        updatedByUserId,
      },
      update: {
        contentJson: content as object,
        updatedByUserId,
      },
    });
    return mapHomepageContent(record);
  }
}

export const homepageContentRepository = new PrismaHomepageContentRepository();
