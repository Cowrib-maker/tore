import type { UserRole, UserStatus } from "@/domain/enums";

export interface User {
  id: string;
  email: string;
  emailVerified: Date | null;
  name: string | null;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  preferredLanguage?: string;
}
