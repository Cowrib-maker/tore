import type { NextAuthConfig } from "next-auth";

import { UserRole, UserStatus } from "@/domain/enums";
import {
  decideActiveSession,
  generateActiveSessionId,
  hashActiveSessionId,
} from "@/domain/services/active-session";
import { isAdminDevtoolsEnabled } from "@/lib/feature-flags";

const ROLE_VALUES = new Set<string>(Object.values(UserRole));
const STATUS_VALUES = new Set<string>(Object.values(UserStatus));

/** Privilege fields refresh at most once per minute per JWT (Node only). */
export const PRIVILEGE_REFRESH_MS = 60_000;

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && ROLE_VALUES.has(value);
}

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && STATUS_VALUES.has(value);
}

function tokenSid(token: { sid?: unknown }): string | undefined {
  return typeof token.sid === "string" && token.sid.trim()
    ? token.sid
    : undefined;
}

type ImpersonationUpdate = {
  impersonateUserId?: string;
  stopImpersonation?: boolean;
};

/**
 * Node runtime callbacks: refresh role + status from the database so demotions
 * and suspensions take effect without waiting for full JWT expiry.
 * Also enforces a single active session identifier per account.
 * Privilege fields are never accepted from session.update payloads — except
 * admin-devtools impersonation, which is verified server-side against the DB.
 */
export const nodeAuthCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  async jwt({ token, user, trigger, session }) {
    const isNewSignIn = Boolean(user);

    if (user) {
      if (
        !user.id ||
        !isUserRole(user.role) ||
        !isUserStatus(user.status) ||
        typeof user.sessionId !== "string" ||
        !user.sessionId
      ) {
        return {};
      }
      token.id = user.id;
      token.role = user.role;
      token.status = user.status;
      token.sid = user.sessionId;
      token.statusCheckedAt = Date.now();
      delete token.impersonatorId;
      delete token.sessionReplaced;
    }

    if (trigger === "update" && session && typeof session === "object") {
      const update = session as ImpersonationUpdate;
      // Never copy sid/sessionId from session.update — those are not client-writable.
      const { userRepository } = await import(
        "@/infrastructure/repositories"
      );

      if (update.stopImpersonation && token.impersonatorId) {
        const admin = await userRepository.findById(token.impersonatorId);
        if (
          admin &&
          !admin.deletedAt &&
          admin.role === UserRole.ADMIN &&
          admin.status === UserStatus.ACTIVE
        ) {
          token.id = admin.id;
          token.role = admin.role;
          token.status = admin.status;
          token.statusCheckedAt = Date.now();
          delete token.impersonatorId;
        }
      } else if (
        update.impersonateUserId &&
        typeof update.impersonateUserId === "string" &&
        isAdminDevtoolsEnabled()
      ) {
        const adminId =
          typeof token.impersonatorId === "string"
            ? token.impersonatorId
            : typeof token.id === "string"
              ? token.id
              : null;
        if (adminId) {
          const admin = await userRepository.findById(adminId);
          const target = await userRepository.findById(update.impersonateUserId);
          if (
            admin &&
            !admin.deletedAt &&
            admin.role === UserRole.ADMIN &&
            admin.status === UserStatus.ACTIVE &&
            target &&
            !target.deletedAt &&
            target.status === UserStatus.ACTIVE &&
            target.role !== UserRole.ADMIN
          ) {
            token.impersonatorId = admin.id;
            token.id = target.id;
            token.role = target.role;
            token.status = target.status;
            token.statusCheckedAt = Date.now();
          }
        }
      }
    }

    if (!token.id || typeof token.id !== "string") {
      return {};
    }

    const { userRepository } = await import(
      "@/infrastructure/repositories"
    );
    const sessionOwnerId =
      typeof token.impersonatorId === "string"
        ? token.impersonatorId
        : token.id;
    const sessionOwner = await userRepository.findAuthPrincipal(sessionOwnerId);
    if (!sessionOwner) {
      return {};
    }

    if (isNewSignIn) {
      const sid = tokenSid(token);
      if (!sid) {
        return {};
      }
      // Last completed login wins if two authorizes race.
      await userRepository.rotateActiveSessionIdHash(
        sessionOwnerId,
        hashActiveSessionId(sid),
      );
    } else {
      const decision = decideActiveSession(
        tokenSid(token),
        sessionOwner.activeSessionIdHash,
      );
      if (decision.action === "replaced") {
        return { sessionReplaced: true };
      }
      if (decision.action === "bind-new") {
        const raw = generateActiveSessionId();
        await userRepository.rotateActiveSessionIdHash(
          sessionOwnerId,
          hashActiveSessionId(raw),
        );
        token.sid = raw;
      } else if (decision.action === "bind-token") {
        const sid = tokenSid(token);
        if (!sid) {
          return { sessionReplaced: true };
        }
        await userRepository.rotateActiveSessionIdHash(
          sessionOwnerId,
          hashActiveSessionId(sid),
        );
      }
    }

    const checkedAt =
      typeof token.statusCheckedAt === "number" ? token.statusCheckedAt : 0;
    const now = Date.now();
    const privilegeUserId = token.id;

    if (isNewSignIn || now - checkedAt >= PRIVILEGE_REFRESH_MS) {
      const record =
        privilegeUserId === sessionOwnerId
          ? sessionOwner
          : await userRepository.findAuthPrincipal(privilegeUserId);
      if (!record) {
        return {};
      }
      token.role = record.role;
      token.status = record.status;
      token.statusCheckedAt = now;
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
