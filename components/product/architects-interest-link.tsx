"use client";

import { track } from "@/lib/analytics";

/**
 * Link discreto "Peça o arquivo 3D": leva ao atendimento e registra o interesse
 * (evento arquitetos_interesse), para medir se vale a pena abrir a área de
 * arquitetos e designers antes de investir nela.
 */
export function ArchitectsInterestLink({ href, productId }: { href: string; productId: string }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      onClick={() => track("arquitetos_interesse", { produto_id: productId })}
      className="link font-medium"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      Peça o arquivo 3D e a ficha técnica
    </a>
  );
}
