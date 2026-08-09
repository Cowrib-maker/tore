import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "div" | "section" | "article";
};

/**
 * Marketplace panel: rounded-2xl + brand border + white fill.
 */
export function Surface({
  children,
  className,
  padded = false,
  as: Comp = "div",
}: SurfaceProps) {
  return (
    <Comp
      data-slot="surface"
      className={cn(padded ? "ds-surface-pad" : "ds-surface", className)}
    >
      {children}
    </Comp>
  );
}
