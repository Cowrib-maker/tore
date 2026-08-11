import type { Tenant } from "@/domain/entities/tenant";
import type { TenantKind, TenantStatus } from "@/domain/enums";

type TenantRecord = {
  id: string;
  kind: string;
  status: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapTenant(record: TenantRecord): Tenant {
  return {
    id: record.id,
    kind: record.kind as TenantKind,
    status: record.status as TenantStatus,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const tenantSelect = {
  id: true,
  kind: true,
  status: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
