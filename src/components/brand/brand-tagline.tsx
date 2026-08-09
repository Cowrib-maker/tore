import { cn } from "@/lib/utils";

import { BRAND_TAGLINE } from "@/components/brand/tokens";

export type BrandTaglineProps = {
  className?: string;
  as?: "p" | "span";
};

/**
 * Secondary brand line. Never render inside navbar/header lockups.
 * Typography: 600 / 0.24em / 10→12px / #C8A45D / centered / mt 10px.
 */
export function BrandTagline({ className, as: Tag = "p" }: BrandTaglineProps) {
  return (
    <Tag
      className={cn(
        "mt-[10px] text-center text-[10px] font-semibold tracking-[0.24em] text-[#C8A45D] uppercase sm:text-xs",
        className,
      )}
    >
      {BRAND_TAGLINE}
    </Tag>
  );
}
