/** Canonical TORE brand tokens — keep marks, icons, and OG art in sync. */
export const BRAND_COLORS = {
  forest: "#0F3D33",
  gold: "#C8A45D",
  ivory: "#F7FAF8",
  /** App / dashboard shell surface (cool). */
  canvas: "#FAFBFA",
  /** Marketing page canvas — warm ivory (Harvey / Linear tone). */
  marketing: "#FAF9F7",
  ink: "#0A0F14",
} as const;

/** Official secondary brand line — not used in navbar/header. */
export const BRAND_TAGLINE = "LEGAL. AI. CONNECTED.";

/** Default logo proportions for app chrome (auth, dashboards, directory). */
export const BRAND_LOGO_SHELL = {
  markClassName: "size-9",
  wordmarkClassName: "text-base tracking-[-0.02em]",
  className: "gap-3.5",
} as const;

/** Marketing / landing header lockup — wordmark only in nav. */
export const BRAND_LOGO_LANDING = {
  markClassName: "size-[2.875rem] sm:size-[3.15rem]",
  wordmarkClassName: "text-[1.2rem] sm:text-[1.35rem] tracking-[-0.02em]",
  className: "gap-4",
} as const;

export const BRAND_NAME = "TORE";
