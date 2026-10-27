import Link from "next/link";
import { formatPrice } from "@/lib/catalog/money";
import { STATUS_LABELS, type ProductStatus } from "@/lib/catalog/types";
import { AUDIT_LABELS, type AuditEvent } from "@/lib/admin/types";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function describe(e: AuditEvent): string {
  const d = e.details;
  const name = typeof d.name === "string" ? d.name : null;
  const price = (v: unknown) => (typeof v === "number" ? formatPrice(v) : "sem preço");
  switch (e.action) {
    case "product.status_changed":
      return `${name ?? "Produto"}: ${STATUS_LABELS[d.from as ProductStatus] ?? d.from} → ${STATUS_LABELS[d.to as ProductStatus] ?? d.to}`;
    case "product.price_changed":
      return `${name ?? "Produto"}: ${price(d.from)} → ${price(d.to)}`;
    case "variant.price_changed":
      return `${String(d.variant ?? "Variação")}: ${price(d.from)} → ${price(d.to)}`;
    case "variant.created":
    case "variant.deleted":
      return String(d.variant ?? "");
    case "product.slug_changed":
      return `${String(d.from)} → ${String(d.to)}`;
    case "media.added":
    case "media.removed":
      return d.type === "model_3d" ? "Modelo 3D" : d.type === "video" ? "Vídeo" : "Imagem";
    default:
      return name ?? "";
  }
}

export function AuditList({ events, linkProducts = true }: { events: AuditEvent[]; linkProducts?: boolean }) {
  if (!events.length) return <p className="text-muted">Nenhuma atividade registrada ainda.</p>;
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-white">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-[0.9375rem]">
          <div className="min-w-0">
            <span className="font-semibold text-deep-fjord">{AUDIT_LABELS[e.action] ?? e.action}</span>
            <span className="text-ink"> · {describe(e)}</span>
            {linkProducts && e.entityType === "product" && e.entityId && e.action !== "product.deleted" ? (
              <Link href={`/admin/produtos/${e.entityId}`} className="link ml-2 text-sm">
                abrir
              </Link>
            ) : null}
          </div>
          <time dateTime={e.createdAt} className="shrink-0 text-sm text-muted">
            {dateFormat.format(new Date(e.createdAt))}
          </time>
        </li>
      ))}
    </ol>
  );
}
