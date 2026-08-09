import { cn } from "@/lib/utils";

const FOREST = "#0F3D33";
const GOLD = "#C8A45D";
const IVORY = "#F7FAF8";

export type ToreMarkProps = {
  className?: string;
  /** on-light pages use forest tile; on-dark surfaces use ivory tile. */
  tone?: "on-light" | "on-dark";
  /** When true, hide from accessibility tree (paired with visible wordmark). */
  decorative?: boolean;
};

/**
 * Geometric "T" monogram with warm gold node accents.
 */
export function ToreMark({
  className,
  tone = "on-light",
  decorative = false,
}: ToreMarkProps) {
  const onDark = tone === "on-dark";
  const tile = onDark ? IVORY : FOREST;
  const bar = onDark ? FOREST : IVORY;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "TORE"}
    >
      {!decorative ? <title>TORE</title> : null}
      <rect
        width="64"
        height="64"
        rx="14"
        fill={tile}
        stroke={onDark ? FOREST : undefined}
        strokeWidth={onDark ? 1.5 : undefined}
      />
      <path d="M16 18h32v7H16V18z" fill={bar} />
      <path d="M28.5 25h7v21h-7V25z" fill={bar} />
      <circle cx="16" cy="21.5" r="2.4" fill={GOLD} />
      <circle cx="48" cy="21.5" r="2.4" fill={GOLD} />
      <circle cx="32" cy="48" r="2.4" fill={GOLD} />
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
};

/**
 * Premium mark + wordmark. Use inside BrandLink for navigation.
 */
export function ToreLogo({
  className,
  markClassName,
  wordmarkClassName,
  variant = "full",
  tone = "on-light",
  brand = "TORE",
}: ToreLogoProps) {
  const onDark = tone === "on-dark";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ToreMark
        tone={tone}
        decorative={variant === "full"}
        className={cn("size-7", markClassName)}
      />
      {variant === "full" ? (
        <span
          className={cn(
            "text-[15px] font-semibold tracking-[-0.04em]",
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
