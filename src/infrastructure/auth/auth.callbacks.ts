import type { NextAuthConfig } from "next-auth";

import { UserStatus } from "@/domain/enums";

/**
 * Edge-safe callbacks (no Prisma). Privilege fields set only at sign-in.
 */
export const edgeAuthCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  async jwt({ token, user }) {
    if (user) {
      token.id = user.id!;
      token.role = user.role;
      token.status = user.status;
      token.statusCheckedAt = Date.now();
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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      status: string;
    };
  }

  interface User {
    role?: string;
    status?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role?: string;
    status?: string;
    statusCheckedAt?: number;
  }
}
