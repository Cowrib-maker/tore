import type { TenantKind, TenantStatus } from "@/domain/enums";

export interface Tenant {
  id: string;
  kind: TenantKind;
  status: TenantStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
