import { ImageResponse } from "next/og";

import {
  BRAND_COLORS,
  BRAND_NAME,
  BRAND_TAGLINE,
} from "@/components/brand/tokens";

export const alt = "TORE — Legal Marketplace · Mongolia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social preview card. PNG required by networks.
 * Mark matches canonical ToreMark (angular T + gold square) on app tile.
 * Tagline sits beneath TORE (not used in navbar lockups).
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: BRAND_COLORS.marketing,
          backgroundImage:
            "radial-gradient(circle at 18% 20%, rgba(15,61,51,0.12), transparent 42%), radial-gradient(circle at 88% 78%, rgba(200,164,93,0.14), transparent 40%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              backgroundColor: BRAND_COLORS.forest,
              display: "flex",
              position: "relative",
            }}
          >
            {/* Top bar */}
            <div
              style={{
                position: "absolute",
                top: 22,
                left: 18,
                width: 58,
                height: 18,
                backgroundColor: BRAND_COLORS.ivory,
              }}
            />
            {/* Left under-piece */}
            <div
              style={{
                position: "absolute",
                top: 40,
                left: 26,
                width: 16,
                height: 28,
                backgroundColor: BRAND_COLORS.ivory,
              }}
            />
            {/* Stem */}
            <div
              style={{
                position: "absolute",
                top: 40,
                left: 46,
                width: 20,
                height: 42,
                backgroundColor: BRAND_COLORS.ivory,
              }}
            />
            {/* Gold square */}
            <div
              style={{
                position: "absolute",
                top: 22,
                left: 80,
                width: 14,
                height: 14,
                backgroundColor: BRAND_COLORS.gold,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: BRAND_COLORS.forest,
                lineHeight: 1,
              }}
            >
              {BRAND_NAME}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 18,
                fontWeight: 500,
                color: BRAND_COLORS.gold,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                textAlign: "center",
              }}
            >
              {BRAND_TAGLINE}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: BRAND_COLORS.ink,
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Verified counsel. Transparent fees. Consultation requests online.
        </div>
      </div>
    ),
    { ...size },
  );
}
