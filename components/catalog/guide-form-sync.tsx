"use client";

import { useEffect } from "react";

/**
 * Marca no formulário do guia as respostas que estão na URL (ex.: ao voltar
 * para ajustar). O formulário é estático — não é trocado durante o streaming —
 * e não sobrescreve escolhas que a pessoa já tenha feito.
 */
export function GuideFormSync({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const params = new URLSearchParams(window.location.search);
    for (const [name, value] of params) {
      const field = form.elements.namedItem(name);
      if (field instanceof RadioNodeList) {
        // Não sobrescreve uma escolha que a pessoa já fez (exceto o padrão "não sei").
        const chosen = [...field].some((el) => el instanceof HTMLInputElement && el.checked && el.value !== "nao-sei");
        if (chosen) continue;
        for (const el of field) {
          if (el instanceof HTMLInputElement && el.value === value) el.checked = true;
        }
      } else if (field instanceof HTMLSelectElement && [...field.options].some((o) => o.value === value)) {
        field.value = value;
      }
    }
  }, [formId]);
  return null;
}
