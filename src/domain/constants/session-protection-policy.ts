/**
 * Configurable anti-account-sharing thresholds.
 *
 * Defaults match the SOLO product policy. Override via the
 * `session_protection_policy` platform setting (JSON merge).
 *
 * Device != seat. Multiple legitimate devices for one lawyer are allowed.
 */
export type SessionProtectionPolicy = {
  maxNormalConcurrentSessions: number;
  warningThreshold: number;
  suspiciousThreshold: number;
  activeIdleMinutes: number;
  distinctDeviceWindowHours: number;
  distinctDeviceWarningCount: number;
  rapidSwitchWindowMinutes: number;
  rapidSwitchDeviceCount: number;
  velocityWindowSeconds: number;
  velocitySuspiciousCount: number;
  simultaneousWindowSeconds: number;
  simultaneousMinSessions: number;
  highRiskMinScore: number;
  highRiskMinSignalFamilies: number;
  restrictExpensiveOpsOnHighRisk: boolean;
};

export const DEFAULT_SESSION_PROTECTION_POLICY: SessionProtectionPolicy = {
  maxNormalConcurrentSessions: 2,
  warningThreshold: 3,
  suspiciousThreshold: 4,
  activeIdleMinutes: 60,
  distinctDeviceWindowHours: 24,
  distinctDeviceWarningCount: 5,
  rapidSwitchWindowMinutes: 10,
  rapidSwitchDeviceCount: 4,
  velocityWindowSeconds: 60,
  velocitySuspiciousCount: 40,
  simultaneousWindowSeconds: 8,
  simultaneousMinSessions: 3,
  highRiskMinScore: 4,
  highRiskMinSignalFamilies: 2,
  restrictExpensiveOpsOnHighRisk: true,
};

const INTEGER_KEYS = [
  "maxNormalConcurrentSessions",
  "warningThreshold",
  "suspiciousThreshold",
  "activeIdleMinutes",
  "distinctDeviceWindowHours",
  "distinctDeviceWarningCount",
  "rapidSwitchWindowMinutes",
  "rapidSwitchDeviceCount",
  "velocityWindowSeconds",
  "velocitySuspiciousCount",
  "simultaneousWindowSeconds",
  "simultaneousMinSessions",
  "highRiskMinScore",
  "highRiskMinSignalFamilies",
] as const satisfies readonly (keyof SessionProtectionPolicy)[];

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
}

/**
 * Merge a JSON override onto defaults. Invalid or partial input never throws;
 * unknown keys are ignored. Result is always a complete policy object.
 */
export function parseSessionProtectionPolicy(
  raw: string | null | undefined,
): SessionProtectionPolicy {
  const defaults = DEFAULT_SESSION_PROTECTION_POLICY;
  if (!raw || raw.trim().length === 0) {
    return { ...defaults };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ...defaults };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ...defaults };
  }

  const input = parsed as Record<string, unknown>;
  const next: SessionProtectionPolicy = { ...defaults };

  for (const key of INTEGER_KEYS) {
    if (key in input) {
      next[key] = asPositiveInt(input[key], defaults[key]);
    }
  }

  if ("restrictExpensiveOpsOnHighRisk" in input) {
    const value = input.restrictExpensiveOpsOnHighRisk;
    if (typeof value === "boolean") {
      next.restrictExpensiveOpsOnHighRisk = value;
    } else if (value === "1" || value === "true") {
      next.restrictExpensiveOpsOnHighRisk = true;
    } else if (value === "0" || value === "false") {
      next.restrictExpensiveOpsOnHighRisk = false;
    }
  }

  return next;
}
