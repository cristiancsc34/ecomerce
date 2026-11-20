import type { Metadata } from "next";
import StoreLayout from "./(store)/layout";
import StoreNotFound from "./(store)/not-found";

export const metadata: Metadata = {
  title: "Página não encontrada",
  robots: { index: false, follow: true },
};

/** URLs que não existem: mesma moldura da loja (cabeçalho, rodapé). */
export default function NotFound() {
  return (
    <StoreLayout>
      <StoreNotFound />
    </StoreLayout>
  );
}
