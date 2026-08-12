import type { UserRole } from "@/domain/enums";
import type { ActiveContextType, OrganizationRole } from "@/domain/enums";

/**
 * Marketplace / existing authz actor.
 * Unchanged — do not require tenant fields on marketplace use-cases.
 */
export type ActorContext = {
  userId: string;
  role: UserRole;
};

/**
 * Tenant-aware Active Context for future Matter / Workspace / Document / AI.
 * Resolved server-side from trusted actor + membership + tenant relations.
 * Never trust client-supplied tenantId / membershipId as authoritative.
 */
export type ActiveContext = ActorContext & {
  contextType: ActiveContextType;
  /** Tenant under which future tenant-owned work will be created. */
  tenantId: string;
  organizationId?: string;
  membershipId?: string;
  orgRole?: OrganizationRole;
};

/**
 * Cookie / UI selection hint only — not an authorization grant.
 * Full ActiveContext must always be re-resolved server-side.
 */
export type ActiveContextSelection =
  | { type: ActiveContextType.PERSONAL }
  | { type: ActiveContextType.ORGANIZATION; organizationId: string };
