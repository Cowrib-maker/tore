import type {
  LawyerCredential,
  ReviewLawyerCredentialInput,
  SubmitLawyerCredentialInput,
} from "@/domain/entities/profile";
import { CredentialReviewStatus } from "@/domain/enums";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import type { ListPage, ListPageOptions } from "@/application/common/list-page";
import { resolveTake } from "@/application/common/list-page";
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

  async findPendingReview(
    options?: ListPageOptions,
  ): Promise<ListPage<LawyerCredential>> {
    const take = resolveTake(options);
    const records = await this.db.lawyerCredential.findMany({
      where: { status: CredentialReviewStatus.SUBMITTED },
      take: take + 1,
      ...(options?.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      select: lawyerCredentialSelect,
    });
    const hasMore = records.length > take;
    const page = hasMore ? records.slice(0, take) : records;
    return {
      items: page.map(mapLawyerCredential),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
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
