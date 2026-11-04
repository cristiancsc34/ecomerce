import { describe, expect, it } from "vitest";
import { assinar, assinaturaConfere } from "@/lib/trama/assinatura";
import { cancelarPedidoNaTrama, consultarPedidoNaTrama, criarPedidoNaTrama, type Fetch } from "@/lib/trama/cliente";
import { tramaConfig, tramaWebhookSegredo } from "@/lib/trama/config";
import { caminhoNaLoja, montarPedidoParaTrama, passosDaTrama, proximaTentativa, type PedidoDaLoja } from "@/lib/trama/mapear";

/** Integração loja ↔ Trama (lib/trama). Contrato: docs/14-api-ecommerce.md do repositório do Trama. */

const pedido = (over: Partial<PedidoDaLoja> = {}): PedidoDaLoja => ({
  code: "PED-1042",
  status: "pago",
  customer_name: "  Helena Dias ",
  customer_phone: "5548999990405",
  customer_email: "Helena@Cliente.Example",
  whatsapp_opt_in: true,
  address: { cep: "88058-000", rua: "Rua das Gaivotas", numero: "300", bairro: "Ingleses", cidade: "Florianópolis", uf: "sc", referencia: "Portão de madeira" },
  delivery_method: "entrega_propria",
  delivery_notes: "3º andar, sem elevador",
  assembly: true,
  shipping_cents: 9900,
  discount_cents: 0,
  total_cents: 139890,
  payment_method: "pix",
  paid_at: "2026-11-04T12:00:00Z",
  items: [{ name: "Poltrona Azul", variant_name: null, unit_price_cents: 129990, quantity: 1, sort_order: 0, variant_sku: null, product_sku: "POL-AZ" }],
  ...over,
});

describe("loja → Trama: corpo do POST /api/v1/pedidos", () => {
  it("pedido pago com entrega: cliente, endereço, itens pelo SKU, frete e pagamento confirmado pela loja", () => {
    const r = montarPedidoParaTrama(pedido(), "Cuxões");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido).toEqual({
      referencia_externa: "PED-1042",
      cliente: {
        nome: "Helena Dias",
        email: "helena@cliente.example",
        telefone: "5548999990405",
        documento: null,
        aceita_marketing: false,
        notificar_whatsapp: true,
      },
      entrega: {
        modalidade: "entrega",
        endereco: {
          cep: "88058000",
          logradouro: "Rua das Gaivotas",
          numero: "300",
          complemento: null,
          bairro: "Ingleses",
          cidade: "Florianópolis",
          uf: "SC",
          referencia: "Portão de madeira",
        },
      },
      itens: [{ sku: "POL-AZ", quantidade: 1, preco_unitario_centavos: 129990, desconto_centavos: 0 }],
      frete_centavos: 9900,
      desconto_centavos: 0,
      pagamento: { situacao: "pago", forma: "pix", valor_centavos: 139890, id_transacao_gateway: "loja:PED-1042" },
      observacoes: [
        "Pedido PED-1042 da loja Cuxões.",
        "Acesso para a entrega: 3º andar, sem elevador",
        "Inclui montagem.",
        "Pagamento confirmado pela loja: Pix.",
      ].join("\n"),
    });
  });

  it("sem pagamento: paga na entrega; retirada vai sem endereço; frete a combinar vira 0", () => {
    const r = montarPedidoParaTrama(pedido({ paid_at: null, delivery_method: "retirada", address: {}, shipping_cents: null }), "Cuxões");
    expect(r.ok && r.pedido.pagamento).toEqual({ situacao: "na_entrega" });
    expect(r.ok && r.pedido.entrega).toEqual({ modalidade: "retirada", endereco: null });
    expect(r.ok && r.pedido.frete_centavos).toBe(0);
    expect(r.ok && r.pedido.observacoes).toContain("Pagamento na entrega");
  });

  it("variação com SKU própria vai pelo SKU dela; sem SKU própria, vai como acabamento para a fábrica", () => {
    const r = montarPedidoParaTrama(
      pedido({
        items: [
          { name: "Poltrona", variant_name: "Verde", unit_price_cents: 100, quantity: 2, sort_order: 1, variant_sku: "POL-VD", product_sku: "POL" },
          { name: "Poltrona", variant_name: "Cor: Areia", unit_price_cents: 100, quantity: 1, sort_order: 0, variant_sku: null, product_sku: "POL" },
        ],
      }),
      "Cuxões",
    );
    expect(r.ok && r.pedido.itens).toEqual([
      { sku: "POL", quantidade: 1, preco_unitario_centavos: 100, desconto_centavos: 0, personalizacao: "Variação escolhida: Cor: Areia" },
      { sku: "POL-VD", quantidade: 2, preco_unitario_centavos: 100, desconto_centavos: 0 },
    ]);
  });

  it("problemas que só alguém resolve voltam como lista (sem chamar a API)", () => {
    const r = montarPedidoParaTrama(
      pedido({
        address: { cep: "123", rua: "", bairro: "", cidade: "X", uf: "" },
        items: [{ name: "Cadeira", variant_name: null, unit_price_cents: 1, quantity: 1, sort_order: 0, variant_sku: null, product_sku: null }],
      }),
      "Cuxões",
    );
    expect(r).toEqual({
      ok: false,
      problemas: ['"Cadeira" está sem SKU no catálogo da loja.', "Endereço sem CEP válido.", "Endereço sem rua.", "Endereço sem bairro.", "Endereço sem UF."],
    });
  });

  it("número vazio vira s/n; link de pagamento fica como transferência", () => {
    const r = montarPedidoParaTrama(pedido({ address: { ...pedido().address, numero: "" }, payment_method: "link" }), "Cuxões");
    expect(r.ok && r.pedido.entrega.endereco?.numero).toBe("s/n");
    expect(r.ok && r.pedido.pagamento).toMatchObject({ forma: "transferencia" });
    expect(r.ok && r.pedido.observacoes).toContain("link de pagamento");
  });
});

