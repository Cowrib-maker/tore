import type {
  UnitOfWork,
  UnitOfWorkRepositories,
} from "@/domain/ports/unit-of-work";
import { prisma } from "@/infrastructure/database/prisma";
import { PrismaAuditLogRepository } from "@/infrastructure/repositories/prisma-audit-log-repository";
import { PrismaClientProfileRepository } from "@/infrastructure/repositories/prisma-client-profile-repository";
import { PrismaLawyerProfileRepository } from "@/infrastructure/repositories/prisma-lawyer-profile-repository";
import { PrismaTermsAcceptanceRepository } from "@/infrastructure/repositories/prisma-terms-acceptance-repository";
import { PrismaUserRepository } from "@/infrastructure/repositories/prisma-user-repository";

export class PrismaUnitOfWork implements UnitOfWork {
  async runInTransaction<T>(
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      const repos: UnitOfWorkRepositories = {
        userRepository: new PrismaUserRepository(tx),
        clientProfileRepository: new PrismaClientProfileRepository(tx),
        lawyerProfileRepository: new PrismaLawyerProfileRepository(tx),
        termsAcceptanceRepository: new PrismaTermsAcceptanceRepository(tx),
        auditLogRepository: new PrismaAuditLogRepository(tx),
      };
      return work(repos);
    });
  }
}

export const unitOfWork = new PrismaUnitOfWork();
