import type { LanguageProficiency } from "@/domain/enums";

export interface PracticeArea {
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
}

export interface Language {
  id: string;
  code: string;
  nameMn: string;
  nameEn: string;
  isActive: boolean;
}

export interface LawyerPracticeAreaLink {
  lawyerProfileId: string;
  practiceAreaId: string;
  createdAt: Date;
}

export interface LawyerLanguageLink {
  lawyerProfileId: string;
  languageId: string;
  proficiency: LanguageProficiency | null;
  createdAt: Date;
}

export interface SetLawyerPracticeAreasInput {
  lawyerProfileId: string;
  practiceAreaIds: string[];
}

export interface SetLawyerLanguagesInput {
  lawyerProfileId: string;
  languages: Array<{
    languageId: string;
    proficiency?: LanguageProficiency;
  }>;
}
