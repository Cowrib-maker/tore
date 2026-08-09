import type {
  AcceptTermsInput,
  TermsAcceptance,
  TermsBundleInput,
} from "@/domain/entities/terms-acceptance";
import type { TermsAcceptanceRepository } from "@/domain/repositories/terms-acceptance-repository";
import { TermsType } from "@/domain/enums";
import { mapTermsAcceptance } from "@/infrastructure/mappers/terms-acceptance.mapper";
import { prisma } from "@/infrastructure/database/prisma";

export class PrismaTermsAcceptanceRepository implements TermsAcceptanceRepository {
  async create(input: AcceptTermsInput): Promise<TermsAcceptance> {
    const record = await prisma.termsAcceptance.create({
      data: {
        userId: input.userId,
        termsType: input.termsType,
        termsVersion: input.termsVersion,
        ipAddress: input.ipAddress,
      },
    });
    return mapTermsAcceptance(record);
  }

  async createBundle(input: TermsBundleInput): Promise<TermsAcceptance[]> {
    const records = await prisma.$transaction([
      prisma.termsAcceptance.create({
        data: {
          userId: input.userId,
          termsType: TermsType.TERMS_OF_SERVICE,
          termsVersion: input.termsVersion,
          ipAddress: input.ipAddress,
        },
      }),
      prisma.termsAcceptance.create({
        data: {
          userId: input.userId,
          termsType: TermsType.PRIVACY_POLICY,
          termsVersion: input.privacyVersion,
          ipAddress: input.ipAddress,
        },
      }),
      prisma.termsAcceptance.create({
        data: {
          userId: input.userId,
          termsType: TermsType.MARKETPLACE_DISCLAIMER,
          termsVersion: input.marketplaceDisclaimerVersion,
          ipAddress: input.ipAddress,
        },
      }),
    ]);

    return records.map(mapTermsAcceptance);
  }

  async hasAccepted(
    userId: string,
    termsType: TermsType,
    termsVersion: string,
  ): Promise<boolean> {
    const record = await prisma.termsAcceptance.findUnique({
      where: {
        userId_termsType_termsVersion: {
          userId,
          termsType,
          termsVersion,
        },
      },
    });
    return record !== null;
  }
}

export const termsAcceptanceRepository = new PrismaTermsAcceptanceRepository();
