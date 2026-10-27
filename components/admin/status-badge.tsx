import { STATUS_LABELS, type ProductStatus } from "@/lib/catalog/types";
import { Badge } from "@/components/ui/badge";

const TONES = {
  draft: "neutral",
  review: "warm",
  published: "success",
  archived: "info",
} as const;

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
