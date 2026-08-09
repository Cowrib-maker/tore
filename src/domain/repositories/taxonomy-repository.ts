import type {
  Language,
  LawyerLanguageLink,
  LawyerPracticeAreaLink,
  PracticeArea,
  SetLawyerLanguagesInput,
  SetLawyerPracticeAreasInput,
} from "@/domain/entities/taxonomy";

export interface PracticeAreaRepository {
  findById(id: string): Promise<PracticeArea | null>;
  findBySlug(slug: string): Promise<PracticeArea | null>;
  findAllActive(): Promise<PracticeArea[]>;
}

export interface LanguageRepository {
  findById(id: string): Promise<Language | null>;
  findByCode(code: string): Promise<Language | null>;
  findAllActive(): Promise<Language[]>;
}

export interface LawyerTaxonomyRepository {
  getPracticeAreas(lawyerProfileId: string): Promise<LawyerPracticeAreaLink[]>;
  getLanguages(lawyerProfileId: string): Promise<LawyerLanguageLink[]>;
  setPracticeAreas(input: SetLawyerPracticeAreasInput): Promise<void>;
  setLanguages(input: SetLawyerLanguagesInput): Promise<void>;
}
