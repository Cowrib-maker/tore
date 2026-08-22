import { NextResponse } from "next/server";

import { DomainError } from "@/domain/errors/domain-error";

export function sessionApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const status =
      error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
    const message =
      error.code === "NOT_FOUND"
        ? "The requested resource was not found."
        : error.code === "FORBIDDEN"
          ? "You do not have permission to perform this action."
          : error.code === "UNAUTHORIZED"
            ? "Please sign in to continue."
            : error.message;
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
  console.error(error);
  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
