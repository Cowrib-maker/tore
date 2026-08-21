import type {
  User,
  CreateUserInput,
  UpdateUserProfileInput,
} from "@/domain/entities/user";
import type { UserRole, UserStatus } from "@/domain/enums";

export type ListUsersInput = {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  limit: number;
  offset: number;
};

export type ListUsersResult = {
  items: User[];
  total: number;
};

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByIds(ids: string[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithPasswordHash(
    email: string,
  ): Promise<{ user: User; passwordHash: string } | null>;
  create(input: CreateUserInput): Promise<User>;
  emailExists(email: string): Promise<boolean>;
  isActiveUser(id: string): Promise<boolean>;
  findByRole(role: UserRole): Promise<User[]>;
  markEmailVerified(userId: string, verifiedAt?: Date): Promise<User>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<User>;
  updateProfile(userId: string, input: UpdateUserProfileInput): Promise<User>;
  /** Sets a new email and resets verification (the new address is unverified). */
  updateEmail(userId: string, email: string): Promise<User>;
  listUsers(input: ListUsersInput): Promise<ListUsersResult>;
  updateStatus(userId: string, status: UserStatus): Promise<User>;
}
