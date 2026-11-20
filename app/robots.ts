import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // Trava de indexação fechada (issue #17) ou modo demonstração: nada vai para o Google
  // e o robots.txt não anuncia o sitemap.
  if (!indexingAllowed()) {
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
