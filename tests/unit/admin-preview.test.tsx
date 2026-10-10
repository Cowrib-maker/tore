import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/admin/preview/home",
  useSearchParams: () => new URLSearchParams(),
}));

import { PreviewFrame } from "@/components/admin/preview/preview-frame";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { LandingPage } from "@/components/marketing/landing-page";
import {
  PREVIEW_CONTEXTS,
  PREVIEW_CONTEXT_IDS,
  PREVIEW_PAGE_IDS,
  UNSUPPORTED_PREVIEW_CONTEXTS,
  getGatePreview,
  getHomePreviewProps,
  resolvePreview,
} from "@/domain/admin-preview/scenarios";
import { UserRole } from "@/domain/enums";
import { applySiteContentOverrides } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

const mn = getDictionarySync("mn");

function renderHome(contextId: (typeof PREVIEW_CONTEXT_IDS)[number], dict = mn) {
  const context = PREVIEW_CONTEXTS[contextId];
  return renderToStaticMarkup(<LandingPage dict={dict} locale="mn" {...getHomePreviewProps(context, dict.common.brand)} />);
}

describe("resolvePreview (untrusted URL parameters)", () => {
  it("accepts every declared page × context × locale combination (and the other built-in locales render the code defaults)", () => {
    for (const page of PREVIEW_PAGE_IDS) {
      for (const context of PREVIEW_CONTEXT_IDS) {
        for (const locale of ["mn", "en"]) {
          const r = resolvePreview({ page, context, locale });
          expect(r.ok).toBe(true);
        }
      }
    }
  });

  it("defaults sensibly: anonymous, Mongolian, published content", () => {
    const r = resolvePreview({ page: "home" });
    expect(r).toMatchObject({ ok: true, locale: "mn", content: "published" });
    expect(r.ok && r.context.id).toBe("anonymous");
  });

  it("treats anything other than content=draft as published", () => {
    expect(resolvePreview({ page: "home", content: "draft" })).toMatchObject({ ok: true, content: "draft" });
    expect(resolvePreview({ page: "home", content: "DRAFT" })).toMatchObject({ ok: true, content: "published" });
    expect(resolvePreview({ page: "home", content: "<script>" })).toMatchObject({ ok: true, content: "published" });
  });

  it("explains unsupported roles (student, organization member) instead of faking them", () => {
    for (const unsupported of UNSUPPORTED_PREVIEW_CONTEXTS) {
      const r = resolvePreview({ page: "home", context: unsupported.id });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe(unsupported.reason);
    }
  });

  it("rejects unknown pages, contexts and locales — including an attempt to preview as ADMIN or a real user id", () => {
    for (const bad of [
      { page: "billing" },
      { page: "../../etc/passwd" },
      { page: "home", context: "admin" },
      { page: "home", context: "ADMIN" },
      { page: "home", context: "cmabc123userid" },
      { page: "home", locale: "../mn" },
    ]) {
      expect(resolvePreview(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("no preview context models an administrator, and every context is a synthetic identity", () => {
    for (const context of Object.values(PREVIEW_CONTEXTS)) {
      expect(context.role).not.toBe(UserRole.ADMIN);
      expect(context.syntheticName ?? "").not.toMatch(/@/);
    }
  });
});

describe("home page preview uses the real LandingPage with role-specific props", () => {
  it("anonymous: login CTA, no checkout, no account link", () => {
    const props = getHomePreviewProps(PREVIEW_CONTEXTS.anonymous, "TORE");
    expect(props.authUser).toBeNull();
    expect(props.checkoutEnabled).toBe(false);
    expect(props.productHrefs.lawyer).not.toBe("/lawyer/workspace");
  });

  it("citizen: signed in as the synthetic name, checkout enabled, chat destination", () => {
    const props = getHomePreviewProps(PREVIEW_CONTEXTS["citizen-free"], "TORE");
    expect(props.authUser).toEqual({ displayName: "Иргэн (жишээ)", dashboardHref: "/#chat" });
    expect(props.checkoutEnabled).toBe(true);
  });

  it("lawyer: goes to the lawyer workspace, no citizen checkout", () => {
    const props = getHomePreviewProps(PREVIEW_CONTEXTS["lawyer-entitled"], "TORE");
    expect(props.authUser?.dashboardHref).toBe("/lawyer/workspace");
    expect(props.checkoutEnabled).toBe(false);
    expect(props.productHrefs.lawyer).toBe("/lawyer/workspace");
  });

  it("renders the actual page markup for every context, and the synthetic name only for signed-in contexts", () => {
    for (const id of PREVIEW_CONTEXT_IDS) {
      const html = renderHome(id);
      expect(html.length).toBeGreaterThan(1000);
      expect(html).toContain(mn.publicHome.tagline.split(" ")[0]);
      const name = PREVIEW_CONTEXTS[id].syntheticName;
      if (name) expect(html).toContain(name.split("(")[0].trim());
    }
  });

  it("shows draft text only when the draft overlay is applied (published view is unaffected)", () => {
    const published = renderHome("anonymous");
    const draft = renderHome("anonymous", applySiteContentOverrides(mn, { "home.intro.title": "НООРОГ-ГАРЧИГ-ШАЛГАЛТ" }));
    expect(published).not.toContain("НООРОГ-ГАРЧИГ-ШАЛГАЛТ");
    expect(draft).toContain("НООРОГ-ГАРЧИГ-ШАЛГАЛТ");
  });
});

describe("student hub preview uses the real StudentHubView", () => {
  it("renders for every context, with the synthetic visitor's menu state and the published nav text", async () => {
    const { StudentHubView } = await import("@/components/student/student-hub-view");
    for (const id of PREVIEW_CONTEXT_IDS) {
      const props = getHomePreviewProps(PREVIEW_CONTEXTS[id], mn.common.brand);
      const html = renderToStaticMarkup(<StudentHubView dict={mn} locale="mn" authUser={props.authUser} />);
      expect(html.length).toBeGreaterThan(2000);
      expect(html).toContain(mn.publicHome.navHelp);
    }
    const overridden = applySiteContentOverrides(mn, { "shared.nav.help": "ZQ-HELP-LINK" });
    const html = renderToStaticMarkup(<StudentHubView dict={overridden} locale="mn" authUser={null} />);
    expect(html).toContain("ZQ-HELP-LINK");
  });
});

describe("Legal AI gate preview", () => {
  it("anonymous sees the sign-in gate; unsubscribed citizen and lawyer see the paid-plan gate with the right audience; subscribed users see no gate", () => {
    expect(getGatePreview(PREVIEW_CONTEXTS.anonymous)?.kind).toBe("auth");
    expect(getGatePreview(PREVIEW_CONTEXTS["new-user"])).toMatchObject({ kind: "billing", audience: "citizen" });
    expect(getGatePreview(PREVIEW_CONTEXTS["citizen-free"])).toMatchObject({ kind: "billing", audience: "citizen" });
    expect(getGatePreview(PREVIEW_CONTEXTS["lawyer-no-entitlement"])).toMatchObject({ kind: "billing", audience: "lawyer" });
    expect(getGatePreview(PREVIEW_CONTEXTS["citizen-subscribed"])).toBeNull();
    expect(getGatePreview(PREVIEW_CONTEXTS["lawyer-entitled"])).toBeNull();
  });

  it("renders the real gate card", () => {
    const gate = getGatePreview(PREVIEW_CONTEXTS["citizen-free"])!;
    const html = renderToStaticMarkup(<LegalAiAccessGateCard gate={gate} />);
    expect(html).toContain("<button");
    expect(html.length).toBeGreaterThan(200);
  });
});

describe("preview isolation: no external side effects, no permission changes", () => {
  it("the frame states the role and mode and makes the whole subtree inert", () => {
    const html = renderToStaticMarkup(
      <PreviewFrame page="home" context={PREVIEW_CONTEXTS["citizen-free"]} locale="mn" content="draft">
        <form action="/api/anything"><button type="submit">Pay</button></form>
      </PreviewFrame>,
    );
    expect(html).toContain("УРЬДЧИЛАН ХАРАХ");
    expect(html).toContain("Иргэн — багцгүй");
    expect(html).toContain("НООРОГ");
    expect(html).toMatch(/<div[^>]*\binert=""/);
    expect(html).toContain('data-preview-context="citizen-free"');
    // The inert wrapper contains the interactive content; the banner sits outside it.
    expect(html.indexOf("УРЬДЧИЛАН ХАРАХ")).toBeLessThan(html.indexOf("inert"));
  });

  const root = path.resolve(__dirname, "../..");
  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
  }
  const previewFiles = [
    path.join(root, "src/domain/admin-preview/scenarios.ts"),
    path.join(root, "src/components/admin/preview/preview-frame.tsx"),
    ...filesUnder(path.join(root, "src/app/admin/preview")),
  ];

  it("preview code never imports sessions, auth, billing/payment/licence/e-mail/upload code, server actions or write paths", () => {
    const forbidden = /from\s+["']@\/(application\/actions|infrastructure\/(?!repositories")|lib\/auth|application\/common\/session|infrastructure\/payments|infrastructure\/email|infrastructure\/storage)/;
    for (const file of previewFiles) {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n").filter((l) => l.startsWith("import") || l.includes(" from "))) {
        expect(line, `${path.relative(root, file)}: ${line}`).not.toMatch(forbidden);
      }
      expect(source, path.relative(root, file)).not.toMatch(/cookies\(\)|signIn\(|setCookie|unstable_update|"use server"/);
    }
  });

  it("the only repository the preview pages touch is the read-only site-content overlay", () => {
    const page = readFileSync(path.join(root, "src/app/admin/preview/[page]/page.tsx"), "utf8");
    const used = [...page.matchAll(/import \{([^}]+)\} from "@\/infrastructure\/repositories"/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
    expect(used).toEqual(["siteContentRepository"]);
    expect(page).toContain("getPreviewOverridesUseCase");
    expect(page).not.toMatch(/saveSiteContent|publishSiteContent|restoreSiteContent|unpublish/);
  });

  it("both preview pages sit behind the server-side admin guard", () => {
    for (const rel of ["src/app/admin/preview/page.tsx", "src/app/admin/preview/[page]/page.tsx"]) {
      expect(readFileSync(path.join(root, rel), "utf8")).toContain("await requireAdminPage()");
    }
  });
});
