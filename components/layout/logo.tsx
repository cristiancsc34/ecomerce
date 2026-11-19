import { Montserrat } from "next/font/google";
import { brand } from "@/config/brand";

/**
 * Logo da AzConfort: só o nome, em Montserrat ExtraBold, sem símbolo.
 * "Az" em coral e "Confort" em petróleo (ou branco, em fundo escuro).
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: "800",
  display: "swap",
  adjustFontFallback: true,
});

export const LOGO_COLORS = { coral: "#F08A5D", petroleo: "#0E2F3D" } as const;

type LogoProps = { tone?: "color" | "white"; className?: string };

export function Logo({ tone = "color", className = "" }: LogoProps) {
  const name = brand.name;
  const split = name.startsWith("Az") && name.length > 2;
  const rest = tone === "white" ? "#FFFFFF" : LOGO_COLORS.petroleo;
  return (
    <span
      className={`${montserrat.className} whitespace-nowrap tracking-tight ${className}`}
      style={{ fontWeight: 800 }}
    >
      {split ? (
        <>
          <span style={{ color: LOGO_COLORS.coral }}>Az</span>
          <span style={{ color: rest }}>{name.slice(2)}</span>
        </>
      ) : (
        <span style={{ color: rest }}>{name}</span>
      )}
    </span>
  );
}
