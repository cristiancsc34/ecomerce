/**
 * Áreas do painel (instrução do dono, 04/11/2026): cada senha abre só a sua parte; a senha geral abre tudo.
 * A regra de verdade está no banco (supabase/migrations/20261104000200_areas_do_painel.sql); aqui ficam o menu, as
 * páginas e as ações, para a pessoa nem ver o que não é dela. Ver docs/PAINEL.md.
 */

export const AREAS = ["itens", "pedidos", "entrega"] as const;
export type AreaDoPainel = (typeof AREAS)[number];

export const ROTULO_AREA: Record<AreaDoPainel, string> = {
  itens: "Itens",
  pedidos: "Pedidos",
  entrega: "Entrega e avisos",
};

export const DESCRICAO_AREA: Record<AreaDoPainel, string> = {
  itens: "Produtos, fotos e 3D, categorias e o histórico do catálogo.",
  pedidos: "Pedidos, avisos ao cliente e o andamento na fábrica e na logística (Trama).",
  entrega: "Formas de entrega (frete por região) e os avisos automáticos.",
};

export type AcessoDaEquipe = { role: "admin" | "editor"; areas: readonly AreaDoPainel[] };

export const ehArea = (valor: unknown): valor is AreaDoPainel => typeof valor === "string" && (AREAS as readonly string[]).includes(valor);

/** Mesma regra do banco (private.has_area): administrador vê tudo; conta sem áreas marcadas, também. */
export function podeUsar(acesso: AcessoDaEquipe, area: AreaDoPainel): boolean {
  return acesso.role === "admin" || acesso.areas.length === 0 || acesso.areas.includes(area);
}

export function areasDe(acesso: AcessoDaEquipe): AreaDoPainel[] {
  return AREAS.filter((a) => podeUsar(acesso, a));
}

/** Acesso geral: administrador, ou conta antiga sem áreas marcadas (vê o painel inteiro, como antes). */
export const acessoGeral = (acesso: AcessoDaEquipe) => acesso.role === "admin" || acesso.areas.length === 0;

/** Área de cada caminho do painel; null = todos da equipe (início, login). */
export function areaDoCaminho(pathname: string): AreaDoPainel | null {
  if (/^\/admin\/(produtos|categorias|atividade)(\/|$)/.test(pathname)) return "itens";
  if (/^\/admin\/pedidos(\/|$)/.test(pathname)) return "pedidos";
  if (/^\/admin\/entrega(\/|$)/.test(pathname)) return "entrega";
  return null;
}

/** Nome que aparece no rodapé do menu. */
export function rotuloDoAcesso(acesso: AcessoDaEquipe): string {
  if (acesso.role === "admin") return "Administração geral";
  if (!acesso.areas.length) return "Equipe";
  return acesso.areas.map((a) => ROTULO_AREA[a]).join(", ");
}
