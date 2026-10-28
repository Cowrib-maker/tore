import { describe, expect, it } from "vitest";

import type { SpellActivation } from "@/domain/spell/entities";
import { SpellActivationStatus } from "@/domain/spell/enums";
import {
  classifyActivationRequest,
  evaluateCooldown,
} from "@/domain/spell/transfer-policy";

const now = new Date("2026-10-05T00:00:00Z");
const DAY = 86_400_000;

function activation(over: Partial<SpellActivation>): SpellActivation {
  return {
    id: "a1",
    licenseId: "L",
    installationId: "A",
    userId: null,
    status: SpellActivationStatus.ACTIVE,
    endReason: null,
    activatedAt: now,
    lastValidatedAt: now,
    deactivatedAt: null,
    supersededByActivationId: null,
    transferredFromActivationId: null,
    lastTokenJti: null,
    createdAt: now,
    ...over,
  };
}
const ended = (over: Partial<SpellActivation>) =>
  activation({
    status: SpellActivationStatus.DEACTIVATED,
    endReason: "USER_DEACTIVATED" as never,
    deactivatedAt: now,
    ...over,
  });

const base = { now, cooldownDays: 30 };
const fresh = { lastDeviceChangeAt: null };

describe("evaluateCooldown", () => {
  it("is open when there was never a device change or the cooldown is 0", () => {
    expect(evaluateCooldown(fresh, now, 30)).toEqual({ blocked: false });
    expect(evaluateCooldown({ lastDeviceChangeAt: now }, now, 0)).toEqual({ blocked: false });
  });
  it("blocks until exactly 30 days after the last change, then opens", () => {
    const last = new Date(now.getTime() - 10 * DAY);
    const blocked = evaluateCooldown({ lastDeviceChangeAt: last }, now, 30);
    expect(blocked).toEqual({ blocked: true, availableAt: new Date(last.getTime() + 30 * DAY) });
    const edge = new Date(last.getTime() + 30 * DAY);
    expect(evaluateCooldown({ lastDeviceChangeAt: last }, edge, 30)).toEqual({ blocked: false });
    expect(evaluateCooldown({ lastDeviceChangeAt: last }, new Date(edge.getTime() - 1), 30).blocked).toBe(true);
  });
  it("is configurable", () => {
    const last = new Date(now.getTime() - 2 * DAY);
    expect(evaluateCooldown({ lastDeviceChangeAt: last }, now, 1).blocked).toBe(false);
    expect(evaluateCooldown({ lastDeviceChangeAt: last }, now, 7).blocked).toBe(true);
  });
});

describe("classifyActivationRequest", () => {
  it("first activation: nothing has ever existed", () => {
    expect(
      classifyActivationRequest({ ...base, license: fresh, installationId: "A", activeActivation: null, latestActivation: null }),
    ).toEqual({ kind: "FIRST_ACTIVATION" });
  });

  it("same installation already active → idempotent", () => {
    const a = activation({ installationId: "A" });
    expect(
      classifyActivationRequest({ ...base, license: fresh, installationId: "A", activeActivation: a, latestActivation: a }),
    ).toEqual({ kind: "ALREADY_ACTIVE", activation: a });
  });

  it("another installation active → TRANSFER carrying the activation being replaced", () => {
    const a = activation({ installationId: "A" });
    const d = classifyActivationRequest({ ...base, license: fresh, installationId: "B", activeActivation: a, latestActivation: a });
    expect(d).toEqual({ kind: "TRANSFER", replacing: a, cooldown: { blocked: false } });
  });

  it("transfer is cooldown-blocked after a recent device change", () => {
    const a = activation({ installationId: "A" });
    const d = classifyActivationRequest({
      ...base,
      license: { lastDeviceChangeAt: new Date(now.getTime() - 3 * DAY) },
      installationId: "B",
      activeActivation: a,
      latestActivation: a,
    });
    expect(d.kind).toBe("TRANSFER");
    expect(d.kind === "TRANSFER" && d.cooldown.blocked).toBe(true);
  });

  it("same installation re-activating after its own deactivation is free, even inside the cooldown", () => {
    const latest = ended({ installationId: "A" });
    expect(
      classifyActivationRequest({
        ...base,
        license: { lastDeviceChangeAt: new Date(now.getTime() - DAY) },
        installationId: "A",
        activeActivation: null,
        latestActivation: latest,
      }),
    ).toEqual({ kind: "REACTIVATION" });
  });

  it("deactivate-then-activate-elsewhere is a device change and honours the cooldown (no bypass)", () => {
    const latest = ended({ installationId: "A" });
    const d = classifyActivationRequest({
      ...base,
      license: { lastDeviceChangeAt: new Date(now.getTime() - DAY) },
      installationId: "B",
      activeActivation: null,
      latestActivation: latest,
    });
    expect(d.kind).toBe("DEVICE_CHANGE");
    expect(d.kind === "DEVICE_CHANGE" && d.cooldown.blocked).toBe(true);
  });
});
