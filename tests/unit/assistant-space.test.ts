import { describe, expect, it, vi } from "vitest";
import { SAFE_FALLBACK_ANSWER } from "@/lib/assistant/guard";
import { askAssistant, type AssistantClient } from "@/lib/assistant/service";
import { spaceResultForModel, verificarEspaco } from "@/lib/assistant/space";
import { DEMO_PRODUCTS } from "@/lib/catalog/demo-data";
import { makeProduct } from "./factories";

/** Peças com medidas confirmadas (o catálogo de demonstração ainda não tem medidas). */
const poltrona = makeProduct({
  slug: "poltrona-teste",
  name: "Poltrona Teste",
  priceCents: 129990,
  variants: [],
  dimensions: { widthCm: 78, lengthCm: 65, heightCm: 100 },
});
const cadeira = makeProduct({
  slug: "cadeira-teste",
  name: "Cadeira Teste",
  priceCents: 59990,
  variants: [],
  dimensions: { widthCm: 50, lengthCm: 55, heightCm: 85 },
});

describe("verificar_espaco: a conta é do servidor", () => {
  it("cabe: folga de 10 cm ou mais em todas as medidas", () => {
    const r = verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 100, profundidade: 150, unidade: "cm" });
    expect(r.status).toBe("cabe");
    if (r.status !== "cabe") return;
    expect(r.comparacoes).toEqual([
      { medida: "largura", espaco_cm: 100, produto_cm: 78, diferenca_cm: 22 },
      { medida: "profundidade", espaco_cm: 150, produto_cm: 65, diferenca_cm: 85 },
    ]);
    // 150 - 65 - 60 de circulação na frente = sobram 25 cm.
    expect(r.circulacao).toEqual({
      recomendacao: "Recomendação (não é regra): deixar cerca de 60 cm livres na frente da poltrona, para circular.",
      cabe_com_circulacao: true,
      diferenca_cm: 25,
    });
  });

  it("cabe justo: menos de 10 cm de folga em alguma medida", () => {
    const r = verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 80, profundidade: 70, unidade: "cm" });
    expect(r.status).toBe("cabe_justo");
    if (r.status !== "cabe_justo") return;
    expect(r.comparacoes.map((c) => c.diferenca_cm)).toEqual([2, 5]);
    expect(r.resumo).toBe(
      "Cabe justo (menos de 10 cm de folga). largura: sobram 2 cm (espaço 80 cm, peça 78 cm) profundidade: sobram 5 cm (espaço 70 cm, peça 65 cm)",
    );
    expect(r.circulacao.cabe_com_circulacao).toBe(false);
    expect(r.circulacao.diferenca_cm).toBe(-55);
  });

  it("não cabe: diz quantos cm faltam", () => {
    const r = verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 70, profundidade: 90, altura: 95, unidade: "cm" });
    expect(r.status).toBe("nao_cabe");
    if (r.status !== "nao_cabe") return;
    expect(r.comparacoes).toEqual([
      { medida: "largura", espaco_cm: 70, produto_cm: 78, diferenca_cm: -8 },
      { medida: "profundidade", espaco_cm: 90, produto_cm: 65, diferenca_cm: 25 },
      { medida: "altura", espaco_cm: 95, produto_cm: 100, diferenca_cm: -5 },
    ]);
    expect(r.resumo).toContain("largura: faltam 8 cm");
    expect(r.resumo).toContain("altura: faltam 5 cm");
  });

  it("medida faltando no catálogo: não chuta", () => {
    const semMedidas = DEMO_PRODUCTS.find((p) => p.slug === "poltrona-azul");
    const r = verificarEspaco(semMedidas, { produto: "poltrona-azul", largura: 80, profundidade: 70, unidade: "cm" });
    expect(r).toEqual({
      status: "sem_medidas_do_produto",
      produto: "Poltrona Azul Estrutura Clara",
      faltando: ["largura", "profundidade"],
      mensagem: "O catálogo ainda não tem largura e profundidade de Poltrona Azul Estrutura Clara. Não dá para dizer se cabe.",
    });
    // Sem a altura no catálogo, compara largura e profundidade e avisa.
    const semAltura = makeProduct({ name: "Poltrona Baixa", dimensions: { widthCm: 78, lengthCm: 65 } });
    const r2 = verificarEspaco(semAltura, { produto: semAltura.slug, largura: 100, profundidade: 150, altura: 90, unidade: "cm" });
    expect(r2.status).toBe("cabe");
    expect(r2).toMatchObject({ sem_altura_no_catalogo: true });
  });

  it("unidade em metros em vez de centímetros", () => {
    // 1,2 m × 0,9 m = 120 × 90 cm.
    const r = verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 1.2, profundidade: 0.9, unidade: "m" });
    expect(r.status).toBe("cabe");
    if (r.status !== "cabe") return;
    expect(r.comparacoes.map((c) => c.espaco_cm)).toEqual([120, 90]);
    // Metros marcados como centímetros: confirma com o cliente em vez de concluir.
    expect(verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 1.2, profundidade: 0.9, unidade: "cm" }).status).toBe("unidade_duvidosa");
    expect(verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 80, profundidade: 70, unidade: "m" }).status).toBe("unidade_duvidosa");
  });

  it("produto inexistente ou medida inválida", () => {
    expect(verificarEspaco(undefined, { produto: "x", largura: 80, profundidade: 70 }).status).toBe("produto_nao_encontrado");
    expect(verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 0, profundidade: 70 }).status).toBe("medida_invalida");
    expect(verificarEspaco(poltrona, { produto: "poltrona-teste", largura: -80, profundidade: 70 }).status).toBe("medida_invalida");
  });

  it("cadeira: a circulação recomendada é atrás, para puxar e sentar", () => {
    const r = verificarEspaco(cadeira, { produto: "cadeira-teste", largura: 60, profundidade: 120, unidade: "cm" });
    expect(r).toMatchObject({ status: "cabe", circulacao: { recomendacao: expect.stringContaining("atrás da cadeira") } });
  });

  it("o texto para o modelo leva cada número com a unidade", () => {
    const text = spaceResultForModel(verificarEspaco(poltrona, { produto: "poltrona-teste", largura: 80, profundidade: 70, unidade: "cm" }));
    expect(JSON.parse(text)).toMatchObject({
      status: "cabe_justo",
      comparacoes: [
        { medida: "largura", espaco: "80 cm", peca: "78 cm", sobra: "2 cm" },
        { medida: "profundidade", espaco: "70 cm", peca: "65 cm", sobra: "5 cm" },
      ],
      circulacao: { cabe_com_circulacao: false, falta_para_circulacao: "55 cm" },
    });
  });
});

