import type { NextAuthConfig } from "next-auth";

export const authCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  async jwt({ token, user }) {
    // Role/status are set only at sign-in from verified credentials.
    // Never accept privilege fields from session.update payloads.
    if (user) {
      token.id = user.id!;
      token.role = user.role;
      token.status = user.status;
    }

    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      session.user.id = token.id;
      session.user.role = token.role ?? "CLIENT";
      session.user.status = token.status ?? "ACTIVE";
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
  }
}
