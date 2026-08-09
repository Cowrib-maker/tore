import type { ConsultationOffering } from "@/domain/entities/consultation-offering";
import type { ConsultationModality } from "@/domain/enums";

type OfferingRecord = {
  id: string;
  lawyerProfileId: string;
  titleMn: string;
  titleEn: string | null;
  descriptionMn: string | null;
  durationMinutes: number;
  priceMnt: number;
  modality: string;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapConsultationOffering(
  record: OfferingRecord,
): ConsultationOffering {
  return {
    id: record.id,
    lawyerProfileId: record.lawyerProfileId,
    titleMn: record.titleMn,
    titleEn: record.titleEn,
    descriptionMn: record.descriptionMn,
    durationMinutes: record.durationMinutes,
    priceMnt: record.priceMnt,
    modality: record.modality as ConsultationModality,
    isActive: record.isActive,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const consultationOfferingSelect = {
  id: true,
  lawyerProfileId: true,
  titleMn: true,
  titleEn: true,
  descriptionMn: true,
  durationMinutes: true,
  priceMnt: true,
  modality: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
