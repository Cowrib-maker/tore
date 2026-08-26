import { describe, expect, it } from "vitest";

import { AUTH_ACTION_CODE } from "@/application/common/action-state";
import {
  classifyEmailSendFailure,
  mapEmailVerificationActionError,
  userFacingResendFeedback,
} from "@/application/common/map-email-verification-error";
import {
  EmailAlreadyVerifiedError,
  EmailConfigurationError,
  EmailDeliveryError,
  EmailNotFoundError,
  EmailVerificationLinkError,
  ValidationError,
} from "@/domain/errors/domain-error";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

const mn = getDictionarySync("mn").auth;

describe("classifyEmailSendFailure", () => {
  it("keeps typed domain errors", () => {
    const config = new EmailConfigurationError();
    expect(classifyEmailSendFailure(config)).toBe(config);
  });

  it("maps missing provider credentials to configuration failure", () => {
    expect(
      classifyEmailSendFailure(
        new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY"),
      ),
    ).toBeInstanceOf(EmailConfigurationError);
    expect(
      classifyEmailSendFailure(new Error("EMAIL_PROVIDER=smtp requires SMTP_HOST")),
    ).toBeInstanceOf(EmailConfigurationError);
  });

  it("maps provider send failures to delivery errors without leaking internals", () => {
    const mapped = classifyEmailSendFailure(new Error("smtp_timeout"));
    expect(mapped).toBeInstanceOf(EmailDeliveryError);
    expect(mapped.message).not.toMatch(/smtp_timeout|nodemailer|resend/i);
  });
});

describe("mapEmailVerificationActionError", () => {
  it("maps known verification failures to codes without English unexpected copy", () => {
    expect(mapEmailVerificationActionError(new EmailAlreadyVerifiedError())).toEqual(
      { code: AUTH_ACTION_CODE.EMAIL_ALREADY_VERIFIED },
    );
    expect(mapEmailVerificationActionError(new EmailNotFoundError())).toEqual({
      code: AUTH_ACTION_CODE.EMAIL_NOT_FOUND,
    });
    expect(mapEmailVerificationActionError(new EmailConfigurationError())).toEqual({
      code: AUTH_ACTION_CODE.EMAIL_CONFIGURATION,
    });
    expect(mapEmailVerificationActionError(new EmailDeliveryError())).toEqual({
      code: AUTH_ACTION_CODE.EMAIL_DELIVERY_FAILED,
    });
    expect(mapEmailVerificationActionError(new ValidationError("Enter a valid email address"))).toEqual(
      { code: AUTH_ACTION_CODE.INVALID_EMAIL },
    );
    expect(
      mapEmailVerificationActionError(new EmailVerificationLinkError("expired")),
    ).toEqual({ code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_EXPIRED });
    expect(
      mapEmailVerificationActionError(new EmailVerificationLinkError("invalid")),
    ).toEqual({ code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_INVALID });
  });

  it("maps unknown failures to a temporary code and never exposes internals", () => {
    const mapped = mapEmailVerificationActionError(
      new Error("PrismaClientKnownRequestError at verification_tokens"),
    );
    expect(mapped).toEqual({ code: AUTH_ACTION_CODE.TEMPORARY_FAILURE });
    expect(JSON.stringify(mapped)).not.toMatch(
      /Prisma|verification_tokens|smtp|RESEND_API_KEY|unexpected error occurred/i,
    );
  });
});

describe("userFacingResendFeedback", () => {
  it("shows the required Mongolian success copy", () => {
    expect(
      userFacingResendFeedback(
        { success: true, code: AUTH_ACTION_CODE.RESEND_SENT },
        mn,
      ),
    ).toEqual({
      tone: "success",
      text: "Баталгаажуулах и-мэйлийг дахин илгээлээ.",
    });
  });

  it("guides already-verified users to login instead of showing an error", () => {
    expect(
      userFacingResendFeedback(
        { code: AUTH_ACTION_CODE.EMAIL_ALREADY_VERIFIED },
        mn,
      ),
    ).toEqual({
      tone: "info",
      text: "Таны и-мэйл аль хэдийн баталгаажсан байна.",
    });
  });

  it("maps rate limit, missing email, delivery, and configuration to Mongolian errors", () => {
    expect(
      userFacingResendFeedback({ code: AUTH_ACTION_CODE.RATE_LIMITED }, mn)?.text,
    ).toBe("Хэт олон удаа оролдсон байна. Түр хүлээгээд дахин оролдоно уу.");
    expect(
      userFacingResendFeedback({ code: AUTH_ACTION_CODE.EMAIL_NOT_FOUND }, mn)?.text,
    ).toBe("Энэ и-мэйл хаягтай бүртгэл олдсонгүй.");
    expect(
      userFacingResendFeedback(
        { code: AUTH_ACTION_CODE.EMAIL_DELIVERY_FAILED },
        mn,
      )?.text,
    ).toBe("Баталгаажуулах код илгээхэд алдаа гарлаа. Дахин оролдоно уу.");
    expect(
      userFacingResendFeedback(
        { code: AUTH_ACTION_CODE.EMAIL_CONFIGURATION },
        mn,
      )?.text,
    ).toBe(
      "И-мэйл илгээх тохиргоо дутуу эсвэл буруу байна. Дараа дахин оролдоно уу.",
    );
  });

  it("never renders the English unexpected-error fallback", () => {
    const feedback = userFacingResendFeedback(
      { error: "An unexpected error occurred. Please try again." },
      mn,
    );
    expect(feedback?.text).toBe(
      "Серверийн түр алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.",
    );
    expect(feedback?.text).not.toMatch(/unexpected error occurred/i);
  });

  it("maps OTP verify outcomes without exposing the code", () => {
    expect(
      userFacingResendFeedback(
        { success: true, code: AUTH_ACTION_CODE.EMAIL_VERIFIED },
        mn,
      ),
    ).toEqual({
      tone: "success",
      text: "И-мэйл амжилттай баталгаажлаа.",
    });
    expect(
      userFacingResendFeedback(
        { code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_INVALID },
        mn,
      )?.text,
    ).toBe("Баталгаажуулах код буруу байна.");
    expect(
      userFacingResendFeedback(
        { code: AUTH_ACTION_CODE.EMAIL_VERIFICATION_EXPIRED },
        mn,
      )?.text,
    ).toBe("Баталгаажуулах кодын хугацаа дууссан байна. Шинэ код авна уу.");
    expect(
      JSON.stringify(
        userFacingResendFeedback(
          { success: true, code: AUTH_ACTION_CODE.EMAIL_VERIFIED, email: "a@b.mn" },
          mn,
        ),
      ),
    ).not.toMatch(/\d{6}/);
  });
});
