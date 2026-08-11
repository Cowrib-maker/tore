import type {
  Organization,
  OrganizationMembership,
} from "@/domain/entities/organization";
import type {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  OrganizationType,
} from "@/domain/enums";

type OrganizationRecord = {
  id: string;
  type: string;
  name: string;
  status: string;
  tenantId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MembershipRecord = {
  id: string;
  organizationId: string;
  userId: string;
  orgRole: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function mapOrganization(record: OrganizationRecord): Organization {
  return {
    id: record.id,
    type: record.type as OrganizationType,
    name: record.name,
    status: record.status as OrganizationStatus,
    tenantId: record.tenantId,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function mapOrganizationMembership(
  record: MembershipRecord,
): OrganizationMembership {
  return {
    id: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    orgRole: record.orgRole as OrganizationRole,
    status: record.status as OrganizationMembershipStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const organizationSelect = {
  id: true,
  type: true,
  name: true,
  status: true,
  tenantId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const organizationMembershipSelect = {
  id: true,
  organizationId: true,
  userId: true,
  orgRole: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;
