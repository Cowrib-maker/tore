import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLawyerPlanStatus } from "@/application/use-cases/entitlements/get-lawyer-plan-status";
import { InvoiceStatus, LawyerPosition, SubscriptionStatus, UserRole } from "@/domain/enums";
import { ForbiddenError, UnauthorizedError } from "@/domain/errors/domain-error";

const lawyer = { userId: "u1", role: UserRole.LAWYER };
const now = new Date("2026-10-15T00:00:00.000Z");

function subscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub1",
    userId: "u1",
    planCode: "SOLO",
    status: SubscriptionStatus.ACTIVE,
    seatLimit: 1,
    currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    ...over,
  } as never;
}

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    userId: "u1",
    status: InvoiceStatus.PENDING,
    providerInvoiceId: "prov-1",
    bookingId: null,
    expiresAt: new Date("2026-10-15T01:00:00.000Z"),
    createdAt: new Date("2026-10-14T23:00:00.000Z"),
    ...over,
  } as never;
}

function deps(sub: unknown = null, invoices: unknown[] = []) {
  const findLatestOwnedByUserId = vi.fn(async () => sub);
  const listByUserId = vi.fn(async () => invoices);
  return {
    deps: {
      subscriptionRepository: { findLatestOwnedByUserId },
      invoiceRepository: { listByUserId },
    } as never,
    findLatestOwnedByUserId,
    listByUserId,
  };
}

