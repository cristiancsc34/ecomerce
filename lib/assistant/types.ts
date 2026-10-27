/** Tipos e limites do assistente, sem dependências (usados também no navegador). */

export type AssistantNextStep = "nenhum" | "ver_produto" | "girar_3d" | "adicionar_sacola" | "falar_atendimento";

export const ASSISTANT_MAX_MESSAGES = 20;
export const ASSISTANT_MAX_CHARS = 800;

export type AssistantMessage = { role: "user" | "assistant"; content: string };

/** Resposta da rota /api/assistente. */
export type AssistantApiResponse = {
  answer: string;
  products: {
    slug: string;
    name: string;
    url: string;
    imageUrl: string | null;
    imageAlt: string;
    priceText: string | null;
    has3d: boolean;
  }[];
  nextStep: AssistantNextStep;
  supportUrl: string;
};
