import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { authConfig } from "@/infrastructure/auth/auth.config";
import { sessionSyncAuthCallbacks } from "@/infrastructure/auth/auth.callbacks.node";
import { prisma } from "@/infrastructure/database/prisma";

const adapter = PrismaAdapter(prisma);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  adapter,
  ...authConfig,
});

// A separate Auth.js instance is used only by the cookie-capable session sync
// Route Handler. Its JWT callback may CAS-bind legacy sessions; the regular
// auth() instance remains read-only for RSC calls.
export const { auth: sessionSyncAuth } = NextAuth({
  adapter,
  ...authConfig,
  callbacks: sessionSyncAuthCallbacks,
});
