import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "warm" | "demo" | "success" | "danger" | "dark";

const tones: Record<Tone, string> = {
  neutral: "bg-white text-ink border border-line",
  info: "bg-pale-blue text-deep-fjord border border-sky-mist",
  warm: "bg-linen/70 text-ink border border-linen",
  demo: "bg-warm-coral/60 text-ink border border-warm-coral",
  success: "bg-[#E3F2EA] text-success border border-[#BFDCCB]",
  danger: "bg-[#FDECEA] text-danger border border-[#F6C9C4]",
  dark: "bg-deep-fjord text-white border border-deep-fjord",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
