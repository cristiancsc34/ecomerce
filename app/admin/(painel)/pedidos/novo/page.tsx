import type { Metadata } from "next";
import Link from "next/link";
import { orderProductOptions } from "@/lib/admin/orders";
import { requireStaffPage } from "@/lib/auth/staff";
import { OrderForm } from "@/components/admin/order-form";
import { PageHeader } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function NewOrderPage() {
  await requireStaffPage();
  const products = await orderProductOptions();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/pedidos" className="link text-sm">
        ← Pedidos
      </Link>
      <div className="mt-3">
        <PageHeader title="Novo pedido" subtitle="Venda fechada pelo WhatsApp, telefone ou na loja. Só dados confirmados com o cliente." />
      </div>
      <OrderForm products={products} />
    </div>
  );
}
