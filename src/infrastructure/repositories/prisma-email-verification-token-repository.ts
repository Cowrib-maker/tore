import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationToken,
  EmailVerificationTokenRepository,
} from "@/domain/repositories/email-verification-token-repository";
import {
  getPrismaClient,
  type PrismaDbClient,
} from "@/infrastructure/database/prisma-client";

export class PrismaEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
  constructor(private readonly db: PrismaDbClient = getPrismaClient()) {}

  async replaceForIdentifier(
    input: CreateEmailVerificationTokenInput,
  ): Promise<void> {
    await this.db.$transaction([
      this.db.verificationToken.deleteMany({
        where: { identifier: input.identifier },
      }),
      this.db.verificationToken.create({
        data: {
          identifier: input.identifier,
          token: input.tokenHash,
          expires: input.expires,
        },
      }),
    ]);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<EmailVerificationToken | null> {
    const record = await this.db.verificationToken.findFirst({
      where: { token: tokenHash },
    });
    if (!record) return null;
    return {
      identifier: record.identifier,
      tokenHash: record.token,
      expires: record.expires,
    };
  }

  async findByIdentifier(
    identifier: string,
  ): Promise<EmailVerificationToken | null> {
    const record = await this.db.verificationToken.findFirst({
      where: { identifier },
      orderBy: { expires: "desc" },
    });
    if (!record) return null;
    return {
      identifier: record.identifier,
      tokenHash: record.token,
      expires: record.expires,
    };
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.verificationToken.deleteMany({
      where: { token: tokenHash },
    });
  }

  async deleteForIdentifier(identifier: string): Promise<void> {
    await this.db.verificationToken.deleteMany({
      where: { identifier },
    });
  }
}

export const emailVerificationTokenRepository =
  new PrismaEmailVerificationTokenRepository();
