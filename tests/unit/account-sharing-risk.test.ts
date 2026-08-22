import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_PROTECTION_POLICY,
  parseSessionProtectionPolicy,
} from "@/domain/constants/session-protection-policy";
import type { DeviceSession } from "@/domain/entities/subscription";
import {
  AccountSharingRiskState,
  DeviceSessionStatus,
} from "@/domain/enums";
import {
  evaluateAccountSharingRisk,
  shouldRestrictExpensiveOps,
} from "@/domain/services/account-sharing-risk";

const now = new Date("2026-08-22T04:00:00.000Z");
const policy = DEFAULT_SESSION_PROTECTION_POLICY;

function session(
  overrides: Partial<DeviceSession> & Pick<DeviceSession, "id">,
): DeviceSession {
  return {
    userId: "lawyer-1",
    subscriptionId: "sub-1",
    userAgent: "Mozilla/5.0 Chrome/120 Windows",
    ipHash: "ip-a",
    firstSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    lastSeenAt: now,
    revokedAt: null,
    status: DeviceSessionStatus.ACTIVE,
    requestCountWindowStart: now,
    requestCountInWindow: 1,
    ...overrides,
  };
}

describe("evaluateAccountSharingRisk", () => {
  it("allows two legitimate long-lived devices as NORMAL", () => {
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [
        session({ id: "phone" }),
        session({ id: "laptop", ipHash: "ip-b" }),
      ],
    });
    expect(result.concurrentActiveSessions).toBe(2);
    expect(result.state).toBe(AccountSharingRiskState.NORMAL);
    expect(result.signals).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("marks three concurrent sessions as SUSPICIOUS without blocking", () => {
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [
        session({ id: "a" }),
        session({ id: "b" }),
        session({ id: "c" }),
      ],
    });
    expect(result.state).toBe(AccountSharingRiskState.SUSPICIOUS);
    expect(result.signals).toEqual(["CONCURRENT_WARNING"]);
    expect(shouldRestrictExpensiveOps(result, policy)).toBe(false);
  });

  it("does not treat four concurrent sessions alone as HIGH_RISK", () => {
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [
        session({ id: "a" }),
        session({ id: "b" }),
        session({ id: "c" }),
        session({ id: "d" }),
      ],
    });
    expect(result.state).toBe(AccountSharingRiskState.SUSPICIOUS);
    expect(result.signals).toContain("CONCURRENT_SUSPICIOUS");
    expect(result.signalFamilies).toEqual(["CONCURRENT"]);
    expect(shouldRestrictExpensiveOps(result, policy)).toBe(false);
  });

  it("increases risk when many new devices appear in a short window", () => {
    const fresh = new Date(now.getTime() - 60_000);
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [1, 2, 3, 4].map((n) =>
        session({
          id: `new-${n}`,
          firstSeenAt: fresh,
          lastSeenAt: now,
        }),
      ),
    });
    expect(result.signals).toContain("RAPID_SWITCHING");
    expect(result.state).toBe(AccountSharingRiskState.HIGH_RISK);
    expect(shouldRestrictExpensiveOps(result, policy)).toBe(true);
  });

  it("is deterministic for the same snapshot", () => {
    const sessions = [
      session({ id: "a", requestCountInWindow: 12 }),
      session({ id: "b", ipHash: "ip-b", requestCountInWindow: 8 }),
      session({ id: "c", ipHash: "ip-c" }),
    ];
    const first = evaluateAccountSharingRisk({ now, policy, sessions });
    const second = evaluateAccountSharingRisk({ now, policy, sessions });
    expect(second).toEqual(first);
  });

  it("reaches HIGH_RISK from concurrent plus distinct-IP simultaneous activity", () => {
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [
        session({ id: "a", ipHash: "ip-1" }),
        session({ id: "b", ipHash: "ip-2" }),
        session({ id: "c", ipHash: "ip-3" }),
        session({ id: "d", ipHash: "ip-4" }),
      ],
    });
    expect(result.signals).toContain("SIMULTANEOUS_ACTIVITY");
    expect(result.signals).toContain("CONCURRENT_SUSPICIOUS");
    expect(result.state).toBe(AccountSharingRiskState.HIGH_RISK);
  });

  it("does not restrict expensive ops when HIGH_RISK policy is disabled", () => {
    const disabled = {
      ...policy,
      restrictExpensiveOpsOnHighRisk: false,
    };
    const result = evaluateAccountSharingRisk({
      now,
      policy: disabled,
      sessions: [1, 2, 3, 4].map((n) =>
        session({
          id: `new-${n}`,
          firstSeenAt: now,
          ipHash: `ip-${n}`,
        }),
      ),
    });
    expect(result.state).toBe(AccountSharingRiskState.HIGH_RISK);
    expect(shouldRestrictExpensiveOps(result, disabled)).toBe(false);
  });

  it("ignores revoked sessions", () => {
    const result = evaluateAccountSharingRisk({
      now,
      policy,
      sessions: [
        session({ id: "live" }),
        session({
          id: "dead",
          status: DeviceSessionStatus.REVOKED,
          revokedAt: now,
        }),
      ],
    });
    expect(result.concurrentActiveSessions).toBe(1);
    expect(result.state).toBe(AccountSharingRiskState.NORMAL);
  });
});

describe("parseSessionProtectionPolicy", () => {
  it("returns defaults for empty or invalid JSON", () => {
    expect(parseSessionProtectionPolicy(null)).toEqual(
      DEFAULT_SESSION_PROTECTION_POLICY,
    );
    expect(parseSessionProtectionPolicy("not-json")).toEqual(
      DEFAULT_SESSION_PROTECTION_POLICY,
    );
  });

  it("merges numeric overrides without scattering hardcoded values", () => {
    const parsed = parseSessionProtectionPolicy(
      JSON.stringify({ warningThreshold: 5, restrictExpensiveOpsOnHighRisk: false }),
    );
    expect(parsed.warningThreshold).toBe(5);
    expect(parsed.maxNormalConcurrentSessions).toBe(2);
    expect(parsed.restrictExpensiveOpsOnHighRisk).toBe(false);
  });
});
