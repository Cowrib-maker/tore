import type {
  Language,
  LawyerLanguageLink,
  LawyerPracticeAreaLink,
  PracticeArea,
  SetLawyerLanguagesInput,
  SetLawyerPracticeAreasInput,
} from "@/domain/entities/taxonomy";
import type { LanguageProficiency } from "@/domain/enums";
import type {
  LanguageRepository,
  LawyerTaxonomyRepository,
  PracticeAreaRepository,
} from "@/domain/repositories/taxonomy-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

const practiceAreaSelect = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  descriptionMn: true,
  descriptionEn: true,
  isActive: true,
  sortOrder: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const languageSelect = {
  id: true,
  code: true,
  nameMn: true,
  nameEn: true,
  isActive: true,
} as const;

function mapPracticeArea(record: {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  descriptionMn: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PracticeArea {
  return { ...record };
}

function mapLanguage(record: {
  id: string;
  code: string;
  nameMn: string;
  nameEn: string;
  isActive: boolean;
}): Language {
  return { ...record };
}

export class PrismaPracticeAreaRepository implements PracticeAreaRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<PracticeArea | null> {
    const record = await this.db.practiceArea.findFirst({
      where: { id, deletedAt: null },
      select: practiceAreaSelect,
    });
    return record ? mapPracticeArea(record) : null;
  }

  async findBySlug(slug: string): Promise<PracticeArea | null> {
    const record = await this.db.practiceArea.findFirst({
      where: { slug, deletedAt: null },
      select: practiceAreaSelect,
    });
    return record ? mapPracticeArea(record) : null;
  }

  async findAllActive(): Promise<PracticeArea[]> {
    const records = await this.db.practiceArea.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      select: practiceAreaSelect,
    });
    return records.map(mapPracticeArea);
  }
}

export class PrismaLanguageRepository implements LanguageRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<Language | null> {
    const record = await this.db.language.findFirst({
      where: { id, isActive: true },
      select: languageSelect,
    });
    return record ? mapLanguage(record) : null;
  }

  async findByCode(code: string): Promise<Language | null> {
    const record = await this.db.language.findFirst({
      where: { code, isActive: true },
      select: languageSelect,
    });
    return record ? mapLanguage(record) : null;
  }

  async findAllActive(): Promise<Language[]> {
    const records = await this.db.language.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: languageSelect,
    });
    return records.map(mapLanguage);
  }
}

export class PrismaLawyerTaxonomyRepository implements LawyerTaxonomyRepository {
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async getPracticeAreas(
    lawyerProfileId: string,
  ): Promise<LawyerPracticeAreaLink[]> {
    const records = await this.db.lawyerPracticeArea.findMany({
      where: { lawyerProfileId },
    });
    return records.map((r) => ({
      lawyerProfileId: r.lawyerProfileId,
      practiceAreaId: r.practiceAreaId,
      createdAt: r.createdAt,
    }));
  }

  async getPracticeAreasForProfiles(
    lawyerProfileIds: string[],
  ): Promise<LawyerPracticeAreaLink[]> {
    if (lawyerProfileIds.length === 0) return [];
    const records = await this.db.lawyerPracticeArea.findMany({
      where: { lawyerProfileId: { in: lawyerProfileIds } },
    });
    return records.map((r) => ({
      lawyerProfileId: r.lawyerProfileId,
      practiceAreaId: r.practiceAreaId,
      createdAt: r.createdAt,
    }));
  }

  async getLanguages(
    lawyerProfileId: string,
  ): Promise<LawyerLanguageLink[]> {
    const records = await this.db.lawyerLanguage.findMany({
      where: { lawyerProfileId },
    });
    return records.map((r) => ({
      lawyerProfileId: r.lawyerProfileId,
      languageId: r.languageId,
      proficiency: r.proficiency as LanguageProficiency | null,
      createdAt: r.createdAt,
    }));
  }

  async getLanguagesForProfiles(
    lawyerProfileIds: string[],
  ): Promise<LawyerLanguageLink[]> {
    if (lawyerProfileIds.length === 0) return [];
    const records = await this.db.lawyerLanguage.findMany({
      where: { lawyerProfileId: { in: lawyerProfileIds } },
    });
    return records.map((r) => ({
      lawyerProfileId: r.lawyerProfileId,
      languageId: r.languageId,
      proficiency: r.proficiency as LanguageProficiency | null,
      createdAt: r.createdAt,
    }));
  }

  async setPracticeAreas(input: SetLawyerPracticeAreasInput): Promise<void> {
    await this.db.$transaction([
      this.db.lawyerPracticeArea.deleteMany({
        where: { lawyerProfileId: input.lawyerProfileId },
      }),
      this.db.lawyerPracticeArea.createMany({
        data: input.practiceAreaIds.map((practiceAreaId) => ({
          lawyerProfileId: input.lawyerProfileId,
          practiceAreaId,
        })),
      }),
    ]);
  }

  async setLanguages(input: SetLawyerLanguagesInput): Promise<void> {
    await this.db.$transaction([
      this.db.lawyerLanguage.deleteMany({
        where: { lawyerProfileId: input.lawyerProfileId },
      }),
      this.db.lawyerLanguage.createMany({
        data: input.languages.map((lang) => ({
          lawyerProfileId: input.lawyerProfileId,
          languageId: lang.languageId,
          proficiency: lang.proficiency,
        })),
      }),
    ]);
  }
}

export const practiceAreaRepository = new PrismaPracticeAreaRepository();
export const languageRepository = new PrismaLanguageRepository();
export const lawyerTaxonomyRepository = new PrismaLawyerTaxonomyRepository();
