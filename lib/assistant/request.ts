import { z } from "zod";
import { ASSISTANT_MAX_CHARS, ASSISTANT_MAX_MESSAGES } from "./types";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(ASSISTANT_MAX_CHARS),
});

/**
 * Conversa enviada pelo navegador: alterna cliente/assistente, começa e
 * termina com o cliente. Tamanho limitado (custo e abuso).
 */
export const assistantRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(ASSISTANT_MAX_MESSAGES)
    .refine((list) => list.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")), {
      message: "A conversa deve alternar cliente e assistente, começando pelo cliente.",
    })
    .refine((list) => list[list.length - 1]?.role === "user", { message: "A última mensagem deve ser do cliente." }),
});
