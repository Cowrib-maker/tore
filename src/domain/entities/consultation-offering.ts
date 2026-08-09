import type { ConsultationModality } from "@/domain/enums";

export interface ConsultationOffering {
  id: string;
  lawyerProfileId: string;
  titleMn: string;
  titleEn: string | null;
  descriptionMn: string | null;
  durationMinutes: number;
  priceMnt: number;
  modality: ConsultationModality;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConsultationOfferingInput {
  lawyerProfileId: string;
  titleMn: string;
  titleEn?: string;
  descriptionMn?: string;
  durationMinutes: number;
  priceMnt: number;
  modality: ConsultationModality;
}

export interface UpdateConsultationOfferingInput {
  titleMn?: string;
  titleEn?: string | null;
  descriptionMn?: string | null;
  durationMinutes?: number;
  priceMnt?: number;
  modality?: ConsultationModality;
  isActive?: boolean;
}
