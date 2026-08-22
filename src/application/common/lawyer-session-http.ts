import { getClientIp } from "@/application/common/client-ip";
import {
  DEVICE_SESSION_COOKIE,
  deviceSessionCookieOptions,
} from "@/application/common/device-session-cookie";
import { hashIpAddress } from "@/application/common/hash-ip";
import type { DeviceSessionRepository } from "@/domain/repositories/device-session-repository";
import type { EntitlementUsageRepository } from "@/domain/repositories/entitlement-usage-repository";
import type { InvoiceRepository } from "@/domain/repositories/invoice-repository";
import type { PlatformSettingRepository } from "@/domain/repositories/platform-setting-repository";
import type { SubscriptionRepository } from "@/domain/repositories/subscription-repository";
import { deviceSessionRepository } from "@/infrastructure/repositories/prisma-device-session-repository";
import { entitlementUsageRepository } from "@/infrastructure/repositories/prisma-entitlement-usage-repository";
import { invoiceRepository } from "@/infrastructure/repositories/prisma-invoice-repository";
import { platformSettingRepository } from "@/infrastructure/repositories/prisma-platform-setting-repository";
import { subscriptionRepository } from "@/infrastructure/repositories/prisma-subscription-repository";
import { env } from "@/lib/env";
import { cookies, headers } from "next/headers";

export type LawyerSessionHttpContext = {
  sessionIdFromCookie: string | null;
  userAgent: string | null;
  ipHash: string | null;
};

export function lawyerEntitlementDeps(): {
  subscriptionRepository: SubscriptionRepository;
  deviceSessionRepository: DeviceSessionRepository;
  entitlementUsageRepository: EntitlementUsageRepository;
  platformSettingRepository: PlatformSettingRepository;
  invoiceRepository: InvoiceRepository;
} {
  return {
    subscriptionRepository,
    deviceSessionRepository,
    entitlementUsageRepository,
    platformSettingRepository,
    invoiceRepository,
  };
}

export async function readLawyerSessionHttpContext(): Promise<LawyerSessionHttpContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const ip = await getClientIp();
  return {
    sessionIdFromCookie:
      cookieStore.get(DEVICE_SESSION_COOKIE)?.value?.trim() || null,
    userAgent: headerStore.get("user-agent"),
    ipHash: hashIpAddress(ip, env.AUTH_SECRET),
  };
}

export async function persistDeviceSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    DEVICE_SESSION_COOKIE,
    sessionId,
    deviceSessionCookieOptions(env.NODE_ENV === "production"),
  );
}
