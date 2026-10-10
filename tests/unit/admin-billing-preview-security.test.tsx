import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthorizedError } from "@/domain/errors/domain-error";

const h = vi.hoisted(() => ({ requireAdminPage: vi.fn(), notFound: vi.fn() }));
vi.mock("@/application/common/require-admin-page", () => ({ requireAdminPage: h.requireAdminPage }));
vi.mock("@/components/admin/preview/preview-network-guard", () => ({ PreviewNetworkGuard: ({ audience }: { audience: string }) => <i data-network-guard={audience} /> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    h.notFound();
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import AdminCoveragePage from "@/app/admin/preview/coverage/page";
import AdminCheckoutPreviewPage from "@/app/admin/preview/checkout/[role]/page";
import { SiteContentList } from "@/components/admin/site-content/site-content-list";
import { PRODUCT_COVERAGE } from "@/domain/admin-preview/product-coverage";
import { ALL_SITE_CONTENT_DEFINITIONS } from "@/domain/site-content/registry";

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

beforeEach(() => vi.clearAllMocks());

describe("preview pages are server-side admin-only", () => {
  it.each([
    ["signed out", new UnauthorizedError()],
    ["citizen/lawyer", new ForbiddenError()],
  ])("checkout preview refuses %s before rendering anything", async (_n, error) => {
    h.requireAdminPage.mockRejectedValue(error);
    await expect(
      AdminCheckoutPreviewPage({ params: Promise.resolve({ role: "citizen" }), searchParams: Promise.resolve({}) }),
    ).rejects.toBe(error);
  });

  it("coverage page refuses non-admins", async () => {
    h.requireAdminPage.mockRejectedValue(new ForbiddenError());
    await expect(AdminCoveragePage()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an admin gets only citizen/lawyer; any other role segment is a 404", async () => {
    h.requireAdminPage.mockResolvedValue({ userId: "a" });
    await expect(
      AdminCheckoutPreviewPage({ params: Promise.resolve({ role: "firm" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    const ok = await AdminCheckoutPreviewPage({ params: Promise.resolve({ role: "lawyer" }), searchParams: Promise.resolve({ state: "active" }) });
    expect(ok).toBeTruthy();
  });

  it("the page calls the gate first, before reading params (no work for non-admins)", () => {
    const src = read("src/app/admin/preview/checkout/[role]/page.tsx");
    expect(src.indexOf("requireAdminPage()")).toBeGreaterThan(-1);
    expect(src.indexOf("requireAdminPage()")).toBeLessThan(src.indexOf("await Promise.all"));
  });
});

describe("preview code cannot reach real payment, invoice, callback or entitlement services", () => {
  const FORBIDDEN = [
    "create-qpay-gateway",
    "qpay-http-gateway",
    "qpay-config",
    "billing-unit-of-work",
    "process-qpay-payment",
    "activate-subscription",
    "claim-manual-payment",
    "verify-manual-payment",
    "create-manual-checkout",
    "create-plan-checkout",
    "create-solo-checkout",
    "subscription-repository",
    "invoice-repository",
    "entitlement",
    "@/infrastructure",
    "@/lib/env",
    "prisma",
    "/api/billing/qpay/callback",
  ];
  const files = [
    "src/domain/admin-preview/billing-simulation.ts",
    "src/domain/admin-preview/product-coverage.ts",
    "src/components/admin/preview/billing-sandbox.tsx",
    "src/app/admin/preview/checkout/[role]/page.tsx",
    "src/app/admin/preview/coverage/page.tsx",
  ];
  it.each(files)("%s imports none of the real payment/entitlement modules", (file) => {
    const imports = read(file)
      .split("\n")
      .filter((line) => /^\s*(import|export)\b.*from\s+["']/.test(line) || /\bimport\(/.test(line))
      .join("\n");
    for (const needle of FORBIDDEN) expect(imports, `${file} must not import ${needle}`).not.toContain(needle);
  });

  it("the simulation module performs no I/O", () => {
    const src = read("src/domain/admin-preview/billing-simulation.ts");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket/);
  });

  it("the real endpoints keep requiring the real session (preview adds no preview-mode bypass)", () => {
    for (const rel of ["src/app/api/citizen/billing/checkout/route.ts", "src/app/api/lawyer/billing/checkout/route.ts", "src/app/api/billing/qpay/callback/route.ts"]) {
      const src = read(rel);
      expect(src).not.toMatch(/admin-preview|SIMULATED|preview/i);
    }
  });
});

describe("product coverage is honest", () => {
  it("only Citizen and Lawyer are simulated; Team/Firm/Student/Spell are never presented as having a checkout", () => {
    const by = Object.fromEntries(PRODUCT_COVERAGE.map((p) => [p.id, p]));
    expect(by.citizen.checkout).toBe("simulated");
    expect(by.lawyer.checkout).toBe("simulated");
    for (const id of ["team", "firm", "student"]) expect(by[id].checkout).toBe("missing");
    expect(by.spell.checkout).toBe("other-branch");
    for (const id of ["team", "firm", "student", "spell"]) expect(by[id].previewHref === null || id === "student").toBe(true);
  });
});

describe("site content never exposes pricing or billing policy for editing", () => {
  it("no editable key targets prices, plans, checkout or billing", () => {
    const keys = ALL_SITE_CONTENT_DEFINITIONS.map((e) => `${e.key} ${e.dictionaryPath}`.toLowerCase());
    for (const k of keys) expect(k).not.toMatch(/price|checkout|billing|subscription|payment|qpay/);
  });
});

describe("URL parameters are never ignored silently", () => {
  beforeEach(() => h.requireAdminPage.mockResolvedValue({ userId: "a" }));
  const render = async (searchParams: Record<string, string>) =>
    renderToStaticMarkup(await AdminCheckoutPreviewPage({ params: Promise.resolve({ role: "citizen" }), searchParams: Promise.resolve(searchParams) }));

  it("tells the admin when state or locale was not understood", async () => {
    const html = await render({ state: "bogus", locale: "xx" });
    expect(html).toContain("Дэмжигдээгүй төлөв «bogus»");
    expect(html).toContain("хэл «xx»");
    expect(html).toContain('role="alert"');
  });

  it("shows no notice for valid parameters or none", async () => {
    expect(await render({ state: "active", locale: "en" })).not.toContain("Дэмжигдээгүй");
    expect(await render({})).not.toContain("Дэмжигдээгүй");
  });
});

describe("content list rows wrap long text instead of widening the page", () => {
  it("uses a wrapping clamp, not a nowrap truncate, for the text preview", () => {
    const html = renderToStaticMarkup(
      <SiteContentList rows={[{ key: "home.hero.tagline", page: "home", section: "hero", labelMn: "Үндсэн уриа", labelEn: "Main tagline", preview: "x".repeat(300), mn: "default", en: "default" }]} />,
    );
    expect(html).toContain("line-clamp-2");
    expect(html).not.toContain("truncate");
  });
});

describe("the checkout preview installs the network guard", () => {
  it("renders PreviewNetworkGuard with the synthetic audience on both roles", async () => {
    h.requireAdminPage.mockResolvedValue({ userId: "a" });
    for (const role of ["citizen", "lawyer"]) {
      const html = renderToStaticMarkup(await AdminCheckoutPreviewPage({ params: Promise.resolve({ role }), searchParams: Promise.resolve({}) }));
      expect(html).toContain(`data-network-guard="${role}"`);
    }
  });
});
