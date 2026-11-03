import type { Metadata } from "next";
import { catalogSource, isSupabaseConfigured } from "@/config/site";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Finalizar pedido",
  // Página pessoal do pedido: nunca indexar.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  // O pedido pelo site precisa do banco (Supabase) e do catálogo real; em demonstração, o cliente fala com o atendimento.
  const enabled = isSupabaseConfigured() && catalogSource() === "supabase";
  return (
    <div className="mx-auto w-full max-w-[80rem] px-2 pt-2 pb-8 sm:px-6 sm:pt-6 lg:px-8">
      <h1 className="mb-2 border-b-4 border-air-blue-ink bg-white px-4 py-3 text-base font-bold uppercase tracking-wide text-air-blue-ink sm:mb-3 sm:rounded-t-lg">
        Finalizar pedido
      </h1>
      <CheckoutView enabled={enabled} />
    </div>
  );
}
