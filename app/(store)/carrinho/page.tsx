import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Sacola",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Início", href: "/" }, { label: "Sacola" }]} />
      <h1 className="mb-6 mt-4 text-3xl font-bold sm:text-4xl">Sua sacola</h1>
      <CartView />
    </div>
  );
}
