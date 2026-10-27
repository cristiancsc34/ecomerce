import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
const isDev = process.env.NODE_ENV !== "production";

// CSP pragmática: sem nonces (que forçariam renderização dinâmica em todas as
// rotas). Mesmo com 'unsafe-inline' em scripts, ela bloqueia frames, plugins,
// <base> e envio de formulários para outras origens, e restringe de onde vêm
// imagens, mídia, modelos 3D e conexões.
function contentSecurityPolicy() {
  const remote = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${remote}`,
    `media-src 'self' blob:${remote}`,
    `connect-src 'self' blob: data:${remote}${isDev ? " ws: wss:" : ""}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: new URL(supabaseOrigin).protocol.replace(":", "") as
              | "http"
              | "https",
            hostname: new URL(supabaseOrigin).hostname,
            port: new URL(supabaseOrigin).port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  experimental: {
    serverActions: {
      // Uploads passam pela Server Action para validação no servidor.
      // 4 MB de arquivo + folga para o multipart. A Vercel limita o corpo
      // das funções a 4,5 MB, por isso o limite de arquivo é 4 MB.
      bodySizeLimit: "4.4mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
