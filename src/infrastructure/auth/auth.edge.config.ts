import type { NextAuthConfig } from "next-auth";

import { authCallbacks } from "@/infrastructure/auth/auth.callbacks";

export const edgeAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: authCallbacks,
} satisfies NextAuthConfig;
