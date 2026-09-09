import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .transform((value) => value.toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

const baseRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
  acceptTerms: z
    .boolean()
    .refine((value) => value === true, "You must accept the terms and policies"),
  preferredLanguage: z.enum(["mn", "en", "zh", "ko"]).default("mn"),
});

const passwordsMustMatch: { message: string; path: (string | number)[] } = {
  message: "Passwords do not match",
  path: ["confirmPassword"],
};

export const registerClientSchema = baseRegisterSchema.refine(
  (value) => value.password === value.confirmPassword,
  passwordsMustMatch,
);

export const LAWYER_POSITION_VALUES = [
  "ATTORNEY",
  "PROSECUTOR",
  "JUDGE",
  "OTHER_LAWYER",
] as const;

export const registerLawyerSchema = baseRegisterSchema
  .extend({
    position: z.enum(LAWYER_POSITION_VALUES).default("ATTORNEY"),
  })
  .refine(
    (value) => value.password === value.confirmPassword,
    passwordsMustMatch,
  );

// confirmPassword only drives the form-validation match check above — the
// use cases below never read it, so it's excluded from the type they take.
export type RegisterClientInput = Omit<
  z.infer<typeof registerClientSchema>,
  "confirmPassword"
>;
export type RegisterLawyerInput = Omit<
  z.infer<typeof registerLawyerSchema>,
  "confirmPassword"
>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password"),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const verifyEmailOtpSchema = z.object({
  email: emailSchema,
  otp: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Invalid verification code")),
});

export type VerifyEmailOtpInput = z.infer<typeof verifyEmailOtpSchema>;
