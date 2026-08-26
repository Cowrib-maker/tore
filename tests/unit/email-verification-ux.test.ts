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
  maskEmail,
  pendingEmailVerificationPageModel,
  resolvePostCredentialLogin,
  shouldBounceAuthenticatedFromAuthRoute,
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
    expect(registerClient).toContain("sent: issued.sent");
    expect(registerLawyer).toContain("sent: issued.sent");
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
        sent: true,
      }),
    ).toBe(
      "/verify-email?email=citizen%40example.com&callbackUrl=%2Flegal-ai%3Fq%3Dhi&sent=1",
    );
    expect(
      buildEmailVerificationPendingPath({
        email: "citizen@example.com",
        sent: true,
      }),
    ).toBe("/verify-email?email=citizen%40example.com&sent=1");
    expect(
      buildEmailVerificationPendingPath({ email: "citizen@example.com" }),
    ).not.toMatch(/otp|token=/);
    expect(pendingEmailVerificationPageModel("a@b.mn", null)).toEqual({
      status: "pending",
      email: "a@b.mn",
      callbackUrl: null,
      sent: false,
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
    expect(middleware).toContain("shouldBounceAuthenticatedFromAuthRoute");
    expect(middleware).not.toContain('pathname.startsWith("/verify-email")');
    expect(middleware).not.toContain("node:crypto");
    const bounce = readFileSync(
      path.join(process.cwd(), "src/application/services/email-verification-flow.ts"),
      "utf8",
    );
    expect(bounce).toContain("active-session-constants");
    expect(bounce).not.toContain('from "@/domain/services/active-session"');
  });

  it("does not bounce /login when another device replaced the session", () => {
    expect(shouldBounceAuthenticatedFromAuthRoute("/login", null)).toBe(true);
    expect(
      shouldBounceAuthenticatedFromAuthRoute("/login", "other_device"),
    ).toBe(false);
    expect(shouldBounceAuthenticatedFromAuthRoute("/register", "other_device")).toBe(
      true,
    );
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

  it("uses the required Mongolian OTP verification copy", () => {
    const mn = getDictionarySync("mn").auth;
    expect(mn.verifyPendingTitle).toBe("И-мэйлээ баталгаажуулна уу");
    expect(mn.verifyPendingBody).toBe(
      "Таны и-мэйл хаяг руу 6 оронтой баталгаажуулах код илгээлээ.",
    );
    expect(mn.verifyOtpLabel).toBe("Баталгаажуулах код");
    expect(mn.verifyOtpSubmit).toBe("Баталгаажуулах");
    expect(mn.verifyResend).toBe("Код дахин илгээх");
    expect(mn.verifySuccess).toBe("И-мэйл амжилттай баталгаажлаа.");
    expect(mn.verifyOtpInvalid).toBe("Баталгаажуулах код буруу байна.");
    expect(mn.verifyOtpExpired).toBe(
      "Баталгаажуулах кодын хугацаа дууссан байна. Шинэ код авна уу.",
    );
    expect(mn.verifyAlreadyVerified).toBe(
      "Таны и-мэйл аль хэдийн баталгаажсан байна.",
    );
    expect(mn.verifyRateLimited).toBe(
      "Хэт олон удаа оролдсон байна. Түр хүлээгээд дахин оролдоно уу.",
    );
    expect(mn.verifyDeliveryFailed).toBe(
      "Баталгаажуулах код илгээхэд алдаа гарлаа. Дахин оролдоно уу.",
    );
    expect(mn.verifyResendCountdown).toBe("Дахин код авах боломжтой: {time}");
    expect(mn.verifyBackToLogin).toBe("Нэвтрэх хуудас руу буцах");
  });

  it("masks the registered email on the verification page", () => {
    expect(maskEmail("erdenebayr@example.com")).toBe("er***@example.com");
    expect(maskEmail("ab@tore.mn")).toBe("ab***@tore.mn");
    expect(maskEmail("a@tore.mn")).toBe("a***@tore.mn");
  });

  it("verify-email page does not consume URL tokens or render internals", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/(auth)/verify-email/page.tsx"),
      "utf8",
    );
    expect(page).toContain("EmailVerificationPanel");
    expect(page).toContain("pendingEmailVerificationPageModel");
    expect(page).not.toContain("verifyEmailTokenUseCase");
    expect(page).not.toContain("params.token");
    expect(page).not.toContain("error.message");
    expect(page).not.toContain("Please verify");
  });

  it("resend action maps typed failures instead of a generic English catch", () => {
    const actions = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    const resend = actions.slice(
      actions.indexOf("export async function resendVerificationEmailAction"),
      actions.indexOf("export async function verifyEmailOtpAction"),
    );
    expect(resend).toContain("resendEmailVerificationUseCase");
    expect(resend).toContain("RESEND_VERIFICATION_RATE_LIMIT");
    expect(resend).toContain("AUTH_ACTION_CODE.RESEND_SENT");
    expect(resend).toContain("mapEmailVerificationActionError");
    expect(resend).not.toContain("mapActionError");
    expect(resend).not.toContain("If an unverified account exists");

    const form = readFileSync(
      path.join(process.cwd(), "src/components/auth/resend-verification-form.tsx"),
      "utf8",
    );
    expect(form).toContain("userFacingResendFeedback");
    expect(form).not.toContain("state.error");
  });

  it("verifies OTP through a rate-limited action and six-cell input", () => {
    const actions = readFileSync(
      path.join(process.cwd(), "src/application/actions/auth.actions.ts"),
      "utf8",
    );
    const otpAction = actions.slice(
      actions.indexOf("export async function verifyEmailOtpAction"),
      actions.indexOf("function getPasswordResetDeps"),
    );
    expect(otpAction).toContain("verifyEmailOtpUseCase");
    expect(otpAction).toContain("VERIFY_EMAIL_OTP_RATE_LIMIT");
    expect(otpAction).toContain("AUTH_ACTION_CODE.EMAIL_VERIFIED");
    expect(otpAction).toContain("mapEmailVerificationActionError");
    expect(otpAction).toContain("email: result.email");
    expect(otpAction).not.toContain("otp: result");
    expect(otpAction).not.toMatch(/searchParams.*otp|otp.*searchParams/);

    const limiter = readFileSync(
      path.join(process.cwd(), "src/infrastructure/security/rate-limiter.ts"),
      "utf8",
    );
    expect(limiter).toContain("VERIFY_EMAIL_OTP_RATE_LIMIT");
    expect(limiter).toMatch(/VERIFY_EMAIL_OTP_RATE_LIMIT = \{\s*limit: 5,/);
    expect(limiter).toMatch(/RESEND_VERIFICATION_RATE_LIMIT = \{\s*limit: 3,/);

    const panel = readFileSync(
      path.join(process.cwd(), "src/components/auth/email-verification-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain("EmailVerificationOtpForm");
    expect(panel).toContain("maskEmail");

    const otpForm = readFileSync(
      path.join(
        process.cwd(),
        "src/components/auth/email-verification-otp-form.tsx",
      ),
      "utf8",
    );
    expect(otpForm).toContain("verifyEmailOtpAction");
    expect(otpForm).toContain("copy.verifyOtpSubmit");
    expect(otpForm).toContain("requestSubmit");

    const otpInput = readFileSync(
      path.join(process.cwd(), "src/components/auth/otp-input.tsx"),
      "utf8",
    );
    expect(otpInput).toContain("data-otp-cell");
    expect(otpInput).toContain('autoComplete={index === 0 ? "one-time-code"');
    expect(otpInput).toContain("Backspace");
    expect(otpInput).toContain("onPaste");
    expect(otpInput).not.toContain("type=\"hidden\" name={name} value=");
  });
});
