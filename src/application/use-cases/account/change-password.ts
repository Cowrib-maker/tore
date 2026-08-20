import { compare, hash } from "bcryptjs";

import type { ChangePasswordInput } from "@/application/validators/account.schema";
import { NotFoundError, ValidationError } from "@/domain/errors/domain-error";
import type { UserRepository } from "@/domain/repositories/user-repository";

export type ChangePasswordDeps = {
  userRepository: UserRepository;
};

export async function changePasswordUseCase(
  userId: string,
  input: ChangePasswordInput,
  deps: ChangePasswordDeps,
): Promise<void> {
  const user = await deps.userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError("User", userId);
  }

  const withHash = await deps.userRepository.findByEmailWithPasswordHash(
    user.email,
  );
  if (!withHash) {
    throw new ValidationError("This account has no password to change");
  }

  const valid = await compare(input.currentPassword, withHash.passwordHash);
  if (!valid) {
    throw new ValidationError("Current password is incorrect");
  }

  const passwordHash = await hash(input.newPassword, 12);
  await deps.userRepository.updatePasswordHash(userId, passwordHash);
}
