import type { UserRole } from "@/domain/enums";

/** Authenticated actor for use-case authorization checks. */
export type ActorContext = {
  userId: string;
  role: UserRole;
};
