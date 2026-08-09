import { cn } from "@/lib/utils";

import { BRAND_COLORS, BRAND_NAME } from "@/components/brand/tokens";

export type ToreMarkProps = {
  className?: string;
  /**
   * on-light: forest mark (nav/marketing).
   * on-dark: ivory mark for dark surfaces.
   * app: white mark on forest rounded tile (favicon / app icon).
   */
  tone?: "on-light" | "on-dark" | "app";
  /** When true, hide from accessibility tree (paired with visible wordmark). */
  decorative?: boolean;
};

/** Canonical monogram paths (64×64). Brand sheet Aug 2026. */
function MarkGlyph({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      {/* Top bar — left edge chamfered downward */}
      <path d="M4 8H44V22H12L4 14V8Z" />
      {/* Left under-piece — short vertical with angled base */}
      <path d="M12 22H24V40L18 48H12V22Z" />
      {/* Right stem — taller, tapering tip */}
      <path d="M26 22H42V44L34 58L26 44V22Z" />
    </g>
  );
}

/**
 * Canonical TORE geometric monogram (brand sheet Aug 2026).
 * Angular T + gold square — replaces the legacy square-tile logo.
 */
export function ToreMark({
  className,
  tone = "on-light",
  decorative = false,
}: ToreMarkProps) {
  const framed = tone === "app";
  const mark =
    tone === "on-dark" || framed ? BRAND_COLORS.ivory : BRAND_COLORS.forest;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : BRAND_NAME}
    >
      {!decorative ? <title>{BRAND_NAME}</title> : null}
      {framed ? (
        <rect width="64" height="64" rx="14" fill={BRAND_COLORS.forest} />
      ) : null}
      <g transform={framed ? "translate(4 4) scale(0.875)" : undefined}>
        <MarkGlyph fill={mark} />
        <rect x="46" y="8" width="10" height="10" fill={BRAND_COLORS.gold} />
      </g>
    </svg>
  );
}

export type ToreLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  variant?: "full" | "mark";
  tone?: "on-light" | "on-dark";
  brand?: string;
  /**
   * @deprecated Tagline is never shown in the horizontal lockup (navbar rule).
   * Use `BrandTagline` under the logo on hero / footer / splash / OG.
   */
  showTagline?: boolean;
  /** @deprecated Unused — tagline uses BrandTagline. */
  taglineClassName?: string;
};

/**
 * Primary lockup: monogram + TORE. Navbar/header must not include the tagline.
 * Pair with `BrandTagline` on marketing, footer, splash, and social surfaces only.
 */
export function ToreLogo({
  className,
  markClassName,
  wordmarkClassName,
  variant = "full",
  tone = "on-light",
  brand = BRAND_NAME,
  showTagline: _showTagline = false,
  taglineClassName: _taglineClassName,
}: ToreLogoProps) {
  void _showTagline;
  void _taglineClassName;
  const onDark = tone === "on-dark";

  return (
    <span className={cn("inline-flex items-center gap-3.5", className)}>
      <ToreMark
        tone={tone}
        decorative={variant === "full"}
        className={cn("size-9", markClassName)}
      />
      {variant === "full" ? (
        <span
          className={cn(
            "text-base font-semibold leading-none tracking-[-0.02em]",
            onDark ? "text-[#F7FAF8]" : "text-[#0F3D33]",
            wordmarkClassName,
          )}
        >
          {brand}
        </span>
      ) : null}
    </span>
  );
}