type Turn = { tool?: Record<string, unknown>; final?: Record<string, unknown> };

function scriptedClient(turns: Turn[]) {
  const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const create = vi.fn(async (...args: unknown[]) => {
    void args;
    const turn = turns.shift()!;
    if (turn.tool) {
      return {
        stop_reason: "tool_use",
        usage,
        content: [
          { type: "thinking", thinking: "", signature: "assinatura" },
          { type: "tool_use", id: "toolu_1", name: "verificar_espaco", input: turn.tool },
        ],
      };
    }
    return { stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(turn.final) }] };
  });
  return { client: { messages: { create } } as unknown as AssistantClient, create };
}

describe("assistente: 'a poltrona cabe?' passa pela ferramenta", () => {
  const question = "Tenho 80 cm de largura e 70 de profundidade, a poltrona cabe?";

  it("o modelo chama verificar_espaco e responde com os números certos", async () => {
    const { client, create } = scriptedClient([
      { tool: { produto: "poltrona-teste", largura: 80, profundidade: 70, altura: null, unidade: "cm" } },
      {
        final: {
          resposta:
            "Cabe, mas justo: sobram 2 cm na largura e 5 cm na profundidade. Como recomendação, o ideal é deixar cerca de 60 cm livres na frente para circular.",
          produtos: [{ produto: "poltrona-teste", motivo: "É a peça que você perguntou." }],
          proximo_passo: "ver_produto",
        },
      },
    ]);
    const reply = await askAssistant({ client, catalog: [poltrona, cadeira], history: [{ role: "user", content: question }] });
    expect(reply.guarded).toBe(false);
    expect(reply.toolCalls).toBe(1);
    expect(reply.answer).toContain("sobram 2 cm na largura e 5 cm na profundidade");
    expect(reply.products.map((p) => [p.slug, p.priceText?.replace(/\s/g, " ")])).toEqual([["poltrona-teste", "R$ 1.299,90"]]);

    // A segunda chamada leva a resposta da ferramenta (a conta feita no servidor) e o raciocínio intacto.
    const second = (create.mock.calls[1] as unknown[])[0] as { messages: { role: string; content: unknown }[] };
    const [assistantTurn, toolTurn] = second.messages.slice(-2);
    expect(assistantTurn.role).toBe("assistant");
    expect((assistantTurn.content as { type: string }[]).map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    expect(toolTurn.role).toBe("user");
    const [result] = toolTurn.content as { type: string; tool_use_id: string; content: string }[];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(JSON.parse(result.content)).toMatchObject({ status: "cabe_justo", comparacoes: [{ sobra: "2 cm" }, { sobra: "5 cm" }] });
  });

  it("número que não veio do catálogo nem da ferramenta é bloqueado", async () => {
    const { client } = scriptedClient([
      { tool: { produto: "poltrona-teste", largura: 80, profundidade: 70, altura: null, unidade: "cm" } },
      { final: { resposta: "Cabe, sobram 12 cm na largura.", produtos: [], proximo_passo: "nenhum" } },
    ]);
    const reply = await askAssistant({ client, catalog: [poltrona], history: [{ role: "user", content: question }] });
    expect(reply.guarded).toBe(true);
    expect(reply.answer).toBe(SAFE_FALLBACK_ANSWER);
  });

  it("produto sem medidas no catálogo: a ferramenta diz que não sabe", async () => {
    const { client, create } = scriptedClient([
      { tool: { produto: "poltrona-azul", largura: 80, profundidade: 70, altura: null, unidade: "cm" } },
      {
        final: {
          resposta: "Ainda não temos as medidas confirmadas dessa poltrona, então não consigo dizer se cabe. O atendimento pode confirmar para você.",
          produtos: [],
          proximo_passo: "falar_atendimento",
        },
      },
    ]);
    const reply = await askAssistant({ client, catalog: DEMO_PRODUCTS, history: [{ role: "user", content: question }] });
    expect(reply.guarded).toBe(false);
    const toolTurn = ((create.mock.calls[1] as unknown[])[0] as { messages: { content: { content: string }[] }[] }).messages.at(-1)!;
    expect(JSON.parse(toolTurn.content[0].content)).toMatchObject({ status: "sem_medidas_do_produto" });
  });

  it("pedido inválido para a ferramenta volta como erro (não roda a conta)", async () => {
    const { client, create } = scriptedClient([
      { tool: { produto: "poltrona-teste", largura: "oitenta" } },
      { final: { resposta: "Quanto mede o espaço, em largura e profundidade?", produtos: [], proximo_passo: "nenhum" } },
    ]);
    await askAssistant({ client, catalog: [poltrona], history: [{ role: "user", content: question }] });
    const toolTurn = ((create.mock.calls[1] as unknown[])[0] as { messages: { content: { is_error?: boolean }[] }[] }).messages.at(-1)!;
    expect(toolTurn.content[0].is_error).toBe(true);
  });

  it("ferramenta chamada sem parar: desiste com resposta segura", async () => {
    const tool = { produto: "poltrona-teste", largura: 80, profundidade: 70, altura: null, unidade: "cm" };
    const { client, create } = scriptedClient([{ tool }, { tool }, { tool }, { tool }, { tool }]);
    const reply = await askAssistant({ client, catalog: [poltrona], history: [{ role: "user", content: question }] });
    expect(reply.guarded).toBe(true);
    expect(create).toHaveBeenCalledTimes(4);
  });
});
