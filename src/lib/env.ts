import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET:
    nodeEnv === "test"
      ? z
          .string()
          .min(32)
          .optional()
          .default("test-auth-secret-minimum-32-characters")
      : z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("TORE"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse({
    ...process.env,
    NODE_ENV: nodeEnv,
  });

  if (!parsed.success) {
    console.error(
      "Invalid environment variables:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

/** Validated env — import from boot paths so validation always runs. */
export const env = validateEnv();
