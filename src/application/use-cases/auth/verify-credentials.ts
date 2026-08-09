import bcrypt from "bcryptjs";

import type { User } from "@/domain/entities/user";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import type { UserRepository } from "@/domain/repositories/user-repository";
import { isAccountUsable } from "@/domain/services/rbac";

export type VerifyCredentialsDeps = {
  userRepository: UserRepository;
};

export async function verifyCredentials(
  email: string,
  password: string,
  deps: VerifyCredentialsDeps,
): Promise<User> {
  const record = await deps.userRepository.findByEmailWithPasswordHash(email);

  if (!record) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!isAccountUsable(record.user.status)) {
    throw new UnauthorizedError("Your account is not active");
  }

  const valid = await bcrypt.compare(password, record.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return record.user;
}
