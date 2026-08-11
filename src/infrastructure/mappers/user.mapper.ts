import type { User } from "@/domain/entities/user";
import type { UserRole, UserStatus } from "@/domain/enums";

type UserRecord = {
  id: string;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
  role: string;
  status: string;
  preferredLanguage: string;
  /** Optional: omitted from default userSelect so app can deploy before migrate. */
  personalTenantId?: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    emailVerified: record.emailVerified,
    name: record.name,
    image: record.image,
    role: record.role as UserRole,
    status: record.status as UserStatus,
    preferredLanguage: record.preferredLanguage,
    // Wave 1: default reads omit the column (migration-safe). Load via tenant paths when needed.
    personalTenantId: record.personalTenantId ?? null,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Default user projection intentionally omits `personalTenantId` so an app
 * deploy before/without `foundation_tenant_v1` does not break login/session
 * user SELECTs. Tenant ensure/list paths select the column explicitly.
 */
export const userSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  image: true,
  role: true,
  status: true,
  preferredLanguage: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
