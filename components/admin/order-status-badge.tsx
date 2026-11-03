import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { Badge } from "@/components/ui/badge";

const TONE: Record<OrderStatus, "neutral" | "info" | "warm" | "success" | "danger" | "dark"> = {
  recebido: "warm",
  pago: "info",
  em_preparacao: "info",
  enviado: "dark",
  saiu_para_entrega: "dark",
  entregue: "success",
  cancelado: "neutral",
  devolucao_solicitada: "danger",
  devolvido: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
