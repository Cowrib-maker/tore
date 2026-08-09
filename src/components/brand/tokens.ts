/** Canonical TORE brand tokens — keep marks, icons, and OG art in sync. */
export const BRAND_COLORS = {
  forest: "#0F3D33",
  gold: "#C8A45D",
  ivory: "#F7FAF8",
  canvas: "#FAFBFA",
  ink: "#0A0F14",
} as const;

/** Default logo proportions for h-14 app chrome (auth, dashboards, directory). */
export const BRAND_LOGO_SHELL = {
  markClassName: "size-7",
  wordmarkClassName: "text-[15px]",
  className: "gap-2.5",
} as const;

/** Slightly larger logo for marketing / landing headers. */
export const BRAND_LOGO_LANDING = {
  markClassName: "size-8 sm:size-9",
  wordmarkClassName: "text-base sm:text-[1.125rem]",
  className: "gap-3",
} as const;

export const BRAND_NAME = "TORE";
