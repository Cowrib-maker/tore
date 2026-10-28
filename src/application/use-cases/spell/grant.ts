import type { IssuedSpellToken } from "@/domain/ports/spell-security";
import type { SpellLicense } from "@/domain/spell/entities";
import type { SpellPolicy } from "@/domain/spell/policy";

export type SpellGrantStatus =
  | "ACTIVATED"
  | "ALREADY_ACTIVE"
  | "TRANSFERRED"
  | "VALID";

/** What the desktop client receives after a successful activate/validate. */
export type SpellGrant = {
  status: SpellGrantStatus;
  activationId: string;
  token: string;
  /** Hard offline limit of this token. */
  tokenValidUntil: string;
  /** Client should re-validate at or before this time. */
  refreshAfter: string;
  license: {
    id: string;
    planCode: string;
    startsAt: string;
    expiresAt: string;
  };
  /** Server policy, so the client never hard-codes intervals. */
  policy: {
    refreshIntervalSeconds: number;
    maxOfflineSeconds: number;
  };
  serverTime: string;
};

export function buildGrant(input: {
  status: SpellGrantStatus;
  activationId: string;
  license: Pick<SpellLicense, "id" | "planCode">;
  startsAt: Date;
  expiresAt: Date;
  issued: IssuedSpellToken;
  policy: SpellPolicy;
  now: Date;
}): SpellGrant {
  return {
    status: input.status,
    activationId: input.activationId,
    token: input.issued.token,
    tokenValidUntil: input.issued.validUntil.toISOString(),
    refreshAfter: input.issued.refreshAfter.toISOString(),
    license: {
      id: input.license.id,
      planCode: input.license.planCode,
      startsAt: input.startsAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
    },
    policy: {
      refreshIntervalSeconds: input.policy.tokenRefreshIntervalSeconds,
      maxOfflineSeconds: input.policy.tokenMaxOfflineSeconds,
    },
    serverTime: input.now.toISOString(),
  };
}
