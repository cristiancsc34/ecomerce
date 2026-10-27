"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/misc";

export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<AlertIcon className="h-7 w-7" />}
        title="Algo não carregou como deveria"
        action={
          <>
            <Button onClick={() => reset()}>Tentar de novo</Button>
            <ButtonLink href="/" variant="secondary">
              Voltar ao início
            </ButtonLink>
          </>
        }
      >
        Pode ser uma instabilidade momentânea. Tente de novo em alguns segundos.
      </EmptyState>
    </div>
  );
}
