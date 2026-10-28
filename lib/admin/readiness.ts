import type { Product } from "@/lib/catalog/types";
import { publishIssues } from "@/lib/validation/product";

/** Abas da página de edição do produto. */
export type ProductTab = "fotos" | "informacoes" | "preco" | "detalhes" | "seo";

export function isProductTab(value: unknown): value is ProductTab {
  return value === "fotos" || value === "informacoes" || value === "preco" || value === "detalhes" || value === "seo";
}

export type ReadinessItem = {
  key: "fotos" | "3d" | "descricao" | "categoria" | "preco" | "textos-alternativos";
  label: string;
  done: boolean;
  /** O que falta, em uma frase (só quando não está feito). */
  hint: string | null;
  tab: ProductTab;
};

/**
 * Checklist "pronto para vender". Usa as MESMAS regras da publicação
 * (publishIssues), então o que aparece aqui é exatamente o que bloqueia publicar.
 */
export function readiness(product: Product): ReadinessItem[] {
  const issues = publishIssues(product);
  const has = (pred: (message: string, field: string) => boolean) =>
    issues.find((i) => pred(i.message, i.field))?.message ?? null;

  const photos = has((m, f) => f === "media" && /foto/i.test(m) && !/3D/.test(m));
  const model = has((m, f) => f === "media" && /3D/.test(m));
  const alt = has((m, f) => f === "media" && /texto alternativo/i.test(m));
  const items: ReadinessItem[] = [
    { key: "fotos", label: "Fotos", done: !photos, hint: photos, tab: "fotos" },
  ];
  if (product.category?.requires3d) {
    items.push({ key: "3d", label: "Modelo 3D", done: !model, hint: model, tab: "fotos" });
  }
  const category = has((_, f) => f === "categoryId");
  const description = has((_, f) => f === "description");
  const price = has((_, f) => f === "price");
  items.push(
    { key: "categoria", label: "Categoria", done: !category, hint: category, tab: "informacoes" },
    { key: "descricao", label: "Descrição", done: !description, hint: description, tab: "informacoes" },
    { key: "preco", label: "Preço", done: !price, hint: price, tab: "preco" },
    { key: "textos-alternativos", label: "Descrição das fotos", done: !alt, hint: alt, tab: "fotos" },
  );
  return items;
}

/** Resumo para listas: quanto falta e o primeiro item pendente. */
export function readinessSummary(product: Product): { done: number; total: number; next: ReadinessItem | null } {
  const items = readiness(product);
  return { done: items.filter((i) => i.done).length, total: items.length, next: items.find((i) => !i.done) ?? null };
}

/** "Falta: modelo 3D" — só a primeira letra minúscula (siglas como 3D ficam como estão). */
export function missingLabel(item: ReadinessItem): string {
  return `Falta: ${item.label.charAt(0).toLowerCase()}${item.label.slice(1)}`;
}

/** Fotos de catálogo da IA que ainda esperam a conferência da equipe. */
export function pendingAiPhotos(product: Product): number {
  return product.media.filter((m) => m.aiGenerated && m.pendingReview).length;
}
