import type { Metadata } from "next";
import { Suspense } from "react";
import { getOrderTracking } from "@/lib/orders/tracking";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { OrderView } from "@/components/orders/order-tracking-view";
import { TrackOrderForm } from "@/components/orders/track-order-form";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Acompanhar pedido",
  // Página pessoal de cada pedido: nunca indexar.
  robots: { index: false, follow: false },
};

// Cache Components exige ao menos um parâmetro para montar o esqueleto da página; este cai no formulário de consulta.
export function generateStaticParams() {
  return [{ codigo: "__consulta__" }];
}

export default function TrackingPage({ params, searchParams }: PageProps<"/pedido/[codigo]">) {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Acompanhar pedido" }]} />
      <Suspense fallback={<Skeleton className="mt-6 h-96 w-full rounded-2xl" />}>
        <Tracking params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Tracking({ params, searchParams }: Pick<PageProps<"/pedido/[codigo]">, "params" | "searchParams">) {
  const [{ codigo }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const order = await getOrderTracking(decodeURIComponent(codigo), token);
  if (!order || !token) {
    return (
      <div className="mx-auto mt-6 max-w-xl">
        <h1 className="text-3xl font-bold">Acompanhar pedido</h1>
        <p className="mt-2 text-muted">
          Não encontramos o pedido por este link. Informe o número do pedido e o celular usado na compra.
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <TrackOrderForm />
        </div>
      </div>
    );
  }
  // ?novo=1 vem do checkout do site: mostra o aviso "Pedido enviado!" no topo.
  return <OrderView order={order} token={token} isNew={sp.novo === "1"} />;
}
