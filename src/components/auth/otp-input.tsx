"use client";

import { useRef } from "react";

import { EMAIL_VERIFICATION_OTP_LENGTH } from "@/domain/services/email-verification-token";
import { cn } from "@/lib/utils";

const cellClassName =
  "h-12 w-10 min-w-0 rounded-lg border border-input bg-transparent px-0 text-center text-lg font-semibold tabular-nums transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

export function OtpInput({
  name = "otp",
  disabled,
  error,
  labelledBy,
  onComplete,
}: {
  name?: string;
  disabled?: boolean;
  error?: boolean;
  labelledBy?: string;
  onComplete?: (otp: string) => void;
}) {
  const length = EMAIL_VERIFICATION_OTP_LENGTH;
  const hiddenRef = useRef<HTMLInputElement>(null);
  const cellsRef = useRef<Array<HTMLInputElement | null>>([]);

  function currentValue(): string {
    return cellsRef.current.map((cell) => cell?.value ?? "").join("");
  }

  function writeHidden(value: string) {
    if (hiddenRef.current) {
      hiddenRef.current.value = value;
    }
  }

  function focusCell(index: number) {
    const next = Math.max(0, Math.min(length - 1, index));
    cellsRef.current[next]?.focus();
    cellsRef.current[next]?.select();
  }

  function applyDigits(digits: string, startIndex = 0) {
    const numeric = digits.replace(/\D/g, "").slice(0, length - startIndex);
    if (!numeric) return;
    for (let i = 0; i < numeric.length; i += 1) {
      const cell = cellsRef.current[startIndex + i];
      if (cell) cell.value = numeric[i] ?? "";
    }
    const value = currentValue();
    writeHidden(value);
    if (value.length === length) {
      onComplete?.(value);
    } else {
      focusCell(startIndex + numeric.length);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex justify-center gap-2"
    >
      <input ref={hiddenRef} type="hidden" name={name} defaultValue="" />
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            cellsRef.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={index === 0}
          pattern="[0-9]*"
          maxLength={1}
          disabled={disabled}
          aria-invalid={error}
          aria-label={`${index + 1} / ${length}`}
          data-otp-cell=""
          className={cn(cellClassName)}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            event.target.value = digit;
            const value = currentValue();
            writeHidden(value);
            if (digit && index < length - 1) {
              focusCell(index + 1);
            }
            if (/^\d{6}$/.test(value)) {
              onComplete?.(value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !event.currentTarget.value) {
              event.preventDefault();
              focusCell(index - 1);
              const previous = cellsRef.current[index - 1];
              if (previous) {
                previous.value = "";
                writeHidden(currentValue());
              }
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              focusCell(index - 1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              focusCell(index + 1);
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            applyDigits(event.clipboardData.getData("text"), 0);
          }}
        />
      ))}
    </div>
  );
}
