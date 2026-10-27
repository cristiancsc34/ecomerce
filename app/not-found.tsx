import StoreLayout from "./(store)/layout";
import StoreNotFound from "./(store)/not-found";

/** URLs que não existem: mesma moldura da loja (cabeçalho, rodapé). */
export default function NotFound() {
  return (
    <StoreLayout>
      <StoreNotFound />
    </StoreLayout>
  );
}
