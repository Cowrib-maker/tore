import { NextResponse } from "next/server";

import { DomainError } from "@/domain/errors/domain-error";

export function caseFileErrorResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    const status =
      error.code === "VALIDATION_ERROR" ? 400 : error.statusCode;
    const message =
      error.code === "NOT_FOUND"
        ? "Хүссэн нөөц олдсонгүй."
        : error.code === "FORBIDDEN"
          ? "Энэ үйлдлийг хийх эрхгүй."
          : error.code === "UNAUTHORIZED"
            ? "Үргэлжлүүлэхийн тулд нэвтэрнэ үү."
            : error.code === "SESSION_REPLACED"
              ? error.message
              : error.code === "CONFLICT"
              ? "Хэргийг өөр сессэд шинэчилсэн байна."
              : error.message;
    return NextResponse.json({ error: message, code: error.code }, { status });
  }
  console.error(error);
  return NextResponse.json({ error: "Гэнэтийн алдаа гарлаа." }, { status: 500 });
}
