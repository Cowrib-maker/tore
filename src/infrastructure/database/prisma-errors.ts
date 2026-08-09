import { Prisma } from "@/generated/prisma/client";
import { ConflictError } from "@/domain/errors/domain-error";

export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function mapUniqueViolation(
  error: unknown,
  message: string,
): never {
  if (isPrismaUniqueViolation(error)) {
    throw new ConflictError(message);
  }
  throw error;
}
