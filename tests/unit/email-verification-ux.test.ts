import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUTH_ACTION_CODE } from "@/application/common/action-state";
import {
  buildEmailVerificationPendingPath,
  destinationAfterVerifiedLogin,
  invalidEmailVerificationPageModel,
  isSessionBouncingAuthRoute,
  loginHrefAfterEmailVerification,
  pendingEmailVerificationPageModel,
  resolvePostCredentialLogin,
  successEmailVerificationPageModel,
} from "@/application/services/email-verification-flow";
import { UserRole } from "@/domain/enums";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

describe("email verification UX flow", () => {
  it("keeps citizen and professional registration unverified by default", () => {
    const client = readFileSync(
      path.join(process.cwd(), "src/application/use-cases/auth/register-client.ts"),
      "utf8",
    );
    const lawyer = readFileSync(
      path.join(process.cwd(), "src/application/use-cases/auth/register-lawyer.ts"),
      "utf8",
    );
    expect(client).toContain("role: UserRole.CLIENT");
    expect(lawyer).toContain("role: UserRole.LAWYER");
    expect(client).not.toContain("markEmailVerified");
    expect(lawyer).not.toContain("markEmailVerified");
    expect(client).not.toMatch(/emailVerified:\s*new Date/);
    expect(lawyer).not.toMatch(/emailVerified:\s*new Date/);
  });

  it("sends verification mail after register and shows the pending page", () => {
    const actions = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    const registerClient = actions.slice(
      actions.indexOf("export async function registerClientAction"),
      actions.indexOf("export async function registerLawyerAction"),
    );
    const registerLawyer = actions.slice(
      actions.indexOf("export async function registerLawyerAction"),
      actions.indexOf("export async function loginAction"),
    );

    expect(registerClient).toContain("issueVerificationEmailAfterRegister");
    expect(registerLawyer).toContain("issueVerificationEmailAfterRegister");
    expect(registerClient).toContain("buildEmailVerificationPendingPath");
    expect(registerLawyer).toContain("buildEmailVerificationPendingPath");
    expect(registerClient).not.toContain("signIn");
    expect(registerLawyer).not.toContain("signIn");
  });

  it("builds a dedicated pending verification path with the account email", () => {
    expect(
      buildEmailVerificationPendingPath({ email: "Lawyer@Example.com" }),
    ).toBe("/verify-email?email=lawyer%40example.com");
    expect(
      buildEmailVerificationPendingPath({
        email: "citizen@example.com",
        callbackUrl: "/legal-ai?q=hi",
      }),
    ).toBe(
      "/verify-email?email=citizen%40example.com&callbackUrl=%2Flegal-ai%3Fq%3Dhi",
    );
    expect(pendingEmailVerificationPageModel("a@b.mn", null)).toEqual({
      status: "pending",
      email: "a@b.mn",
      callbackUrl: null,
    });
  });

  it("does not complete login until email is verified", () => {
    expect(resolvePostCredentialLogin({ emailVerified: null })).toBe(
      "unverified",
    );
    expect(
      resolvePostCredentialLogin({
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("ok");
    expect(resolvePostCredentialLogin(null)).toBe("unavailable");
    expect(AUTH_ACTION_CODE.EMAIL_NOT_VERIFIED).toBe("EMAIL_NOT_VERIFIED");
  });

  it("login action signs unverified users out and returns the verification code", () => {
    const actions = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    const login = actions.slice(
      actions.indexOf("export async function loginAction"),
      actions.indexOf("export async function resendVerificationEmailAction"),
    );
    expect(login).toContain("resolvePostCredentialLogin");
    expect(login).toContain("AUTH_ACTION_CODE.EMAIL_NOT_VERIFIED");
    expect(login).toContain("signOut");
    expect(login).not.toContain("Please verify your email");
  });

  it("verified accounts still complete login to the role destination", () => {
    expect(destinationAfterVerifiedLogin(UserRole.LAWYER)).toBe(
      "/lawyer/dashboard",
    );
    expect(destinationAfterVerifiedLogin(UserRole.CLIENT)).toBe(
      "/client/dashboard",
    );
    expect(
      destinationAfterVerifiedLogin(UserRole.CLIENT, "/legal-ai?q=hi"),
    ).toBe("/legal-ai?q=hi");
  });

  it("professional verification continue goes through login to the lawyer workspace", () => {
    const model = successEmailVerificationPageModel(
      "lawyer@example.com",
      UserRole.LAWYER,
      "/legal-ai",
    );
    expect(model).toEqual({
      status: "success",
      email: "lawyer@example.com",
      continueHref: "/login",
    });
    expect(destinationAfterVerifiedLogin(UserRole.LAWYER)).toBe(
      "/lawyer/dashboard",
    );
  });

  it("citizen verification continue preserves Legal AI when present", () => {
    const model = successEmailVerificationPageModel(
      "citizen@example.com",
      UserRole.CLIENT,
      "/legal-ai",
    );
    expect(model).toEqual({
      status: "success",
      email: "citizen@example.com",
      continueHref: "/login?callbackUrl=%2Flegal-ai",
    });
    expect(loginHrefAfterEmailVerification(UserRole.CLIENT)).toBe("/login");
    expect(destinationAfterVerifiedLogin(UserRole.CLIENT)).toBe(
      "/client/dashboard",
    );
  });

  it("invalid and expired links share a safe UI model", () => {
    expect(invalidEmailVerificationPageModel(null)).toEqual({
      status: "invalid",
      email: null,
    });
  });

  it("keeps /verify-email reachable while logged in so email links can complete", () => {
    expect(isSessionBouncingAuthRoute("/login")).toBe(true);
    expect(isSessionBouncingAuthRoute("/register/lawyer")).toBe(true);
    expect(isSessionBouncingAuthRoute("/verify-email")).toBe(false);
    expect(isSessionBouncingAuthRoute("/verify-email?token=abc")).toBe(false);

    const middleware = readFileSync(
      path.join(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    expect(middleware).toContain("isSessionBouncingAuthRoute");
    expect(middleware).not.toContain('pathname.startsWith("/verify-email")');
  });

  it("login form shows the verification panel instead of English verify copy", () => {
    const loginForm = readFileSync(
      path.join(process.cwd(), "src/components/auth/login-form.tsx"),
      "utf8",
    );
    expect(loginForm).toContain("AUTH_ACTION_CODE.EMAIL_NOT_VERIFIED");
    expect(loginForm).toContain("EmailVerificationPanel");
    expect(loginForm).not.toContain("Please verify your email");
    expect(loginForm).not.toContain("ResendVerificationForm");
  });

  it("uses the required Mongolian verification copy", () => {
    const mn = getDictionarySync("mn").auth;
    expect(mn.verifyPendingTitle).toBe("Имэйлээ баталгаажуулна уу");
    expect(mn.verifyPendingBody).toBe(
      "Таны бүртгэлтэй имэйл хаяг руу баталгаажуулах холбоос илгээлээ.",
    );
    expect(mn.verifyResend).toBe("Имэйлийг дахин илгээх");
    expect(mn.verifyBackToLogin).toBe("Нэвтрэх хуудас руу буцах");
    expect(mn.verifySpamHint).toBe(
      "Имэйл ирээгүй бол Spam/Junk хавтсаа шалгана уу.",
    );
    expect(mn.verifyExpiredOrInvalid).toBe(
      "Энэ баталгаажуулах холбоос хүчингүй болсон эсвэл хугацаа нь дууссан байна.",
    );
    expect(mn.verifyRequestNew).toBe("Шинэ баталгаажуулах имэйл авах");
  });

  it("verify-email page does not render provider or domain error text", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/(auth)/verify-email/page.tsx"),
      "utf8",
    );
    expect(page).toContain("EmailVerificationPanel");
    expect(page).toContain("verifyEmailTokenUseCase");
    expect(page).not.toContain("error.message");
    expect(page).not.toContain("Please verify");
  });

  it("resend action reuses the existing use case and stays generic", () => {
    const actions = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    const resend = actions.slice(
      actions.indexOf("export async function resendVerificationEmailAction"),
      actions.indexOf("function getPasswordResetDeps"),
    );
    expect(resend).toContain("resendEmailVerificationUseCase");
    expect(resend).toContain("RESEND_VERIFICATION_RATE_LIMIT");
    expect(resend).toContain("AUTH_ACTION_CODE.RESEND_SENT");
    expect(resend).not.toContain("alreadyVerified");
    expect(resend).not.toContain("If an unverified account exists");
  });
});
