import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Sacola",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-[80rem] px-2 pt-2 sm:px-6 sm:pt-6 lg:px-8">
      <h1 className="mb-2 border-b-4 border-air-blue-ink bg-white px-4 py-3 text-base font-bold uppercase tracking-wide text-air-blue-ink sm:mb-3 sm:rounded-t-lg">
        Sua sacola
      </h1>
      <CartView />
    </div>
  );
}