describe("Trama → loja: etapas", () => {
  const loja = (status: PedidoDaLoja["status"], over: Partial<{ delivery_method: PedidoDaLoja["delivery_method"]; scheduled_date: string | null; scheduled_window: string | null }> = {}) => ({
    status,
    delivery_method: "entrega_propria" as const,
    scheduled_date: null,
    scheduled_window: null,
    ...over,
  });

  it("caminho pela ordem da loja, sem passar por cancelado", () => {
    expect(caminhoNaLoja("pago", "entregue")).toEqual(["em_preparacao", "entregue"]);
    expect(caminhoNaLoja("pago", "saiu_para_entrega")).toEqual(["em_preparacao", "saiu_para_entrega"]);
    expect(caminhoNaLoja("entregue", "devolvido")).toEqual(["devolucao_solicitada", "devolvido"]);
    expect(caminhoNaLoja("saiu_para_entrega", "cancelado")).toEqual(["enviado", "cancelado"]);
    expect(caminhoNaLoja("entregue", "cancelado")).toBeNull();
    expect(caminhoNaLoja("entregue", "em_preparacao")).toBeNull();
    expect(caminhoNaLoja("pago", "pago")).toEqual([]);
  });

  it("fábrica: confirmado não muda nada; em produção vira 'em preparação' com o recado", () => {
    expect(passosDaTrama({ status: "confirmado" }, loja("pago"), null)).toEqual([]);
    expect(passosDaTrama({ status: "em_producao" }, loja("pago"), "confirmado")).toEqual([
      { status: "em_preparacao", note: "Seu pedido entrou em produção na fábrica." },
    ]);
    // Já estava em preparação na loja: só o recado.
    expect(passosDaTrama({ status: "em_producao" }, loja("em_preparacao"), "confirmado")).toEqual([
      { status: "em_preparacao", note: "Seu pedido entrou em produção na fábrica." },
    ]);
    // Sem mudança no Trama: nada (a rota agendada confere todo dia).
    expect(passosDaTrama({ status: "em_producao" }, loja("em_preparacao"), "em_producao")).toEqual([]);
  });

  it("estoque (logística): pronto para envio; retirada fala da loja", () => {
    expect(passosDaTrama({ status: "pronto_para_envio" }, loja("pago"), null)).toEqual([
      { status: "em_preparacao", note: "Seu pedido está pronto. Vamos combinar a data da entrega com você." },
    ]);
    expect(passosDaTrama({ status: "pronto_para_envio" }, loja("pago", { delivery_method: "retirada" }), null)).toEqual([
      { status: "em_preparacao", note: "Seu pedido está pronto para retirar na loja." },
    ]);
  });

  it("agendado leva a data e o período; remarcação atualiza; entrega que falhou volta para combinar", () => {
    expect(passosDaTrama({ status: "agendado", entrega: { data: "2026-11-12", janela: "tarde" } }, loja("em_preparacao"), "pronto_para_envio")).toEqual([
      { status: "enviado", note: "Entrega agendada.", delivery: { scheduledDate: "2026-11-12", scheduledWindow: "Tarde" } },
    ]);
    const agendado = loja("enviado", { scheduled_date: "2026-11-12", scheduled_window: "Tarde" });
    expect(passosDaTrama({ status: "agendado", entrega: { data: "2026-11-12", janela: "tarde" } }, agendado, "agendado")).toEqual([]);
    expect(passosDaTrama({ status: "agendado", entrega: { data: "2026-11-14", janela: "manha" } }, agendado, "agendado")).toEqual([
      { status: "enviado", note: "Entrega agendada.", delivery: { scheduledDate: "2026-11-14", scheduledWindow: "Manhã" } },
    ]);
    expect(passosDaTrama({ status: "pronto_para_envio" }, loja("saiu_para_entrega"), "em_rota")).toEqual([
      {
        status: "enviado",
        note: "Não foi possível entregar na data combinada. Vamos combinar uma nova data com você.",
        delivery: { scheduledDate: null, scheduledWindow: null },
      },
    ]);
  });

  it("em rota, entregue (pulando etapas da loja), cancelado e devolvido", () => {
    expect(passosDaTrama({ status: "em_rota" }, loja("enviado"), "agendado")).toEqual([{ status: "saiu_para_entrega" }]);
    expect(passosDaTrama({ status: "entregue" }, loja("pago"), "pronto_para_envio")).toEqual([
      { status: "em_preparacao" },
      { status: "entregue", note: "Pedido entregue." },
    ]);
    expect(passosDaTrama({ status: "cancelado" }, loja("pago"), "confirmado")).toEqual([{ status: "cancelado", note: "Pedido cancelado." }]);
    expect(passosDaTrama({ status: "devolvido" }, loja("entregue"), "entregue")).toEqual([{ status: "devolucao_solicitada" }, { status: "devolvido" }]);
  });

  it("novas tentativas: 1, 5, 30, 120 e 720 minutos; depois desiste", () => {
    const agora = new Date("2026-11-04T12:00:00Z");
    expect([1, 2, 3, 4, 5].map((n) => (proximaTentativa(n, agora)!.getTime() - agora.getTime()) / 60_000)).toEqual([1, 5, 30, 120, 720]);
    expect(proximaTentativa(6, agora)).toBeNull();
  });
});

