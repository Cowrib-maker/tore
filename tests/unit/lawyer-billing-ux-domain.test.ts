import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  deriveSubscriptionStage,
  LICENSE_STAGE_LABEL_MN,
  nextLawyerAction,
  OTHER_LEGAL_AI_ACCESS_NOTE_MN,
  showsOtherLegalAiAccessNote,
  SUBSCRIPTION_STAGE_LABEL_MN,
  type SubscriptionStage,
} from "@/domain/services/lawyer-access-stage";
import type { LawyerVerificationState } from "@/domain/services/lawyer-onboarding";
import { lawyerBillingHref, safeReturnPath } from "@/domain/services/safe-return-path";

describe("safeReturnPath (no open redirects)", () => {
  it("accepts internal workspace and AI destinations, keeping their query", () => {
    expect(safeReturnPath("/legal-ai")).toBe("/legal-ai");
    expect(safeReturnPath("/legal-ai?conversationId=abc&caseId=1")).toBe("/legal-ai?conversationId=abc&caseId=1");
    expect(safeReturnPath("/lawyer/workspace")).toBe("/lawyer/workspace");
    expect(safeReturnPath("/lawyer/workspace/cases#create-case")).toBe("/lawyer/workspace/cases#create-case");
  });

  it.each([
    "https://evil.example/legal-ai",
    "//evil.example/legal-ai",
    "/\\evil.example",
    "/legal-ai\\..\\..",
    "javascript:alert(1)",
    "legal-ai",
    "/legal-ai\r\nSet-Cookie: x=1",
    "/%2F/evil.example",
    "/lawyers/some-lawyer",
    "/login",
    "/admin/users",
    "/api/lawyer/billing",
    "/lawyer/billing?returnTo=/legal-ai",
    "",
    "/legal-ai%",
  ])("rejects %j", (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it.each([
    "/legal-ai/../login",
    "/lawyer/../api/auth/signout",
    "/lawyer/%2e%2e/api/auth/signout",
    "/lawyer/..%2f..%2fapi/x",
    "/lawyer/../billing",
    "/lawyer/x/../billing",
    // Other encodings of the same traversal.
    "/lawyer/%2E%2E/api/x",
    "/lawyer/.%2e/api/x",
    "/legal-ai/%252e%252e/login",
    "/lawyer/..%5c..%5capi",
    "/legal-ai/./x",
    "/lawyer/x/%2e/y",
    "/legal-ai/..",
    "/legal-ai/%2f%2fevil.example",
    "/lawyer/%e0%a4%a/x",
  ])("rejects dot-segment / encoded traversal %j", (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it("keeps accepting valid internal paths, including dots that are not segments", () => {
    expect(safeReturnPath("/legal-ai?conversationId=abc&caseId=1")).toBe("/legal-ai?conversationId=abc&caseId=1");
    expect(safeReturnPath("/lawyer/workspace/cases/case-1")).toBe("/lawyer/workspace/cases/case-1");
    expect(safeReturnPath("/matters/m.1/files")).toBe("/matters/m.1/files");
    expect(safeReturnPath("/lawyer/workspace/cases?next=../x")).toBe("/lawyer/workspace/cases?next=../x");
    expect(safeReturnPath("/legal-ai#a..b")).toBe("/legal-ai#a..b");
  });

  it("still rejects the billing page itself and external or protocol-relative targets", () => {
    for (const value of ["/lawyer/billing", "/lawyer/billing/", "/lawyer/billing?x=1", "https://evil.example", "//evil.example", "/\evil.example", "/%2Fevil.example"]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });

  it("rejects non-strings and absurdly long values", () => {
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(["/legal-ai"])).toBeNull();
    expect(safeReturnPath(`/legal-ai?q=${"a".repeat(600)}`)).toBeNull();
  });

  it("builds the billing link with only a validated return path", () => {
    expect(lawyerBillingHref("/legal-ai?conversationId=abc")).toBe("/lawyer/billing?returnTo=%2Flegal-ai%3FconversationId%3Dabc");
    expect(lawyerBillingHref("https://evil.example")).toBe("/lawyer/billing");
    expect(lawyerBillingHref(null, "history")).toBe("/lawyer/billing#history");
    expect(lawyerBillingHref("/lawyer/billing")).toBe("/lawyer/billing");
  });
});

describe("licence and subscription are independent", () => {
  const licenses: LawyerVerificationState[] = ["SUBMIT_LICENSE", "UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"];
  const subs: SubscriptionStage[] = ["INACTIVE", "PAYMENT_PENDING", "AWAITING_VERIFICATION", "ACTIVE", "EXPIRED"];

  it("names every stage distinctly in Mongolian", () => {
    expect(new Set(licenses.map((l) => LICENSE_STAGE_LABEL_MN[l])).size).toBe(licenses.length);
    expect(new Set(subs.map((s) => SUBSCRIPTION_STAGE_LABEL_MN[s])).size).toBe(subs.length);
  });

  it("an unpaid but verified lawyer is asked to activate a plan, not to verify", () => {
    expect(nextLawyerAction("APPROVED", "INACTIVE")).toMatchObject({ kind: "ACTIVATE_PLAN", target: "billing" });
  });

  it("a paid but unverified lawyer is asked to verify the licence, not to pay again", () => {
    expect(nextLawyerAction("SUBMIT_LICENSE", "ACTIVE")).toMatchObject({ kind: "VERIFY_LICENSE", target: "verification" });
    expect(nextLawyerAction("REJECTED", "ACTIVE")).toMatchObject({ kind: "VERIFY_LICENSE", target: "verification" });
  });

  it("a pending licence review never hides or changes the payment state, and vice versa", () => {
    expect(nextLawyerAction("UNDER_REVIEW", "ACTIVE").kind).toBe("NONE");
    expect(nextLawyerAction("UNDER_REVIEW", "PAYMENT_PENDING").kind).toBe("CHECK_PAYMENT");
    expect(nextLawyerAction("APPROVED", "ACTIVE").kind).toBe("NONE");
  });

  it("derives the subscription stage only from billing state, never from the licence", () => {
    expect(deriveSubscriptionStage({ billingStatus: "ACTIVE" })).toBe("ACTIVE");
    expect(deriveSubscriptionStage({ billingStatus: "NONE" })).toBe("INACTIVE");
    expect(deriveSubscriptionStage({ billingStatus: "NONE", pendingInvoiceStatus: "PENDING" })).toBe("PAYMENT_PENDING");
    expect(deriveSubscriptionStage({ billingStatus: "NONE", pendingInvoiceStatus: "AWAITING_VERIFICATION" })).toBe("AWAITING_VERIFICATION");
    expect(deriveSubscriptionStage({ billingStatus: "EXPIRED" })).toBe("EXPIRED");
    // An open invoice is NOT an active plan.
    expect(deriveSubscriptionStage({ billingStatus: "PENDING", pendingInvoiceStatus: "PENDING" })).not.toBe("ACTIVE");
  });
});

describe("neutral note about other Legal AI access", () => {
  it("applies to exactly the inactive and expired stages", () => {
    const shown = (["INACTIVE", "PAYMENT_PENDING", "AWAITING_VERIFICATION", "ACTIVE", "EXPIRED"] as const).filter((stage) => showsOtherLegalAiAccessNote(stage));
    expect(shown).toEqual(["INACTIVE", "EXPIRED"]);
  });

  it("uses the approved wording and the 'own plan' badge labels", () => {
    expect(SUBSCRIPTION_STAGE_LABEL_MN.INACTIVE).toBe("Өөрийн багц идэвхгүй");
    expect(SUBSCRIPTION_STAGE_LABEL_MN.EXPIRED).toBe("Өөрийн багцын хугацаа дууссан");
    expect(OTHER_LEGAL_AI_ACCESS_NOTE_MN).toBe(
      "Энэ нь зөвхөн таны өөрийн багцын төлөв. Legal AI-ийн хандалтын бодит төлөвийг Legal AI хуудас харуулна.",
    );
  });

  it("matches what is possible today: no mention of team seats or any other source of access", () => {
    expect(OTHER_LEGAL_AI_ACCESS_NOTE_MN).not.toMatch(/суудал|багийн|team|seat|өөр эрх/i);
    expect(OTHER_LEGAL_AI_ACCESS_NOTE_MN).not.toMatch(/боломжтой/);
  });

  it("does not change the next action (activation / renewal CTAs are kept)", () => {
    expect(nextLawyerAction("APPROVED", "INACTIVE")).toMatchObject({ kind: "ACTIVATE_PLAN", target: "billing" });
    expect(nextLawyerAction("APPROVED", "EXPIRED")).toMatchObject({ kind: "RENEW_PLAN", target: "billing" });
  });
});

describe("accounts without a licence flow (non-attorney positions: licence = null)", () => {
  it.each(["INACTIVE", "EXPIRED", "PAYMENT_PENDING", "AWAITING_VERIFICATION"] as const)(
    "%s: only subscription actions, never a licence action",
    (stage) => {
      const action = nextLawyerAction(null, stage);
      expect(action.kind).not.toBe("VERIFY_LICENSE");
      expect(action.target).not.toBe("verification");
      expect(action.target).toBe("billing");
    },
  );

  it("an active plan needs no action at all (no licence step is invented)", () => {
    expect(nextLawyerAction(null, "ACTIVE")).toEqual({ kind: "NONE", label: "", target: null });
  });

  it("attorneys keep the licence step after an active plan", () => {
    expect(nextLawyerAction("SUBMIT_LICENSE", "ACTIVE").kind).toBe("VERIFY_LICENSE");
    expect(nextLawyerAction("REJECTED", "ACTIVE").kind).toBe("VERIFY_LICENSE");
  });
});

describe("workspace billing navigation (source-level wiring)", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("the lawyer workspace frame links to the plan and payment history, and shows the plan card", () => {
    const frame = read("src/components/case-review/lawyer-workspace-frame.tsx");
    expect(frame).toContain('href: "/lawyer/billing", label: "Миний багц"');
    expect(frame).toContain('href: "/lawyer/billing#history", label: "Төлбөрийн түүх"');
    // Desktop sidebar, mobile drawer and the workbench all render the same card.
    expect((frame.match(/LawyerPlanStatusCard/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("the shared lawyer nav points at the in-workspace billing page, not the standalone /billing page", () => {
    const i18n = read("src/i18n/dashboard-shell-i18n.ts");
    const lawyerBlock = i18n.slice(i18n.indexOf("/lawyer/dashboard"), i18n.indexOf("/admin/dashboard"));
    expect(lawyerBlock).toContain('"/lawyer/billing"');
    expect(lawyerBlock).not.toContain('href: "/billing"');
  });

  it("the standalone /billing page sends lawyers to the workspace page and keeps only a validated return path", () => {
    const page = read("src/app/billing/page.tsx");
    expect(page).toContain("UserRole.LAWYER");
    expect(page).toContain("redirect(lawyerBillingHref(");
  });
});
