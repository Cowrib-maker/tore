import type { NextAuthConfig } from "next-auth";

import { UserRole, UserStatus } from "@/domain/enums";

const ROLE_VALUES = new Set<string>(Object.values(UserRole));
const STATUS_VALUES = new Set<string>(Object.values(UserStatus));

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLE_VALUES.has(value);
}

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && STATUS_VALUES.has(value);
}

/**
 * Edge-safe callbacks (no Prisma). Privilege fields set only at sign-in.
 * Fail closed when role/status are missing — no silent CLIENT default.
 */
export const edgeAuthCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  async jwt({ token, user }) {
    if (token.sessionReplaced === true) {
      return {};
    }

    if (user) {
      if (!user.id || !isUserRole(user.role) || !isUserStatus(user.status)) {
        return {};
      }
      token.id = user.id;
      token.role = user.role;
      token.status = user.status;
      token.statusCheckedAt = Date.now();
      if (typeof user.sessionId === "string" && user.sessionId) {
        token.sid = user.sessionId;
      }
    }

    return token;
  },
  async session({ session, token }) {
    if (!session.user) {
      return session;
    }

    if (token.sessionReplaced === true) {
      session.sessionReplaced = true;
      session.user.id = undefined as unknown as string;
      return session;
    }

    if (
      !token.id ||
      typeof token.id !== "string" ||
      !isUserRole(token.role) ||
      !isUserStatus(token.status)
    ) {
      session.user.id = undefined as unknown as string;
      return session;
    }

    session.user.id = token.id;
    session.user.role = token.role;
    session.user.status = token.status;
    session.user.impersonatorId =
      typeof token.impersonatorId === "string"
        ? token.impersonatorId
        : undefined;
    return session;
  },
};

declare module "next-auth" {
  interface Session {
    /** Set when this JWT was replaced by a login on another device. Never show IDs. */
    sessionReplaced?: boolean;
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      status: string;
      /** Present when admin-devtools impersonation is active. */
      impersonatorId?: string;
    };
  }

  interface User {
    role?: string;
    status?: string;
    /** Raw active-session id, copied to the JWT at sign-in only. Never session.user. */
    sessionId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    status?: string;
    statusCheckedAt?: number;
    /** Raw active-session identifier. HttpOnly JWT only — not copied to Session.user. */
    sid?: string;
    sessionReplaced?: boolean;
    /** Admin user id when impersonating another account (devtools only). */
    impersonatorId?: string;
  }
}
