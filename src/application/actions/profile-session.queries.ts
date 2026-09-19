// Plain (non "use server") module: these are React-cache()-wrapped
// server-side data queries used by page.tsx server components, not
// mutations invoked from a <form action>. They must NOT live in a
// "use server" file — Next.js requires every export from such a file to
// be a literal async function, and a `const x = cache(async () => {})`
// export does not qualify (same class of bug fixed in student.actions.ts
// for a plain synchronous helper).
import { cache } from "react";

import { getSessionUser } from "@/application/common/session";
import type { ClientProfile, LawyerProfile } from "@/domain/entities/profile";
import type { User } from "@/domain/entities/user";
import { UserRole } from "@/domain/enums";
import { canActAsClient } from "@/domain/services/rbac";
import {
  clientProfileRepository,
  lawyerProfileRepository,
  userRepository,
} from "@/infrastructure/repositories";
import { resolveProfilePhotoUrl } from "@/infrastructure/storage/file-access";

export type ClientProfileSessionResult =
  | { status: "ok"; user: User; profile: ClientProfile }
  | { status: "unauthenticated" }
  | { status: "profile_missing"; user: User };

export type LawyerProfileSessionResult =
  | {
      status: "ok";
      user: User;
      profile: LawyerProfile;
      hasActiveOffering: boolean;
      photoUrl: string | null;
    }
  | { status: "unauthenticated" }
  | { status: "profile_missing"; user: User };

export const getClientProfileForSession = cache(
  async (): Promise<ClientProfileSessionResult> => {
    const session = await getSessionUser();
    if (
      !session?.user?.id ||
      !canActAsClient(session.user.role as UserRole)
    ) {
      return { status: "unauthenticated" };
    }

    const [user, profile] = await Promise.all([
      userRepository.findById(session.user.id),
      clientProfileRepository.findByUserId(session.user.id),
    ]);

    if (!user) {
      return { status: "unauthenticated" };
    }

    if (!profile) {
      return { status: "profile_missing", user };
    }

    return { status: "ok", user, profile };
  },
);

export const getLawyerProfileForSession = cache(
  async (): Promise<LawyerProfileSessionResult> => {
    const session = await getSessionUser();
    if (!session?.user?.id || session.user.role !== UserRole.LAWYER) {
      return { status: "unauthenticated" };
    }

    const [user, profile] = await Promise.all([
      userRepository.findById(session.user.id),
      lawyerProfileRepository.findByUserId(session.user.id),
    ]);

    if (!user) {
      return { status: "unauthenticated" };
    }

    if (!profile) {
      return { status: "profile_missing", user };
    }

    const hasActiveOffering = await lawyerProfileRepository.hasActiveOffering(
      profile.id,
    );
    const photoUrl = resolveProfilePhotoUrl(user.image, { forOwner: true });

    return { status: "ok", user, profile, hasActiveOffering, photoUrl };
  },
);
