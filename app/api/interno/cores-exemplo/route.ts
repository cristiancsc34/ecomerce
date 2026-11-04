import { coresExemploResponse } from "@/lib/ai/cores-exemplo";

/**
 * TEMPORÁRIA: o GPT gera, com a chave do servidor, a foto da Poltrona Azul numa cor de exemplo (ver
 * lib/ai/cores-exemplo.ts). Fecha sozinha em 08/11/2026 e só responde com a senha.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  return coresExemploResponse(request);
}
