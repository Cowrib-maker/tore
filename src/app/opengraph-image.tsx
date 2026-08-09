import { ImageResponse } from "next/og";

import { BRAND_COLORS, BRAND_NAME } from "@/components/brand/tokens";

export const alt = "TORE — Legal Marketplace · Mongolia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social preview card. PNG is required by major networks;
 * geometry mirrors the SVG monogram (forest tile + gold nodes).
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
          backgroundColor: BRAND_COLORS.canvas,
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
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 32,
                left: 28,
                width: 56,
                height: 14,
                backgroundColor: BRAND_COLORS.ivory,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 46,
                left: 49,
                width: 14,
                height: 42,
                backgroundColor: BRAND_COLORS.ivory,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 35,
                left: 24,
                width: 9,
                height: 9,
                borderRadius: 999,
                backgroundColor: BRAND_COLORS.gold,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 35,
                right: 24,
                width: 9,
                height: 9,
                borderRadius: 999,
                backgroundColor: BRAND_COLORS.gold,
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 22,
                left: 51,
                width: 9,
                height: 9,
                borderRadius: 999,
                backgroundColor: BRAND_COLORS.gold,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: BRAND_COLORS.forest,
                lineHeight: 1,
              }}
            >
              {BRAND_NAME}
            </div>
            <div
              style={{
                fontSize: 28,
                color: "#5A6B64",
                letterSpacing: "-0.01em",
              }}
            >
              Legal Marketplace · Mongolia
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
