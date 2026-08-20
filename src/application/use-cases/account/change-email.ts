import { compare } from "bcryptjs";

import type { ChangeEmailInput } from "@/application/validators/account.schema";
import type { User } from "@/domain/entities/user";
import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type ChangeEmailDeps = {
  userRepository: UserRepository;
};

export async function changeEmailUseCase(
  userId: string,
  input: ChangeEmailInput,
  deps: ChangeEmailDeps,
): Promise<User> {
  const user = await deps.userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError("User", userId);
  }

  const withHash = await deps.userRepository.findByEmailWithPasswordHash(
    user.email,
  );
  if (!withHash) {
    throw new ValidationError("This account has no password to verify");
  }

  const valid = await compare(input.currentPassword, withHash.passwordHash);
  if (!valid) {
    throw new ValidationError("Current password is incorrect");
  }

  if (input.newEmail === user.email) {
    throw new ValidationError("This is already your email address");
  }

  const taken = await deps.userRepository.emailExists(input.newEmail);
  if (taken) {
    throw new ValidationError("This email is already in use");
  }

  return deps.userRepository.updateEmail(userId, input.newEmail);
}
