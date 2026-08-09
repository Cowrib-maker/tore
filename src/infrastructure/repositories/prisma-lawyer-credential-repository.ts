import type {
  LawyerCredential,
  ReviewLawyerCredentialInput,
  SubmitLawyerCredentialInput,
} from "@/domain/entities/profile";
import { CredentialReviewStatus } from "@/domain/enums";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";
import {
  lawyerCredentialSelect,
  mapLawyerCredential,
} from "@/infrastructure/mappers/lawyer-credential.mapper";

export class PrismaLawyerCredentialRepository
  implements LawyerCredentialRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async findById(id: string): Promise<LawyerCredential | null> {
    const record = await this.db.lawyerCredential.findUnique({
      where: { id },
      select: lawyerCredentialSelect,
    });
    return record ? mapLawyerCredential(record) : null;
  }

  async findByLawyerProfileId(
    lawyerProfileId: string,
  ): Promise<LawyerCredential[]> {
    const records = await this.db.lawyerCredential.findMany({
      where: { lawyerProfileId },
      orderBy: { submittedAt: "desc" },
      select: lawyerCredentialSelect,
    });
    return records.map(mapLawyerCredential);
  }

  async findPendingReview(): Promise<LawyerCredential[]> {
    const records = await this.db.lawyerCredential.findMany({
      where: { status: CredentialReviewStatus.SUBMITTED },
      orderBy: { submittedAt: "asc" },
      select: lawyerCredentialSelect,
    });
    return records.map(mapLawyerCredential);
  }

  async create(input: SubmitLawyerCredentialInput): Promise<LawyerCredential> {
    const record = await this.db.lawyerCredential.create({
      data: {
        lawyerProfileId: input.lawyerProfileId,
        licenseNumber: input.licenseNumber,
        issuingAuthority: input.issuingAuthority,
        documentUrl: input.documentUrl,
        documentFileName: input.documentFileName,
        status: CredentialReviewStatus.SUBMITTED,
      },
      select: lawyerCredentialSelect,
    });
    return mapLawyerCredential(record);
  }

  async review(
    id: string,
    input: ReviewLawyerCredentialInput,
  ): Promise<LawyerCredential> {
    const record = await this.db.lawyerCredential.update({
      where: { id },
      data: {
        status: input.status,
        rejectionReason: input.rejectionReason ?? null,
        reviewedByUserId: input.reviewedByUserId,
        reviewedAt: new Date(),
      },
      select: lawyerCredentialSelect,
    });
    return mapLawyerCredential(record);
  }
}

export const lawyerCredentialRepository = new PrismaLawyerCredentialRepository();
