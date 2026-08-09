import bcrypt from "bcryptjs";

import type { User } from "@/domain/entities/user";
import { UnauthorizedError } from "@/domain/errors/domain-error";
import { isAccountUsable } from "@/domain/services/rbac";
import { userRepository } from "@/infrastructure/repositories";

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<User> {
  const record = await userRepository.findByEmailWithPasswordHash(email);

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
