import { ButtonLink } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";

export default function StoreNotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<SearchIcon className="h-7 w-7" />}
        title="Página não encontrada"
        action={
          <>
            <ButtonLink href="/produtos">Ver produtos</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Voltar ao início
            </ButtonLink>
          </>
        }
      >
        O endereço pode ter mudado ou o produto não está mais disponível.
      </EmptyState>
    </div>
  );
}
