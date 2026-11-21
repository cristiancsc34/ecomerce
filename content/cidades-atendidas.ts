/**
 * Lista inicial de cidades de entrega da issue #28 (transportadora Valencia,
 * Maringá; 109 nomes recebidos sem acento em 20/11/2026). Aqui só os nomes,
 * com a grafia oficial, para a página /entrega-parana (issue #31).
 *
 * Não tem regra de frete: a validação por CEP e o frete são da issue #28, que
 * deve ler esta mesma lista (ou movê-la) em vez de criar outra.
 *
 * Pontos em aberto (issue #28): (a) Curitiba entra ou não (fica marcada como
 * não confirmada e não aparece na página); (b) a lista tem 109 nomes e a
 * conferência do EGG Boss contou 105 municípios.
 */
export type DeliveryCity = { name: string; uf: "PR"; confirmed: boolean };

const NAMES = [
  "Abatiá", "Adhemar de Barros", "Alto Paraná", "Amaporã", "Andirá", "Aparecida do Ivaí", "Apucarana", "Arapongas",
  "Arapuã", "Ariranha do Ivaí", "Astorga", "Bandeirantes", "Barra do Jacaré", "Bom Sucesso", "Borrazópolis", "Califórnia",
  "Cambará", "Cambé", "Cambira", "Campo Mourão", "Cândido de Abreu", "Carlópolis", "Cianorte", "Colorado", "Congonhinhas",
  "Conselheiro Mairinck", "Cruzmaltina", "Curitiba", "Curiúva", "Diamante do Norte", "Engenheiro Beltrão", "Faxinal",
  "Figueira", "Godoy Moreira", "Grandes Rios", "Guairaçá", "Guapirama", "Ibaiti", "Ibiporã", "Iguaraçu", "Itambaracá",
  "Itaúna do Sul", "Ivaiporã", "Jaboti", "Jacarezinho", "Jandaia do Sul", "Japira", "Jardim Alegre", "Jataizinho",
  "Joaquim Távora", "Jundiaí do Sul", "Kaloré", "Lidianópolis", "Loanda", "Londrina", "Lunardelli", "Mandaguaçu",
  "Mandaguari", "Manoel Ribas", "Marialva", "Marilândia do Sul", "Marilena", "Maringá", "Marumbi", "Mauá da Serra",
  "Nova Esperança", "Nova Fátima", "Nova Londrina", "Novo Itacolomi", "Paiçandu", "Paranacity", "Paranavaí", "Peabiru",
  "Pinhalão", "Pitanga", "Planaltina do Paraná", "Porto Rico", "Porto São José", "Quatiguá", "Querência do Norte",
  "Ribeirão Claro", "Ribeirão do Pinhal", "Rio Bom", "Rio Branco do Ivaí", "Rolândia", "Rosário do Ivaí", "Sabáudia",
  "Salto do Itararé", "Santa Amélia", "Santa Cruz de Monte Castelo", "Santa Isabel do Ivaí", "Santa Mônica",
  "Santana do Itararé", "Santo Antônio da Platina", "Santo Antônio do Paraíso", "São João do Ivaí", "São José da Boa Vista",
  "São José do Ivaí", "São Pedro do Ivaí", "São Pedro do Paraná", "Sapopema", "Sarandi", "Siqueira Campos", "Tamarana",
  "Tapejara", "Terra Rica", "Tomazina", "Umuarama", "Wenceslau Braz",
] as const;

/** Cidades ainda não confirmadas como cobertura (ponto em aberto da #28). */
const UNCONFIRMED = new Set(["Curitiba"]);

export const DELIVERY_CITIES: readonly DeliveryCity[] = NAMES.map((name) => ({ name, uf: "PR", confirmed: !UNCONFIRMED.has(name) }));

/** Sem acento, sem caixa e com espaços normalizados ("PAIÇANDU " → "paicandu"). */
export function normalizeCityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
