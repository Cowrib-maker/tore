import { AccountSharingRiskState, DeviceSessionStatus } from "@/domain/enums";
import type { SessionProtectionPolicy } from "@/domain/constants/session-protection-policy";
import type { DeviceSession } from "@/domain/entities/subscription";

/**
 * Signal families used by AccountSharingRisk.
 * Concurrent warning/suspicious are one family so a single concurrent spike
 * is never treated as proof of sharing by itself.
 */
export const RISK_SIGNAL_FAMILIES = {
  CONCURRENT: "CONCURRENT",
  MANY_DEVICES: "MANY_DEVICES",
  RAPID_SWITCHING: "RAPID_SWITCHING",
  HIGH_VELOCITY: "HIGH_VELOCITY",
  SIMULTANEOUS_ACTIVITY: "SIMULTANEOUS_ACTIVITY",
} as const;

export type RiskSignalFamily =
  (typeof RISK_SIGNAL_FAMILIES)[keyof typeof RISK_SIGNAL_FAMILIES];

export type RiskSignalId =
  | "CONCURRENT_WARNING"
  | "CONCURRENT_SUSPICIOUS"
  | "MANY_DEVICES"
  | "RAPID_SWITCHING"
  | "HIGH_VELOCITY"
  | "SIMULTANEOUS_ACTIVITY";

export type AccountSharingRiskInput = {
  now: Date;
  policy: SessionProtectionPolicy;
  sessions: readonly DeviceSession[];
};

export type AccountSharingRiskResult = {
  state: AccountSharingRiskState;
  score: number;
  signals: RiskSignalId[];
  signalFamilies: RiskSignalFamily[];
  concurrentActiveSessions: number;
  distinctDevicesInWindow: number;
};

const SIGNAL_POINTS: Record<RiskSignalId, number> = {
  CONCURRENT_WARNING: 1,
  CONCURRENT_SUSPICIOUS: 2,
  MANY_DEVICES: 1,
  RAPID_SWITCHING: 2,
  HIGH_VELOCITY: 1,
  SIMULTANEOUS_ACTIVITY: 2,
};

const SIGNAL_FAMILY: Record<RiskSignalId, RiskSignalFamily> = {
  CONCURRENT_WARNING: RISK_SIGNAL_FAMILIES.CONCURRENT,
  CONCURRENT_SUSPICIOUS: RISK_SIGNAL_FAMILIES.CONCURRENT,
  MANY_DEVICES: RISK_SIGNAL_FAMILIES.MANY_DEVICES,
  RAPID_SWITCHING: RISK_SIGNAL_FAMILIES.RAPID_SWITCHING,
  HIGH_VELOCITY: RISK_SIGNAL_FAMILIES.HIGH_VELOCITY,
  SIMULTANEOUS_ACTIVITY: RISK_SIGNAL_FAMILIES.SIMULTANEOUS_ACTIVITY,
};

function minutesMs(minutes: number): number {
  return minutes * 60_000;
}

function hoursMs(hours: number): number {
  return hours * 60 * 60_000;
}

function secondsMs(seconds: number): number {
  return seconds * 1000;
}

function isActive(session: DeviceSession): boolean {
  return session.status === DeviceSessionStatus.ACTIVE && session.revokedAt === null;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

/**
 * Deterministic, auditable account-sharing risk evaluation.
 * A single signal family is never enough for HIGH_RISK.
 */
export function evaluateAccountSharingRisk(
  input: AccountSharingRiskInput,
): AccountSharingRiskResult {
  const { now, policy } = input;
  const active = input.sessions.filter(isActive);
  const idleCutoff = new Date(now.getTime() - minutesMs(policy.activeIdleMinutes));
  const concurrent = active.filter((session) => session.lastSeenAt >= idleCutoff);

  const deviceWindowStart = new Date(
    now.getTime() - hoursMs(policy.distinctDeviceWindowHours),
  );
  const distinctDevicesInWindow = active.filter(
    (session) => session.firstSeenAt >= deviceWindowStart,
  ).length;

  const rapidWindowStart = new Date(
    now.getTime() - minutesMs(policy.rapidSwitchWindowMinutes),
  );
  const rapidSwitchCount = active.filter(
    (session) => session.firstSeenAt >= rapidWindowStart,
  ).length;

  const velocityWindowStart = new Date(
    now.getTime() - secondsMs(policy.velocityWindowSeconds),
  );
  const velocity = active.reduce((sum, session) => {
    if (
      !session.requestCountWindowStart ||
      session.requestCountWindowStart < velocityWindowStart
    ) {
      return sum;
    }
    return sum + session.requestCountInWindow;
  }, 0);

  const simultaneousCutoff = new Date(
    now.getTime() - secondsMs(policy.simultaneousWindowSeconds),
  );
  const simultaneousRecent = concurrent.filter(
    (session) => session.lastSeenAt >= simultaneousCutoff,
  );
  const simultaneousDistinctIps = new Set(
    simultaneousRecent
      .map((session) => session.ipHash)
      .filter((value): value is string => Boolean(value)),
  );
  const simultaneousCount = Math.min(
    simultaneousRecent.length,
    simultaneousDistinctIps.size,
  );

  const signals: RiskSignalId[] = [];

  if (concurrent.length >= policy.suspiciousThreshold) {
    signals.push("CONCURRENT_WARNING", "CONCURRENT_SUSPICIOUS");
  } else if (concurrent.length >= policy.warningThreshold) {
    signals.push("CONCURRENT_WARNING");
  }

  if (distinctDevicesInWindow >= policy.distinctDeviceWarningCount) {
    signals.push("MANY_DEVICES");
  }

  if (rapidSwitchCount >= policy.rapidSwitchDeviceCount) {
    signals.push("RAPID_SWITCHING");
  }

  if (velocity >= policy.velocitySuspiciousCount) {
    signals.push("HIGH_VELOCITY");
  }

  if (simultaneousCount >= policy.simultaneousMinSessions) {
    signals.push("SIMULTANEOUS_ACTIVITY");
  }

  const orderedSignals = uniqueSorted(signals);
  const score = orderedSignals.reduce(
    (sum, signal) => sum + SIGNAL_POINTS[signal],
    0,
  );
  const signalFamilies = uniqueSorted(
    orderedSignals.map((signal) => SIGNAL_FAMILY[signal]),
  );

  let state = AccountSharingRiskState.NORMAL;
  if (
    score >= policy.highRiskMinScore &&
    signalFamilies.length >= policy.highRiskMinSignalFamilies
  ) {
    state = AccountSharingRiskState.HIGH_RISK;
  } else if (
    orderedSignals.includes("CONCURRENT_WARNING") ||
    score >= 2
  ) {
    state = AccountSharingRiskState.SUSPICIOUS;
  }

  return {
    state,
    score,
    signals: orderedSignals,
    signalFamilies,
    concurrentActiveSessions: concurrent.length,
    distinctDevicesInWindow,
  };
}

export function shouldRestrictExpensiveOps(
  result: AccountSharingRiskResult,
  policy: SessionProtectionPolicy,
): boolean {
  return (
    policy.restrictExpensiveOpsOnHighRisk &&
    result.state === AccountSharingRiskState.HIGH_RISK
  );
}
