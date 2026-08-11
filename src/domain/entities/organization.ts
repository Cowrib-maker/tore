import type {
  OrganizationRole,
  OrganizationMembershipStatus,
  OrganizationStatus,
  OrganizationType,
  UserRole,
} from "@/domain/enums";

export interface Organization {
  id: string;
  type: OrganizationType;
  name: string;
  status: OrganizationStatus;
  tenantId: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  orgRole: OrganizationRole;
  status: OrganizationMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate create input — includes actor context so the repository
 * enforces the create authorization matrix (no bypass).
 */
export type CreateOrganizationWithFoundingOwnerInput = {
  actorUserId: string;
  actorRole: UserRole;
  type: OrganizationType;
  name: string;
  /** Admin-only: designate founding OWNER as another User. */
  foundingOwnerUserId?: string;
};
