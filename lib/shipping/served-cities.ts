/**
 * Cidades atendidas com frete grátis (decisão do Cristian em 20/11/2026, issue
 * #28). A loja vende só no Paraná, com saída de Maringá. Para incluir ou tirar
 * uma cidade, basta editar a lista: a regra de comparação não muda.
 *
 * Lista inicial da transportadora Valencia (Maringá), 109 nomes, recebida sem
 * acento. Aqui os nomes estão com a grafia oficial (com acento) para aparecer
 * certo na loja; a comparação ignora acento e caixa, então "Maringá",
 * "MARINGA" e "maringa" são a mesma cidade.
 *
 * Pontos em aberto (issue #28): (a) Curitiba entra ou não; (b) a lista tem 109
 * nomes e a conferência do EGG Boss contou 105 municípios — alguns nomes podem
 * ser distritos (ex.: Porto São José, Adhemar de Barros).
 */

export type ServedCity = {
  /** Nome com a grafia oficial (com acento). */
  name: string;
  uf: "PR";
  carrier: "valencia";
};

const VALENCIA_PR = [
  "Abatiá",
  "Adhemar de Barros",
  "Alto Paraná",
  "Amaporã",
  "Andirá",
  "Aparecida do Ivaí",
  "Apucarana",
  "Arapongas",
  "Arapuã",
  "Ariranha do Ivaí",
  "Astorga",
  "Bandeirantes",
  "Barra do Jacaré",
  "Bom Sucesso",
  "Borrazópolis",
  "Califórnia",
  "Cambará",
  "Cambé",
  "Cambira",
  "Campo Mourão",
  "Cândido de Abreu",
  "Carlópolis",
  "Cianorte",
  "Colorado",
  "Congonhinhas",
  "Conselheiro Mairinck",
  "Cruzmaltina",
  "Curitiba",
  "Curiúva",
  "Diamante do Norte",
  "Engenheiro Beltrão",
  "Faxinal",
  "Figueira",
  "Godoy Moreira",
  "Grandes Rios",
  "Guairaçá",
  "Guapirama",
  "Ibaiti",
  "Ibiporã",
  "Iguaraçu",
  "Itambaracá",
  "Itaúna do Sul",
  "Ivaiporã",
  "Jaboti",
  "Jacarezinho",
  "Jandaia do Sul",
  "Japira",
  "Jardim Alegre",
  "Jataizinho",
  "Joaquim Távora",
  "Jundiaí do Sul",
  "Kaloré",
  "Lidianópolis",
  "Loanda",
  "Londrina",
  "Lunardelli",
  "Mandaguaçu",
  "Mandaguari",
  "Manoel Ribas",
  "Marialva",
  "Marilândia do Sul",
  "Marilena",
  "Maringá",
  "Marumbi",
  "Mauá da Serra",
  "Nova Esperança",
  "Nova Fátima",
  "Nova Londrina",
  "Novo Itacolomi",
  "Paiçandu",
  "Paranacity",
  "Paranavaí",
  "Peabiru",
  "Pinhalão",
  "Pitanga",
  "Planaltina do Paraná",
  "Porto Rico",
  "Porto São José",
  "Quatiguá",
  "Querência do Norte",
  "Ribeirão Claro",
  "Ribeirão do Pinhal",
  "Rio Bom",
  "Rio Branco do Ivaí",
  "Rolândia",
  "Rosário do Ivaí",
  "Sabáudia",
  "Salto do Itararé",
  "Santa Amélia",
  "Santa Cruz de Monte Castelo",
  "Santa Isabel do Ivaí",
  "Santa Mônica",
  "Santana do Itararé",
  "Santo Antônio da Platina",
  "Santo Antônio do Paraíso",
  "São João do Ivaí",
  "São José da Boa Vista",
  "São José do Ivaí",
  "São Pedro do Ivaí",
  "São Pedro do Paraná",
  "Sapopema",
  "Sarandi",
  "Siqueira Campos",
  "Tamarana",
  "Tapejara",
  "Terra Rica",
  "Tomazina",
  "Umuarama",
  "Wenceslau Braz",
] as const;

export const SERVED_CITIES: readonly ServedCity[] = VALENCIA_PR.map((name) => ({ name, uf: "PR", carrier: "valencia" }));

/** Sem acento, sem caixa e com espaços normalizados ("PAIÇANDU " → "paicandu"). */
export function normalizeCityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SERVED_KEYS = new Set(SERVED_CITIES.map((c) => `${normalizeCityName(c.name)}|${c.uf}`));

/** A cidade (como vem do CEP) está na lista atendida? Exige UF PR. */
export function isServedCity(city: string, uf: string): boolean {
  const state = uf.trim().toUpperCase();
  if (state !== "PR") return false;
  return SERVED_KEYS.has(`${normalizeCityName(city)}|${state}`);
}

/** A cidade atendida com esse nome (com acento), ou null. */
export function findServedCity(city: string, uf = "PR"): ServedCity | null {
  if (!isServedCity(city, uf)) return null;
  const key = normalizeCityName(city);
  return SERVED_CITIES.find((c) => normalizeCityName(c.name) === key) ?? null;
}
