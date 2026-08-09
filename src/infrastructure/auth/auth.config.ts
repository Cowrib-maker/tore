import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { nodeAuthCallbacks } from "@/infrastructure/auth/auth.callbacks.node";
import { loginSchema } from "@/application/validators/auth.schema";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { consumeRateLimit, CREDENTIALS_AUTH_RATE_LIMIT } = await import(
          "@/infrastructure/security/rate-limiter"
        );
        const rate = await consumeRateLimit(
          `credentials:${parsed.data.email.toLowerCase()}`,
          CREDENTIALS_AUTH_RATE_LIMIT.limit,
          CREDENTIALS_AUTH_RATE_LIMIT.windowMs,
        );
        if (!rate.ok) {
          return null;
        }

        const { verifyCredentials } = await import(
          "@/application/use-cases/auth/verify-credentials"
        );
        const { auditLogRepository, userRepository } = await import(
          "@/infrastructure/repositories"
        );
        const { AuditAction } = await import("@/domain/enums");

        try {
          const user = await verifyCredentials(
            parsed.data.email,
            parsed.data.password,
            { userRepository },
          );

          await auditLogRepository.create({
            actorUserId: user.id,
            action: AuditAction.LOGIN,
            entityType: "User",
            entityId: user.id,
            metadata: { email: user.email, role: user.role },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            status: user.status,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: nodeAuthCallbacks,
} satisfies NextAuthConfig;
