/**
 * ViaCEP falso para os testes E2E (carregado com NODE_OPTIONS=--import no servidor do Next).
 * Nenhum teste chama o serviço de verdade. Cada consulta é anotada em VIACEP_FALSO_LOG (para contar chamadas).
 * CEP 00000000 = "não encontrado".
 */
import { appendFileSync } from "node:fs";

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const match = /^https:\/\/viacep\.com\.br\/ws\/(\d{8})\/json\/?$/.exec(url);
  if (!match) return realFetch(input, init);
  if (process.env.VIACEP_FALSO_LOG) appendFileSync(process.env.VIACEP_FALSO_LOG, `${match[1]}\n`);
  if (match[1] === "00000000") return Response.json({ erro: true });
  return Response.json({ logradouro: "Rua do Teste", bairro: "Bairro do Teste", localidade: "Cidade do Teste", uf: "SC" });
};
