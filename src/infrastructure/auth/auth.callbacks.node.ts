import type { NextAuthConfig } from "next-auth";

import { UserStatus } from "@/domain/enums";

/**
 * Node runtime callbacks: refresh account status from the database so
 * suspended/deactivated users lose access without waiting for JWT expiry.
 */
export const nodeAuthCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  async jwt({ token, user }) {
    // Role/status are set only at sign-in from verified credentials.
    // Never accept privilege fields from session.update payloads.
    if (user) {
      token.id = user.id!;
      token.role = user.role;
      token.status = user.status;
      token.statusCheckedAt = Date.now();
    }

    if (!token.id) {
      return token;
    }

    const checkedAt =
      typeof token.statusCheckedAt === "number" ? token.statusCheckedAt : 0;
    const now = Date.now();
    const STATUS_REFRESH_MS = 60_000;

    if (user || now - checkedAt >= STATUS_REFRESH_MS) {
      const { userRepository } = await import(
        "@/infrastructure/repositories"
      );
      const active = await userRepository.isActiveUser(token.id);
      token.status = active ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
      token.statusCheckedAt = now;
    }

    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      session.user.id = token.id;
      session.user.role = token.role ?? "CLIENT";
      session.user.status = token.status ?? UserStatus.ACTIVE;
    }
    return session;
  },
};
