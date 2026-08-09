import type { NextAuthConfig } from "next-auth";

import { edgeAuthCallbacks } from "@/infrastructure/auth/auth.callbacks";

export const edgeAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: edgeAuthCallbacks,
} satisfies NextAuthConfig;