describe("configuração e assinatura", () => {
  it("só liga com URL válida (https, ou http só no próprio computador) e chave no formato do Trama", () => {
    const chave = "trm_live_abcdefghijklmnopqrstuvwxyz012345";
    expect(tramaConfig({ TRAMA_API_URL: "https://trama.exemplo.com.br/", TRAMA_API_KEY: chave })).toEqual({
      baseUrl: "https://trama.exemplo.com.br",
      apiKey: chave,
    });
    expect(tramaConfig({ TRAMA_API_URL: "http://localhost:3001", TRAMA_API_KEY: chave })?.baseUrl).toBe("http://localhost:3001");
    expect(tramaConfig({ TRAMA_API_URL: "http://trama.exemplo.com.br", TRAMA_API_KEY: chave })).toBeNull();
    expect(tramaConfig({ TRAMA_API_URL: "https://trama.exemplo.com.br", TRAMA_API_KEY: "errada" })).toBeNull();
    expect(tramaConfig({})).toBeNull();
    expect(tramaWebhookSegredo({ TRAMA_WEBHOOK_SEGREDO: "curto" })).toBeNull();
  });

  it("assinatura HMAC-SHA256 do corpo cru, comparada em tempo constante", () => {
    const corpo = '{"evento":"pedido.status_alterado"}';
    const segredo = "segredo-de-teste-com-32-caracteres!";
    const assinatura = assinar(corpo, segredo);
    expect(assinatura).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(assinaturaConfere(corpo, segredo, assinatura)).toBe(true);
    expect(assinaturaConfere(`${corpo} `, segredo, assinatura)).toBe(false);
    expect(assinaturaConfere(corpo, "outro-segredo-com-tamanho-ok", assinatura)).toBe(false);
    expect(assinaturaConfere(corpo, segredo, null)).toBe(false);
  });
});

