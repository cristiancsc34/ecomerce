export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type AuditEvent = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  actorId: string | null;
};

export const AUDIT_LABELS: Record<string, string> = {
  "product.created": "Produto criado",
  "product.deleted": "Produto excluído",
  "product.status_changed": "Status alterado",
  "product.price_changed": "Preço alterado",
  "product.slug_changed": "Endereço (slug) alterado",
  "variant.created": "Variação criada",
  "variant.deleted": "Variação removida",
  "variant.price_changed": "Preço de variação alterado",
  "media.added": "Mídia enviada",
  "media.removed": "Mídia removida",
  "media.ai_approved": "Imagem de IA aprovada",
};
