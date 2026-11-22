import { createHmac } from "node:crypto";
import type { NextAuthConfig } from "next-auth";

import { UserRole, UserStatus } from "@/domain/enums";
import {
  activeSessionHashesMatch,
  decideActiveSession,
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
 * Derive one stable SID for a legacy JWT. The JWT ID is stable across session
 * refreshes, so concurrent sync requests for the same cookie derive the same
 * SID and can safely race through the repository CAS operation.
 */
export function deriveLegacyActiveSessionId(
  userId: string,
  token: { jti?: unknown },
): string | null {
  const jti = typeof token.jti === "string" ? token.jti.trim() : "";
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!jti || !secret) return null;

  return createHmac("sha256", secret)
    .update(`tore-active-session-v1:${userId}:${jti}`, "utf8")
    .digest("hex");
}

type NodeAuthCallbackOptions = {
  /** Only the cookie-capable sync route may bind a legacy JWT in the DB. */
  bindLegacySession?: boolean;
};

/**
 * Node runtime callbacks refresh privileges and enforce one active session.
 * The normal auth() callback is read-only for session binding because it is
 * also called during RSC rendering, where refreshed cookies cannot be sent.
 * The dedicated session-sync Auth.js instance opts into CAS-based binding.
 */
export function createNodeAuthCallbacks(
  options: NodeAuthCallbackOptions = {},
): NonNullable<NextAuthConfig["callbacks"]> {
  return {
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

      const decision = decideActiveSession(
        tokenSid(token),
        sessionOwner.activeSessionIdHash,
      );
      if (decision.action === "replaced") {
        return { sessionReplaced: true };
      }

      // A login already persisted its SID in authorize(). Rewriting it here
      // creates a race where an earlier login callback can overwrite a later
      // login's hash. Verify only; never rotate during the JWT callback.
      if (isNewSignIn && decision.action !== "ok") {
        return { sessionReplaced: true };
      }

      if (
        !isNewSignIn &&
        options.bindLegacySession &&
        (decision.action === "bind-new" || decision.action === "bind-token")
      ) {
        const sid =
          tokenSid(token) ??
          deriveLegacyActiveSessionId(sessionOwnerId, token);
        if (!sid) {
          return { sessionReplaced: true };
        }

        const newHash = hashActiveSessionId(sid);
        const bound = await userRepository.compareAndRotateActiveSessionIdHash(
          sessionOwnerId,
          sessionOwner.activeSessionIdHash,
          newHash,
        );

        if (!bound) {
          // Another request may have won the CAS. Accept only if it bound this
          // exact JWT identity; otherwise this cookie has genuinely been
          // replaced by another login/session.
          const latest = await userRepository.findAuthPrincipal(sessionOwnerId);
          if (
            !latest ||
            !latest.activeSessionIdHash ||
            !activeSessionHashesMatch(latest.activeSessionIdHash, newHash)
          ) {
            return { sessionReplaced: true };
          }
        }

        token.sid = sid;
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
}

export const nodeAuthCallbacks = createNodeAuthCallbacks();
export const sessionSyncAuthCallbacks = createNodeAuthCallbacks({
  bindLegacySession: true,
});
