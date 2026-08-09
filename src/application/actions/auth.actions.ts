"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { registerClientUseCase } from "@/application/use-cases/auth/register-client";
import { registerLawyerUseCase } from "@/application/use-cases/auth/register-lawyer";
import {
  loginSchema,
  registerClientSchema,
  registerLawyerSchema,
} from "@/application/validators/auth.schema";
import { DomainError } from "@/domain/errors/domain-error";
import { getDashboardPath } from "@/domain/services/rbac";
import { UserRole } from "@/domain/enums";
import {
  auditLogRepository,
  clientProfileRepository,
  lawyerProfileRepository,
  platformSettingRepository,
  termsAcceptanceRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { signIn, signOut, auth } from "@/lib/auth";

export type ActionState = {
  error?: string;
  success?: boolean;
};

function mapError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  console.error(error);
  return { error: "An unexpected error occurred" };
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
  clientProfileRepository,
  termsAcceptanceRepository,
  platformSettingRepository,
  auditLogRepository,
};

const registerLawyerDeps = {
  userRepository,
  lawyerProfileRepository,
  termsAcceptanceRepository,
  platformSettingRepository,
  auditLogRepository,
};

export async function registerClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    const ipAddress = await getClientIp();
    await registerClientUseCase(parsed.data, registerClientDeps, ipAddress);
  } catch (error) {
    return mapError(error);
  }

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
    const ipAddress = await getClientIp();
    await registerLawyerUseCase(parsed.data, registerLawyerDeps, ipAddress);
  } catch (error) {
    return mapError(error);
  }

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

  const result = await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  if (result?.error) {
    return { error: "Invalid email or password" };
  }

  const session = await auth();
  const role = session?.user?.role as UserRole | undefined;

  if (role && role in UserRole) {
    redirect(getDashboardPath(role));
  }

  redirect("/");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function getSessionUser() {
  return auth();
}
