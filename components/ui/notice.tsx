import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

type Tone = "info" | "warning" | "danger" | "success" | "demo";

const styles: Record<Tone, { box: string; icon: string }> = {
  info: { box: "bg-pale-blue border-sky-mist", icon: "text-air-blue-ink" },
  warning: { box: "bg-linen/50 border-linen", icon: "text-ink" },
  demo: { box: "bg-warm-coral/30 border-warm-coral", icon: "text-ink" },
  danger: { box: "bg-[#FDECEA] border-[#F6C9C4]", icon: "text-danger" },
  success: { box: "bg-[#E3F2EA] border-[#BFDCCB]", icon: "text-success" },
};

/**
 * Aviso em bloco. O ícone é decorativo; o tom nunca é a única pista
 * (o título deixa claro do que se trata).
 */
export function Notice({
  tone = "info",
  title,
  children,
  className = "",
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const s = styles[tone];
  const Icon = tone === "success" ? CheckIcon : tone === "danger" || tone === "warning" ? AlertIcon : InfoIcon;
  return (
    <div role={role} className={`flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed ${s.box} ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.icon}`} />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-ink">{children}</div> : null}
      </div>
    </div>
  );
}
