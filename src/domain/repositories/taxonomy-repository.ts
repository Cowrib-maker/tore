import type {
  CreateLanguageInput,
  CreatePracticeAreaInput,
  Language,
  LawyerLanguageLink,
  LawyerPracticeAreaLink,
  PracticeArea,
  SetLawyerLanguagesInput,
  SetLawyerPracticeAreasInput,
  UpdateLanguageInput,
  UpdatePracticeAreaInput,
} from "@/domain/entities/taxonomy";

export interface PracticeAreaRepository {
  findById(id: string): Promise<PracticeArea | null>;
  findBySlug(slug: string): Promise<PracticeArea | null>;
  findAllActive(): Promise<PracticeArea[]>;
  findAll(): Promise<PracticeArea[]>;
  create(input: CreatePracticeAreaInput): Promise<PracticeArea>;
  update(id: string, input: UpdatePracticeAreaInput): Promise<PracticeArea>;
}

export interface LanguageRepository {
  findById(id: string): Promise<Language | null>;
  findByCode(code: string): Promise<Language | null>;
  findAllActive(): Promise<Language[]>;
  findAll(): Promise<Language[]>;
  create(input: CreateLanguageInput): Promise<Language>;
  update(id: string, input: UpdateLanguageInput): Promise<Language>;
}

export interface LawyerTaxonomyRepository {
  getPracticeAreas(lawyerProfileId: string): Promise<LawyerPracticeAreaLink[]>;
  getPracticeAreasForProfiles(
    lawyerProfileIds: string[],
  ): Promise<LawyerPracticeAreaLink[]>;
  getLanguages(lawyerProfileId: string): Promise<LawyerLanguageLink[]>;
  getLanguagesForProfiles(
    lawyerProfileIds: string[],
  ): Promise<LawyerLanguageLink[]>;
  setPracticeAreas(input: SetLawyerPracticeAreasInput): Promise<void>;
  setLanguages(input: SetLawyerLanguagesInput): Promise<void>;
}
