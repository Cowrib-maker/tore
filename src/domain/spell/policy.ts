/**
 * Business knobs for Spell licensing. Loaded from server configuration
 * (`infrastructure/spell/spell-config.ts`) and injected into use-cases —
 * never read from the client and never hard-coded in the desktop app.
 */
export type SpellPolicy = {
  /** Days after issuance within which an unactivated license must be redeemed. */
  redeemByDays: number;
  /** Minimum time between device changes (self-service). Admin can reset it. */
  transferCooldownDays: number;
  /** Desktop client should re-validate after this long. */
  tokenRefreshIntervalSeconds: number;
  /** Hard ceiling on offline use of one signed token. */
  tokenMaxOfflineSeconds: number;
  /** Accepted clock skew on signed device requests. */
  requestSkewSeconds: number;
  /** Failed code attempts allowed per window before lockout. */
  maxFailedCodeAttempts: number;
  failedCodeAttemptWindowSeconds: number;
};

export const DEFAULT_SPELL_POLICY: SpellPolicy = {
  redeemByDays: 90,
  transferCooldownDays: 30,
  tokenRefreshIntervalSeconds: 12 * 60 * 60,
  tokenMaxOfflineSeconds: 24 * 60 * 60,
  requestSkewSeconds: 5 * 60,
  maxFailedCodeAttempts: 10,
  failedCodeAttemptWindowSeconds: 15 * 60,
};

/** Guard rails so a typo in config cannot silently weaken revocation. */
export const SPELL_POLICY_LIMITS = {
  tokenMaxOfflineSeconds: { min: 60 * 60, max: 7 * 24 * 60 * 60 },
  tokenRefreshIntervalSeconds: { min: 5 * 60 },
  requestSkewSeconds: { min: 30, max: 15 * 60 },
} as const;

export function validateSpellPolicy(policy: SpellPolicy): string[] {
  const problems: string[] = [];
  const l = SPELL_POLICY_LIMITS;
  const positiveInts: (keyof SpellPolicy)[] = [
    "redeemByDays",
    "transferCooldownDays",
    "tokenRefreshIntervalSeconds",
    "tokenMaxOfflineSeconds",
    "requestSkewSeconds",
    "maxFailedCodeAttempts",
    "failedCodeAttemptWindowSeconds",
  ];
  for (const key of positiveInts) {
    const v = policy[key];
    if (!Number.isInteger(v) || v < 0) {
      problems.push(`${key} must be a non-negative integer`);
    }
  }
  if (policy.redeemByDays < 1) problems.push("redeemByDays must be >= 1");
  if (
    policy.tokenMaxOfflineSeconds < l.tokenMaxOfflineSeconds.min ||
    policy.tokenMaxOfflineSeconds > l.tokenMaxOfflineSeconds.max
  ) {
    problems.push("tokenMaxOfflineSeconds is outside the allowed 1h..7d range");
  }
  if (policy.tokenRefreshIntervalSeconds < l.tokenRefreshIntervalSeconds.min) {
    problems.push("tokenRefreshIntervalSeconds must be >= 300");
  }
  if (policy.tokenRefreshIntervalSeconds >= policy.tokenMaxOfflineSeconds) {
    problems.push(
      "tokenRefreshIntervalSeconds must be shorter than tokenMaxOfflineSeconds",
    );
  }
  if (
    policy.requestSkewSeconds < l.requestSkewSeconds.min ||
    policy.requestSkewSeconds > l.requestSkewSeconds.max
  ) {
    problems.push("requestSkewSeconds is outside the allowed 30s..15m range");
  }
  if (policy.maxFailedCodeAttempts < 1) {
    problems.push("maxFailedCodeAttempts must be >= 1");
  }
  return problems;
}
