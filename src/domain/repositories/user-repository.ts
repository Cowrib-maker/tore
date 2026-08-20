import type {
  User,
  CreateUserInput,
  UpdateUserProfileInput,
} from "@/domain/entities/user";
import type { UserRole } from "@/domain/enums";

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
}
