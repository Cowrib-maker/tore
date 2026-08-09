import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

const baseRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  acceptTerms: z
    .boolean()
    .refine((value) => value === true, "You must accept the terms and policies"),
  preferredLanguage: z.enum(["mn", "en"]).default("mn"),
});

export const registerClientSchema = baseRegisterSchema;

export const registerLawyerSchema = baseRegisterSchema;

export type RegisterClientInput = z.infer<typeof registerClientSchema>;
export type RegisterLawyerInput = z.infer<typeof registerLawyerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