describe("getLawyerPlanStatus (read-only)", () => {
  it("reports an inactive plan when there is no subscription, without inventing expiry or usage", async () => {
    const { deps: d } = deps(null, []);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status).toEqual({
      planName: expect.any(String),
      billingRequired: true,
      subscriptionStatus: "NONE",
      expiresAt: null,
      pendingInvoice: null,
    });
    expect(status).not.toHaveProperty("usage");
  });

  it("reports an active, unexpired subscription with its real expiry", async () => {
    const { deps: d } = deps(subscription(), []);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.subscriptionStatus).toBe("ACTIVE");
    expect(status.billingRequired).toBe(false);
    expect(status.expiresAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("shows an expired subscription as EXPIRED computed from time, without persisting anything", async () => {
    const { deps: d } = deps(subscription({ currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z") }), []);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.subscriptionStatus).toBe("EXPIRED");
    expect(status.billingRequired).toBe(true);
  });

  it("uses the same open-invoice rule as the billing page (pending, unexpired, with a provider id)", async () => {
    const { deps: d } = deps(null, [
      invoice({ id: "old", expiresAt: new Date("2026-10-14T00:00:00.000Z") }),
      invoice({ id: "booking", bookingId: "b1" }),
      invoice({ id: "open" }),
    ]);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.pendingInvoice).toEqual({ status: "PENDING" });
    expect(status.subscriptionStatus).toBe("PENDING");
  });

  it("performs only the two reads: it is given no device-session, usage, platform-setting or user repository", async () => {
    const { deps: d, findLatestOwnedByUserId, listByUserId } = deps(subscription(), []);
    expect(Object.keys(d as object).sort()).toEqual(["invoiceRepository", "subscriptionRepository"]);
    await getLawyerPlanStatus(lawyer, d, now);
    expect(findLatestOwnedByUserId).toHaveBeenCalledTimes(1);
    expect(listByUserId).toHaveBeenCalledTimes(1);
  });

  it.each([UserRole.CLIENT, UserRole.ADMIN])("refuses a %s actor before reading anything", async (role) => {
    const { deps: d, findLatestOwnedByUserId } = deps(null, []);
    await expect(getLawyerPlanStatus({ userId: "x", role }, d, now)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findLatestOwnedByUserId).not.toHaveBeenCalled();
  });
});

/** Repositories that throw on ANY property other than the named reads, so a write (or any extra read) cannot slip in unnoticed. */
function strictRepo<T extends object>(name: string, reads: Record<string, (...a: unknown[]) => unknown>): T {
  return new Proxy(reads, {
    get(target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop in target) return target[prop];
      throw new Error(`unexpected ${name}.${String(prop)} (status endpoint must be read-only)`);
    },
  }) as unknown as T;
}

describe("getLawyerPlanStatus: edge cases", () => {
  it("CANCELED: shown as CANCELED and billing is required, even if the period end is still in the future", async () => {
    const { deps: d } = deps(subscription({ status: SubscriptionStatus.CANCELED }), []);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.subscriptionStatus).toBe("CANCELED");
    expect(status.billingRequired).toBe(true);
    // The date is reported as stored; it does not turn a cancelled plan into an active one.
    expect(status.expiresAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("PAST_DUE: shown as PAST_DUE and billing is required", async () => {
    const { deps: d } = deps(subscription({ status: SubscriptionStatus.PAST_DUE }), []);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.subscriptionStatus).toBe("PAST_DUE");
    expect(status.billingRequired).toBe(true);
  });

  it("AWAITING_VERIFICATION invoice with no subscription: reported as the open invoice (status only) and PENDING, never ACTIVE", async () => {
    const { deps: d } = deps(null, [invoice({ status: InvoiceStatus.AWAITING_VERIFICATION, expiresAt: new Date("2026-10-10T00:00:00.000Z") })]);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    // Billing-page rule: AWAITING_VERIFICATION counts as open even past its payment window.
    expect(status.pendingInvoice).toEqual({ status: "AWAITING_VERIFICATION" });
    expect(status.subscriptionStatus).toBe("PENDING");
    expect(status.billingRequired).toBe(true);
  });

  it("AWAITING_VERIFICATION does not activate or extend an existing expired plan", async () => {
    const { deps: d } = deps(subscription({ currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z") }), [
      invoice({ status: InvoiceStatus.AWAITING_VERIFICATION }),
    ]);
    const status = await getLawyerPlanStatus(lawyer, d, now);
    expect(status.subscriptionStatus).toBe("EXPIRED");
    expect(status.billingRequired).toBe(true);
    expect(status.pendingInvoice).toEqual({ status: "AWAITING_VERIFICATION" });
  });

  it("an invoice that is already PAID, FAILED or CANCELLED is not an open invoice", async () => {
    for (const status of [InvoiceStatus.PAID, InvoiceStatus.FAILED, InvoiceStatus.CANCELLED]) {
      const { deps: d } = deps(null, [invoice({ status })]);
      expect((await getLawyerPlanStatus(lawyer, d, now)).pendingInvoice).toBeNull();
    }
  });

  it("is read-only: the strict repositories allow exactly one subscription read and one invoice read, and nothing else", async () => {
    const find = vi.fn(async () => subscription());
    const list = vi.fn(async () => [invoice({ status: InvoiceStatus.AWAITING_VERIFICATION })]);
    const strict = {
      subscriptionRepository: strictRepo("subscriptionRepository", { findLatestOwnedByUserId: find as never }),
      invoiceRepository: strictRepo("invoiceRepository", { listByUserId: list as never }),
    } as never;
    await expect(getLawyerPlanStatus(lawyer, strict, now)).resolves.toBeTruthy();
    expect(find).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Route: proves the status read never touches or creates device sessions.

const requireActor = vi.fn();
const sessionSpies = {
  findById: vi.fn(),
  create: vi.fn(),
  touch: vi.fn(),
  listActiveByUserId: vi.fn(),
};
const cookiesSpy = vi.fn();
const headersSpy = vi.fn();
const subscriptionFind = vi.fn();
const invoiceList = vi.fn();
const profileFind = vi.fn();
const credentialsFind = vi.fn();

vi.mock("@/application/common/require-actor", () => ({ requireActor: (role: unknown) => requireActor(role) }));
vi.mock("@/infrastructure/repositories", () => ({
  subscriptionRepository: { findLatestOwnedByUserId: (...a: unknown[]) => subscriptionFind(...a) },
  invoiceRepository: { listByUserId: (...a: unknown[]) => invoiceList(...a) },
  lawyerProfileRepository: { findByUserId: (...a: unknown[]) => profileFind(...a) },
  lawyerCredentialRepository: { findByLawyerProfileId: (...a: unknown[]) => credentialsFind(...a) },
}));
vi.mock("@/infrastructure/repositories/prisma-device-session-repository", () => ({
  deviceSessionRepository: sessionSpies,
}));
vi.mock("next/headers", () => ({
  cookies: (...a: unknown[]) => cookiesSpy(...a),
  headers: (...a: unknown[]) => headersSpy(...a),
}));

import { GET } from "@/app/api/lawyer/billing/status/route";

describe("GET /api/lawyer/billing/status", () => {
  beforeEach(() => {
    requireActor.mockReset().mockResolvedValue(lawyer);
    subscriptionFind.mockReset().mockResolvedValue(subscription());
    invoiceList.mockReset().mockResolvedValue([]);
    for (const spy of [...Object.values(sessionSpies), cookiesSpy, headersSpy]) spy.mockReset();
  });

  it("returns the plan status and never creates, updates or reads device sessions or cookies", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ subscriptionStatus: "ACTIVE", billingRequired: false });
    for (const [name, spy] of Object.entries(sessionSpies)) {
      expect(spy, `deviceSessionRepository.${name}`).not.toHaveBeenCalled();
    }
    // No device-session cookie read or written, no request-header (UA / IP) read.
    expect(cookiesSpy).not.toHaveBeenCalled();
    expect(headersSpy).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("exposes no usage counters, session list or invoice payment details", async () => {
    invoiceList.mockResolvedValue([invoice()]);
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["billingRequired", "expiresAt", "pendingInvoice", "planName", "subscriptionStatus"]);
    expect(body.pendingInvoice).toEqual({ status: "PENDING" });
  });

  it.each([
    ["CANCELED", subscription({ status: SubscriptionStatus.CANCELED }), []],
    ["PAST_DUE", subscription({ status: SubscriptionStatus.PAST_DUE }), []],
    ["an AWAITING_VERIFICATION invoice", null, [invoice({ status: InvoiceStatus.AWAITING_VERIFICATION })]],
  ])("%s: response keeps to the five intended fields, leaks no payment details, and reads only", async (_label, sub, invoices) => {
    subscriptionFind.mockResolvedValue(sub);
    invoiceList.mockResolvedValue(
      (invoices as unknown[]).map((inv) => ({
        ...(inv as object),
        // Sensitive invoice fields that must never reach the sidebar payload.
        paymentCode: "PAYCODE-123",
        qrImage: "data:image/png;base64,SECRETQR",
        bankAccountNumber: "5000123456",
        bankAccountName: "TORE LLC",
        shortUrl: "https://qpay.mn/s/secret",
        amountMnt: 49000,
      })),
    );
    const res = await GET();
    const text = await res.text();
    const body = JSON.parse(text);
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["billingRequired", "expiresAt", "pendingInvoice", "planName", "subscriptionStatus"]);
    if (body.pendingInvoice) expect(Object.keys(body.pendingInvoice)).toEqual(["status"]);
    for (const secret of ["PAYCODE-123", "SECRETQR", "5000123456", "TORE LLC", "qpay.mn/s/secret", "providerInvoiceId", "prov-1"]) {
      expect(text).not.toContain(secret);
    }
    // Read-only: exactly the two reads; no session, cookie or header access.
    expect(subscriptionFind).toHaveBeenCalledTimes(1);
    expect(invoiceList).toHaveBeenCalledTimes(1);
    for (const spy of Object.values(sessionSpies)) expect(spy).not.toHaveBeenCalled();
    expect(cookiesSpy).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("requires a signed-in LAWYER: 401 anonymous, 403 for any other role", async () => {
    requireActor.mockRejectedValueOnce(new UnauthorizedError());
    expect((await GET()).status).toBe(401);
    requireActor.mockRejectedValueOnce(new ForbiddenError());
    expect((await GET()).status).toBe(403);
    expect(requireActor).toHaveBeenCalledWith(UserRole.LAWYER);
    expect(subscriptionFind).not.toHaveBeenCalled();
  });

  it("keeps the old behaviour documented: the full snapshot route is the only one that touches the session", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const status = fs.readFileSync(path.join(process.cwd(), "src/app/api/lawyer/billing/status/route.ts"), "utf8");
    expect(status).not.toMatch(/touchDeviceSession|persistDeviceSessionCookie|readLawyerSessionHttpContext|deviceSessionRepository|lawyerEntitlementDeps/);
    const snapshot = fs.readFileSync(path.join(process.cwd(), "src/app/api/lawyer/billing/route.ts"), "utf8");
    expect(snapshot).toContain("persistDeviceSessionCookie");
  });
});

// ---------------------------------------------------------------------------
// Licence state is attorney-only.

describe("loadLawyerLicenseState (attorney-only)", () => {
  beforeEach(() => {
    profileFind.mockReset();
    credentialsFind.mockReset().mockResolvedValue([]);
  });

  it("returns the licence stage for an ATTORNEY", async () => {
    const { loadLawyerLicenseState } = await import("@/application/use-cases/lawyers/load-lawyer-license-state");
    profileFind.mockResolvedValue({ id: "lp1", position: LawyerPosition.ATTORNEY, verificationStatus: "PENDING" });
    expect(await loadLawyerLicenseState("u1")).toBe("SUBMIT_LICENSE");
    profileFind.mockResolvedValue({ id: "lp1", position: LawyerPosition.ATTORNEY, verificationStatus: "APPROVED" });
    expect(await loadLawyerLicenseState("u2")).toBe("APPROVED");
  });

  it.each([LawyerPosition.PROSECUTOR, LawyerPosition.JUDGE, LawyerPosition.OTHER_LAWYER])(
    "returns null for %s (no licence flow) without reading credentials",
    async (position) => {
      const { loadLawyerLicenseState } = await import("@/application/use-cases/lawyers/load-lawyer-license-state");
      profileFind.mockResolvedValue({ id: "lp1", position, verificationStatus: "PENDING" });
      expect(await loadLawyerLicenseState(`u-${position}`)).toBeNull();
      expect(credentialsFind).not.toHaveBeenCalled();
    },
  );

  it("returns null when the account has no lawyer profile yet", async () => {
    const { loadLawyerLicenseState } = await import("@/application/use-cases/lawyers/load-lawyer-license-state");
    profileFind.mockResolvedValue(null);
    expect(await loadLawyerLicenseState("u-none")).toBeNull();
  });
});
