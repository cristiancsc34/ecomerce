"use client";

import Form from "next/form";
import type { ReactNode } from "react";

/**
 * Formulário GET dos filtros. Sem JavaScript, funciona como um <form> comum
 * (filtros na URL, compartilháveis). Com JavaScript, navega no cliente e aplica
 * caixas de seleção e ordenação assim que mudam.
 */
export function FilterForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  return (
    <Form
      action={action}
      scroll={false}
      className={className}
      onChange={(e) => {
        const target = e.target;
        const autoSubmit =
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "radio"));
        if (autoSubmit) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
