import Image from "next/image";
import type { ProductMedia } from "@/lib/catalog/types";
import { ImageIcon } from "@/components/ui/icons";

/**
 * Imagem de produto com proporção reservada (sem layout shift).
 * SVGs de demonstração vão sem otimização; fotos reais passam pelo
 * otimizador do Next (AVIF/WebP + tamanhos responsivos).
 */
export function ProductImage({
  media,
  sizes,
  priority = false,
  className = "",
  showIllustrativeBadge = true,
  aspect = "aspect-[4/3]",
}: {
  media: ProductMedia | null;
  sizes: string;
  priority?: boolean;
  className?: string;
  showIllustrativeBadge?: boolean;
  aspect?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-pale-blue ${aspect} ${className}`}>
      {media ? (
        <Image
          src={media.url}
          alt={media.altText}
          fill
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          unoptimized={media.url.endsWith(".svg")}
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
          <ImageIcon className="h-10 w-10" />
          <span className="text-sm">Foto em breve</span>
        </div>
      )}
      {media?.isIllustrative && showIllustrativeBadge ? (
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
          Imagem ilustrativa
        </span>
      ) : null}
    </div>
  );
}
