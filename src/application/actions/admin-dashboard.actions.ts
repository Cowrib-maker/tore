"use server";

import { requireActor } from "@/application/common/require-actor";
import { getAdminDashboardOverviewUseCase } from "@/application/use-cases/admin/dashboard-overview";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  bookingRepository,
  lawyerCredentialRepository,
  userRepository,
} from "@/infrastructure/repositories";

export async function getAdminDashboardOverview() {
  const actor = await requireActor(UserRole.ADMIN);
  return getAdminDashboardOverviewUseCase(actor, {
    userRepository,
    lawyerCredentialRepository,
    bookingRepository,
    auditLogRepository,
  });
}
