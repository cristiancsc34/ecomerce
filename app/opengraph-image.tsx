import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";
import { colors } from "@/config/tokens";

const LOGO_COLORS = { coral: "#F08A5D", petroleo: "#0E2F3D" } as const;

export const alt = `${brand.name} — ${brand.slogan}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: `linear-gradient(160deg, ${colors.paleBlue} 0%, ${colors.cloud} 60%, ${colors.skyMist} 100%)`,
        color: colors.deepFjord,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: -1,
        }}
      >
        <span style={{ color: LOGO_COLORS.coral }}>Az</span>
        <span style={{ color: LOGO_COLORS.petroleo }}>Confort</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          {brand.slogan}
        </div>
        <div style={{ fontSize: 30, color: colors.muted }}>{brand.tagline}</div>
      </div>
      <div
        style={{
          display: "flex",
          height: 14,
          borderRadius: 7,
          background: colors.airBlue,
          width: 260,
        }}
      />
    </div>,
    size,
  );
}
