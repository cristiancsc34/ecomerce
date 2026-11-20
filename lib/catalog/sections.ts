/**
 * Seções da loja (arquitetura de URLs para o Google): /colchoes, /estofados e
 * /moveis. As categorias do banco (painel → Categorias) entram numa seção pelo
 * começo do endereço (slug) e viram subcategoria dela:
 *
 * - `colch…`                                  → /colchoes/<slug>
 * - `estofad…`, `sofa…`, `poltrona…`, `puf…`… → /estofados/<slug>
 * - qualquer outra                            → /moveis/<slug>
 *
 * A categoria cujo slug é o próprio nome da seção (ex.: `colchoes`) é a seção
 * inteira (/colchoes), sem subpágina repetida.
 *
 * Este arquivo não importa nada: o next.config.ts usa os redirecionamentos
 * daqui (os endereços antigos /categorias/<slug> e o atalho /sofas).
 */

export const SECTION_KEYS = ["colchoes", "estofados", "moveis"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type SectionDef = {
  key: SectionKey;
  path: `/${SectionKey}`;
  /** Nome curto (menu, trilha de navegação). */
  name: string;
  /** Começos de slug de categoria do banco que pertencem à seção. `moveis` fica com o resto. */
  categoryPrefixes: readonly string[];
};

export const SECTIONS: readonly SectionDef[] = [
  { key: "colchoes", path: "/colchoes", name: "Colchões", categoryPrefixes: ["colch"] },
  {
    key: "estofados",
    path: "/estofados",
    name: "Estofados",
    categoryPrefixes: ["estofad", "sofa", "poltrona", "puf", "recamier", "chaise"],
  },
  { key: "moveis", path: "/moveis", name: "Móveis", categoryPrefixes: [] },
];

export function sectionByKey(key: SectionKey): SectionDef {
  return SECTIONS.find((s) => s.key === key)!;
}

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

/** Seção de uma categoria do banco (pelo slug). */
export function sectionKeyForCategory(slug: string): SectionKey {
  if (isSectionKey(slug)) return slug;
  const match = SECTIONS.find((s) => s.categoryPrefixes.some((prefix) => slug.startsWith(prefix)));
  return match?.key ?? "moveis";
}

/** A categoria é a própria seção (não vira subpágina)? */
export function isSectionCategory(slug: string): boolean {
  return isSectionKey(slug);
}

/** Endereço público de uma categoria do banco. */
export function categoryPath(slug: string): string {
  const key = sectionKeyForCategory(slug);
  return isSectionCategory(slug) ? `/${key}` : `/${key}/${slug}`;
}

/** Atalho com o nome que as pessoas mais buscam: /sofas leva aos estofados. */
export const SECTION_ALIASES = [{ source: "/sofas", destination: "/estofados" }] as const;

export type SectionRedirect = { source: string; destination: string; permanent: true };

/**
 * Redirecionamentos permanentes (308) para o next.config.ts, na ordem em que
 * devem ser testados: atalhos, categorias que são a própria seção, categorias
 * reconhecidas pelo começo do slug e, por fim, o resto em /moveis.
 */
export function sectionRedirects(): SectionRedirect[] {
  const byPrefix = SECTIONS.filter((s) => s.categoryPrefixes.length).map((s) => ({
    source: `/categorias/:slug(${s.categoryPrefixes.map((p) => `${p}[a-z0-9-]*`).join("|")})`,
    destination: `${s.path}/:slug`,
    permanent: true as const,
  }));
  return [
    ...SECTION_ALIASES.map((a) => ({ ...a, permanent: true as const })),
    { source: "/categorias", destination: "/produtos", permanent: true },
    ...SECTIONS.map((s) => ({ source: `/categorias/${s.key}`, destination: s.path, permanent: true as const })),
    ...byPrefix,
    { source: "/categorias/:slug", destination: "/moveis/:slug", permanent: true },
  ];
}
