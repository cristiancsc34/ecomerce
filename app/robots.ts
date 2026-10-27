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
        disallow: ["/admin", "/api", "/carrinho", "/conta", "/busca"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
