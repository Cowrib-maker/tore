import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { authConfig } from "@/infrastructure/auth/auth.config";
import { prisma } from "@/infrastructure/database/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  ...authConfig,
});
