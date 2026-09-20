import type { ActorContext } from "@/application/common/actor-context";
import { sanitizeAuditMetadata } from "@/application/common/sanitize-audit-metadata";
import type { BookingStatus } from "@/domain/enums";
import { UserRole } from "@/domain/enums";
import { ForbiddenError } from "@/domain/errors/domain-error";
import type { AuditLogListItem, AuditLogRepository } from "@/domain/repositories/audit-log-repository";
import type { BookingRepository } from "@/domain/repositories/booking-repository";
import type { LawyerCredentialRepository } from "@/domain/repositories/profile-repository";
import type {
  PlatformUserCounts,
  UserRepository,
} from "@/domain/repositories/user-repository";

const RECENT_ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY_PREVIEW_SIZE = 5;

export type AdminDashboardOverview = {
  userCounts: PlatformUserCounts;
  pendingVerifications: number;
  bookingCounts: Record<BookingStatus, number>;
  recentActivity: {
    /** Most recent entries, newest first, capped for a compact widget. */
    items: AuditLogListItem[];
    /** Count of audit entries in the last 24 hours (not capped by `items`). */
    last24hCount: number;
  };
};

export type AdminDashboardOverviewDeps = {
  userRepository: UserRepository;
  lawyerCredentialRepository: LawyerCredentialRepository;
  bookingRepository: BookingRepository;
  auditLogRepository: AuditLogRepository;
};

export async function getAdminDashboardOverviewUseCase(
  actor: ActorContext,
  deps: AdminDashboardOverviewDeps,
  now: Date = new Date(),
): Promise<AdminDashboardOverview> {
  if (actor.role !== UserRole.ADMIN) {
    throw new ForbiddenError();
  }

  const since = new Date(now.getTime() - RECENT_ACTIVITY_WINDOW_MS);

  const [userCounts, pending, bookingCounts, recent] = await Promise.all([
    deps.userRepository.getPlatformUserCounts(),
    deps.lawyerCredentialRepository.findPendingReview(),
    deps.bookingRepository.countByStatus(),
    deps.auditLogRepository.list({
      limit: RECENT_ACTIVITY_PREVIEW_SIZE,
      offset: 0,
      dateFrom: since,
    }),
  ]);

  return {
    userCounts,
    pendingVerifications: pending.items.length,
    bookingCounts,
    recentActivity: {
      items: recent.items.map((item) => ({
        ...item,
        metadata: sanitizeAuditMetadata(item.metadata),
      })),
      last24hCount: recent.total,
    },
  };
}
