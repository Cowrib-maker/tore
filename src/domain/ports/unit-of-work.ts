import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type {
  ClientProfileRepository,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import type { TermsAcceptanceRepository } from "@/domain/repositories/terms-acceptance-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

/**
 * Repository set available inside an atomic unit of work.
 * Settings reads may happen outside the transaction.
 */
export type UnitOfWorkRepositories = {
  userRepository: UserRepository;
  clientProfileRepository: ClientProfileRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  termsAcceptanceRepository: TermsAcceptanceRepository;
  auditLogRepository: AuditLogRepository;
};

export interface UnitOfWork {
  runInTransaction<T>(
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
  ): Promise<T>;
}
