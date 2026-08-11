import type { AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { NotificationRepository } from "@/domain/repositories/trust-repository";
import type {
  ClientProfileRepository,
  LawyerCredentialRepository,
  LawyerProfileRepository,
} from "@/domain/repositories/profile-repository";
import type { TermsAcceptanceRepository } from "@/domain/repositories/terms-acceptance-repository";
import type { TenantRepository } from "@/domain/repositories/tenant-repository";
import type { UserRepository } from "@/domain/repositories/user-repository";

/**
 * Repository set available inside an atomic unit of work.
 * Settings reads may happen outside the transaction.
 */
export type UnitOfWorkRepositories = {
  userRepository: UserRepository;
  tenantRepository: TenantRepository;
  clientProfileRepository: ClientProfileRepository;
  lawyerProfileRepository: LawyerProfileRepository;
  lawyerCredentialRepository: LawyerCredentialRepository;
  termsAcceptanceRepository: TermsAcceptanceRepository;
  bookingRepository: BookingRepository;
  auditLogRepository: AuditLogRepository;
  notificationRepository: NotificationRepository;
};

export interface UnitOfWork {
  runInTransaction<T>(
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
  ): Promise<T>;
}
