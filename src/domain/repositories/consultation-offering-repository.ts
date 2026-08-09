import type {
  ConsultationOffering,
  CreateConsultationOfferingInput,
  UpdateConsultationOfferingInput,
} from "@/domain/entities/consultation-offering";

export interface ConsultationOfferingRepository {
  findById(id: string): Promise<ConsultationOffering | null>;
  findByLawyerProfileId(lawyerProfileId: string): Promise<ConsultationOffering[]>;
  findActiveByLawyerProfileId(lawyerProfileId: string): Promise<ConsultationOffering[]>;
  create(input: CreateConsultationOfferingInput): Promise<ConsultationOffering>;
  update(
    id: string,
    input: UpdateConsultationOfferingInput,
  ): Promise<ConsultationOffering>;
  softDelete(id: string): Promise<void>;
}
