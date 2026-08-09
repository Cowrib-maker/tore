"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

type LandingRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export function LandingReveal({
  children,
  className,
  delayMs = 0,
}: LandingRevealProps) {
  return (
    <div
      className={cn("landing-reveal", className)}
      style={{ "--landing-delay": `${delayMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
