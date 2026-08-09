"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { issueVerificationEmailAfterRegister, getEmailVerificationDeps } from "@/application/services/issue-verification-email";
import { registerClientUseCase } from "@/application/use-cases/auth/register-client";
import { registerLawyerUseCase } from "@/application/use-cases/auth/register-lawyer";
import { resendEmailVerificationUseCase } from "@/application/use-cases/auth/email-verification";
import {
  loginSchema,
  registerClientSchema,
  registerLawyerSchema,
  resendVerificationSchema,
} from "@/application/validators/auth.schema";
import { mapActionError } from "@/application/common/map-action-error";
import { UserRole, UserStatus } from "@/domain/enums";
import { getDashboardPath } from "@/domain/services/rbac";
import {
  platformSettingRepository,
  unitOfWork,
  userRepository,
} from "@/infrastructure/repositories";
import {
  LOGIN_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
  RESEND_VERIFICATION_RATE_LIMIT,
  consumeRateLimit,
} from "@/infrastructure/security/rate-limiter";
import { signIn, signOut, auth } from "@/lib/auth";

export type ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

function mapError(error: unknown): ActionState {
  return mapActionError(error);
}

async function getClientIp(): Promise<string | undefined> {
  const headerStore = await headers();
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerStore.get("x-real-ip") ??
    undefined
  );
}

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

function tooManyRequests(retryAfterSeconds: number): ActionState {
  return {
    error: `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
  };
}

export async function registerClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `register:${ipAddress ?? "unknown"}`,
    REGISTER_RATE_LIMIT.limit,
    REGISTER_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfterSeconds);
  }

  const parsed = registerClientSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on",
    preferredLanguage: formData.get("preferredLanguage") ?? "mn",
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await registerClientUseCase(parsed.data, registerClientDeps, ipAddress);
  } catch (error) {
    return mapError(error);
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
  const rate = await consumeRateLimit(
    `register:${ipAddress ?? "unknown"}`,
    REGISTER_RATE_LIMIT.limit,
    REGISTER_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfterSeconds);
  }

  const parsed = registerLawyerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    acceptTerms: formData.get("acceptTerms") === "on",
    preferredLanguage: formData.get("preferredLanguage") ?? "mn",
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await registerLawyerUseCase(parsed.data, registerLawyerDeps, ipAddress);
  } catch (error) {
    return mapError(error);
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
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `login:${ipAddress ?? "unknown"}:${parsed.data.email}`,
    LOGIN_RATE_LIMIT.limit,
    LOGIN_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfterSeconds);
  }

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
    return mapError(error);
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
  const parsed = resendVerificationSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const ipAddress = await getClientIp();
  const rate = await consumeRateLimit(
    `resend-verify:${ipAddress ?? "unknown"}:${parsed.data.email}`,
    RESEND_VERIFICATION_RATE_LIMIT.limit,
    RESEND_VERIFICATION_RATE_LIMIT.windowMs,
  );
  if (!rate.ok) {
    return tooManyRequests(rate.retryAfterSeconds);
  }

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
    return mapError(error);
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  if (session.user.status !== UserStatus.ACTIVE) {
    await signOut({ redirect: false });
    return null;
  }

  return session;
}