describe("cliente da API", () => {
  const config = { baseUrl: "https://trama.exemplo.com.br", apiKey: "trm_live_abcdefghijklmnopqrstuvwxyz012345" };
  const responde =
    (status: number, corpo: unknown, headers: Record<string, string> = {}, chamadas: { url: string; init: RequestInit }[] = []): Fetch =>
    async (url, init) => {
      chamadas.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });
    };
  const corpo = (() => {
    const r = montarPedidoParaTrama(pedido(), "Cuxões");
    if (!r.ok) throw new Error("montagem");
    return r.pedido;
  })();

  it("cria o pedido com a chave no cabeçalho e lê a resposta do contrato", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const r = await criarPedidoNaTrama(
      config,
      corpo,
      responde(201, { id: "x", numero: 2088, status: "confirmado", status_financeiro: "pago", previsao_entrega: "2026-11-20", url_rastreio: "https://trama.exemplo.com.br/r/abc" }, {}, chamadas),
    );
    expect(r).toEqual({
      tipo: "ok",
      http: 201,
      dados: { numero: 2088, status: "confirmado", status_financeiro: "pago", previsao_entrega: "2026-11-20", url_rastreio: "https://trama.exemplo.com.br/r/abc" },
    });
    expect(chamadas[0]!.url).toBe("https://trama.exemplo.com.br/api/v1/pedidos");
    expect((chamadas[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${config.apiKey}`);
    expect(JSON.parse(String(chamadas[0]!.init.body)).referencia_externa).toBe("PED-1042");
  });

  it("422 (SKU, preço) e 401 pedem correção; 5xx, 429 e rede pedem nova tentativa", async () => {
    expect(
      await criarPedidoNaTrama(config, corpo, responde(422, { erro: { codigo: "preco_divergente", mensagem: "O preço do SKU POL-AZ no catálogo é R$ 1.399,00, não R$ 1.299,90." } })),
    ).toEqual({ tipo: "corrigir", http: 422, codigo: "preco_divergente", mensagem: "O preço do SKU POL-AZ no catálogo é R$ 1.399,00, não R$ 1.299,90." });
    expect(await criarPedidoNaTrama(config, corpo, responde(401, {}))).toMatchObject({ tipo: "corrigir", codigo: "nao_autorizado" });
    expect(await criarPedidoNaTrama(config, corpo, responde(500, { erro: { codigo: "interno", mensagem: "Erro interno." } }))).toMatchObject({ tipo: "repetir", http: 500 });
    expect(await criarPedidoNaTrama(config, corpo, responde(429, {}, { "Retry-After": "30" }))).toMatchObject({ tipo: "repetir", esperarSegundos: 30 });
    const semRede: Fetch = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await criarPedidoNaTrama(config, corpo, semRede)).toMatchObject({ tipo: "repetir", http: null });
  });

  it("consulta e cancelamento usam a referência na URL", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const consulta = await consultarPedidoNaTrama(
      config,
      "PED-1042",
      responde(200, { numero: 2088, referencia_externa: "PED-1042", status: "agendado", status_financeiro: "pago", previsao_entrega: "2026-11-20", entrega: { data: "2026-11-12", janela: "tarde" }, historico: [] }, {}, chamadas),
    );
    expect(consulta).toMatchObject({ tipo: "ok", dados: { status: "agendado", entrega: { data: "2026-11-12", janela: "tarde" } } });
    expect(await cancelarPedidoNaTrama(config, "PED-1042", "Pedido cancelado na loja.", responde(409, { erro: { codigo: "pedido_em_andamento", mensagem: "O pedido já está em produção ou a caminho." } }), )).toMatchObject({
      tipo: "corrigir",
      http: 409,
      codigo: "pedido_em_andamento",
    });
    expect(chamadas[0]!.url).toBe("https://trama.exemplo.com.br/api/v1/pedidos/PED-1042");
    expect(await consultarPedidoNaTrama(config, "PED-1042", responde(200, { formato: "outro" }))).toMatchObject({ tipo: "repetir" });
  });
});
