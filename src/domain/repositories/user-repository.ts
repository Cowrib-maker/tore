import type { User, CreateUserInput } from "@/domain/entities/user";
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
}
