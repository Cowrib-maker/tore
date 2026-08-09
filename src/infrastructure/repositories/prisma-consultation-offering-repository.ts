import type {
  ConsultationOffering,
  CreateConsultationOfferingInput,
  UpdateConsultationOfferingInput,
} from "@/domain/entities/consultation-offering";
import type { ConsultationOfferingRepository } from "@/domain/repositories/consultation-offering-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  consultationOfferingSelect,
  mapConsultationOffering,
} from "@/infrastructure/mappers/consultation-offering.mapper";

export class PrismaConsultationOfferingRepository
  implements ConsultationOfferingRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<ConsultationOffering | null> {
    const record = await this.db.consultationOffering.findFirst({
      where: { id, deletedAt: null },
      select: consultationOfferingSelect,
    });
    return record ? mapConsultationOffering(record) : null;
  }

  async findByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<ConsultationOffering[]> {
    const records = await this.db.consultationOffering.findMany({
      where: { lawyerProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: consultationOfferingSelect,
    });
    return records.map(mapConsultationOffering);
  }

  async findActiveByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<ConsultationOffering[]> {
    const records = await this.db.consultationOffering.findMany({
      where: { lawyerProfileId, deletedAt: null, isActive: true },
      orderBy: { priceMnt: "asc" },
      select: consultationOfferingSelect,
    });
    return records.map(mapConsultationOffering);
  }

  async findActiveByLawyerProfileIds(
    lawyerProfileIds: string[],
  ): Promise<ConsultationOffering[]> {
    if (lawyerProfileIds.length === 0) return [];
    const records = await this.db.consultationOffering.findMany({
      where: {
        lawyerProfileId: { in: lawyerProfileIds },
        deletedAt: null,
        isActive: true,
      },
      orderBy: { priceMnt: "asc" },
      select: consultationOfferingSelect,
    });
    return records.map(mapConsultationOffering);
  }

  async create(
    input: CreateConsultationOfferingInput,
  ): Promise<ConsultationOffering> {
    const record = await this.db.consultationOffering.create({
      data: {
        lawyerProfileId: input.lawyerProfileId,
        titleMn: input.titleMn,
        titleEn: input.titleEn,
        descriptionMn: input.descriptionMn,
        durationMinutes: input.durationMinutes,
        priceMnt: input.priceMnt,
        modality: input.modality,
        isActive: true,
      },
      select: consultationOfferingSelect,
    });
    return mapConsultationOffering(record);
  }

  async update(
    id: string,
    input: UpdateConsultationOfferingInput,
  ): Promise<ConsultationOffering> {
    const record = await this.db.consultationOffering.update({
      where: { id },
      data: {
        titleMn: input.titleMn,
        titleEn: input.titleEn,
        descriptionMn: input.descriptionMn,
        durationMinutes: input.durationMinutes,
        priceMnt: input.priceMnt,
        modality: input.modality,
        isActive: input.isActive,
      },
      select: consultationOfferingSelect,
    });
    return mapConsultationOffering(record);
  }

  async softDelete(id: string): Promise<void> {
    await this.db.consultationOffering.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}

export const consultationOfferingRepository =
  new PrismaConsultationOfferingRepository();
