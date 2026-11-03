import type { MetadataRoute } from "next";
import { isDemoMode, siteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // Modo demonstração: dados fictícios não devem ser indexados.
  if (isDemoMode()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /pedido: páginas pessoais com link secreto; /finalizar: dados do cliente.
        disallow: ["/admin", "/api", "/carrinho", "/finalizar", "/pedido", "/conta", "/busca"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
