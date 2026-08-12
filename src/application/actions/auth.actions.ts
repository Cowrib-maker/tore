"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/application/common/action-state";
import { getClientIp } from "@/application/common/client-ip";
import { mapActionError } from "@/application/common/map-action-error";
import { parseWithSchema } from "@/application/common/parse-form";
import { enforceRateLimit } from "@/application/common/rate-limit-action";
import { issueVerificationEmailAfterRegister, getEmailVerificationDeps } from "@/application/services/issue-verification-email";
import { registerClientUseCase } from "@/application/use-cases/auth/register-client";
import { registerLawyerUseCase } from "@/application/use-cases/auth/register-lawyer";
import { resendEmailVerificationUseCase } from "@/application/use-cases/auth/email-verification";
import {
  LOGIN_RATE_LIMIT,
  PASSWORD_RESET_REQUEST_RATE_LIMIT,
  PASSWORD_RESET_SUBMIT_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
  RESEND_VERIFICATION_RATE_LIMIT,
} from "@/infrastructure/security/rate-limiter";
import { signIn, signOut, auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { getEmailSender } from "@/infrastructure/email";
import { emailVerificationTokenRepository } from "@/infrastructure/repositories";
import {
  requestPasswordResetUseCase,
  resetPasswordWithTokenUseCase,
} from "@/application/use-cases/auth/password-reset";
import {
  forgotPasswordSchema,
  loginSchema,
  registerClientSchema,
  registerLawyerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from "@/application/validators/auth.schema";
import { UserRole, UserStatus } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import {
  platformSettingRepository,
  unitOfWork,
  userRepository,
} from "@/infrastructure/repositories";

const registerClientDeps = {
  userRepository,
  platformSettingRepository,
  unitOfWork,
};

const registerLawyerDeps = {
  userRepository,
  platformSettingRepository,
  unitOfWork,
};

export async function registerClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `register:${ipAddress ?? "unknown"}`,
    REGISTER_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  const parsed = parseWithSchema(registerClientSchema, {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on",
    preferredLanguage: formData.get("preferredLanguage") ?? "mn",
  });
  if (!parsed.ok) return parsed.state;

  try {
    await registerClientUseCase(parsed.data, registerClientDeps, ipAddress);
  } catch (error) {
    return mapActionError(error);
  }

  await issueVerificationEmailAfterRegister(parsed.data.email);

  const signInResult = await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  if (signInResult?.error) {
    redirect("/login");
  }

  redirect(getDashboardPath(UserRole.CLIENT));
}

export async function registerLawyerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `register:${ipAddress ?? "unknown"}`,
    REGISTER_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  const parsed = parseWithSchema(registerLawyerSchema, {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on",
    preferredLanguage: formData.get("preferredLanguage") ?? "mn",
  });
  if (!parsed.ok) return parsed.state;

  try {
    await registerLawyerUseCase(parsed.data, registerLawyerDeps, ipAddress);
  } catch (error) {
    return mapActionError(error);
  }

  await issueVerificationEmailAfterRegister(parsed.data.email);

  const signInResult = await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  if (signInResult?.error) {
    redirect("/login");
  }

  redirect(getDashboardPath(UserRole.LAWYER));
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(loginSchema, {
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.ok) return parsed.state;

  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `login:${ipAddress ?? "unknown"}:${parsed.data.email}`,
    LOGIN_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  let session;
  try {
    const result = await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    if (result?.error) {
      return { error: "Invalid email or password" };
    }

    session = await auth();
  } catch (error) {
    return mapActionError(error);
  }

  if (session?.user?.status && session.user.status !== UserStatus.ACTIVE) {
    await signOut({ redirect: false });
    return { error: "Your account is not active" };
  }

  const role = session?.user?.role as UserRole | undefined;

  if (role && role in UserRole) {
    redirect(getDashboardPath(role));
  }

  redirect("/");
}

export async function resendVerificationEmailAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(resendVerificationSchema, {
    email: formData.get("email"),
  });
  if (!parsed.ok) return parsed.state;

  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `resend-verify:${ipAddress ?? "unknown"}:${parsed.data.email}`,
    RESEND_VERIFICATION_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  try {
    const result = await resendEmailVerificationUseCase(
      parsed.data.email,
      getEmailVerificationDeps(),
    );
    if (result.alreadyVerified) {
      return {
        success: true,
        message: "This email is already verified. You can sign in.",
      };
    }
    return {
      success: true,
      message:
        "If an unverified account exists for that email, a verification link has been sent.",
    };
  } catch (error) {
    console.error("[email:verification] resend action failed", error);
    return mapActionError(error);
  }
}

function getPasswordResetDeps() {
  return {
    userRepository,
    emailVerificationTokenRepository,
    emailSender: getEmailSender(),
    appUrl: env.NEXT_PUBLIC_APP_URL,
    appName: env.NEXT_PUBLIC_APP_NAME,
  };
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(forgotPasswordSchema, {
    email: formData.get("email"),
  });
  if (!parsed.ok) return parsed.state;

  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `pwd-reset-req:${ipAddress ?? "unknown"}:${parsed.data.email}`,
    PASSWORD_RESET_REQUEST_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  try {
    await requestPasswordResetUseCase(parsed.data.email, getPasswordResetDeps());
    return {
      success: true,
      message:
        "If an account exists for that email, a password reset link has been sent.",
    };
  } catch (error) {
    console.error("[email:password-reset] request action failed", error);
    return {
      success: true,
      message:
        "If an account exists for that email, a password reset link has been sent.",
    };
  }
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(resetPasswordSchema, {
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.ok) return parsed.state;

  const ipAddress = await getClientIp();
  const limited = await enforceRateLimit(
    `pwd-reset-submit:${ipAddress ?? "unknown"}`,
    PASSWORD_RESET_SUBMIT_RATE_LIMIT,
    "attempts",
  );
  if (limited) return limited;

  try {
    await resetPasswordWithTokenUseCase(
      { rawToken: parsed.data.token, newPassword: parsed.data.password },
      getPasswordResetDeps(),
    );
  } catch (error) {
    return mapActionError(error);
  }

  redirect("/login");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
