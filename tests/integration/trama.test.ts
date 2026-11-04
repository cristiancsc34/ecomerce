import { execSync } from "node:child_process";
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { tramaConfig } from "@/lib/trama/config";
import { atualizarDaTrama, processarFilaDoTrama } from "@/lib/trama/sincronizar";
import { createDatabase } from "../db/helpers";

/**
 * Loja ↔ Trama de verdade: o banco da loja é o Postgres embutido (as mesmas migrações) e o Trama roda no
 * computador (`pnpm db:reset && pnpm dev` no repositório do Trama, com uma integração criada).
 *
 *   TRAMA_INTEGRATION=1 TRAMA_API_URL=http://localhost:3000 TRAMA_API_KEY=trm_live_… npx vitest run tests/integration/trama.test.ts
 *
 * Opcional: TRAMA_DRIVER="pnpm --dir <trama> --filter @trama/core exec tsx scripts/<roteiro>.ts" faz a fábrica aceitar a
 * OP e a expedição agendar e sair com a rota (sem ele, o teste para no envio e no cancelamento).
 * Usa os SKUs e preços do seed do Trama. Nunca aponte para um Trama de produção: cria pedidos de verdade.
 */
const ligado = process.env.TRAMA_INTEGRATION === "1" && tramaConfig() !== null;
const driver = process.env.TRAMA_DRIVER?.trim();

/** O pedaço do cliente do Supabase que lib/trama/sincronizar usa, sobre o Postgres embutido (como a chave de serviço). */
function clienteDoBanco(db: PGlite): SupabaseClient {
  const ORDER_JSON = `
    select to_jsonb(o) || jsonb_build_object(
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'variant_name', i.variant_name,
        'unit_price_cents', i.unit_price_cents, 'quantity', i.quantity, 'sort_order', i.sort_order,
        'product', (select jsonb_build_object('sku', p.sku) from public.products p where p.id = i.product_id),
        'variant', (select jsonb_build_object('sku', v.sku) from public.product_variants v where v.id = i.variant_id)))
        from public.order_items i where i.order_id = o.id), '[]'::jsonb),
      'integration', (select jsonb_build_object('status', x.status, 'erp_status', x.erp_status)
        from public.order_integration x where x.order_id = o.id)) as row
    from public.orders o`;
  const from = (table: string) => {
    const filtros: [string, unknown][] = [];
    let colunas = "*";
    let mudanca: Record<string, unknown> | null = null;
    const where = () => (filtros.length ? ` where ${filtros.map(([c], i) => `${c} = $${i + 1}`).join(" and ")}` : "");
    const builder = {
      select(c: string) {
        colunas = c;
        return builder;
      },
      update(m: Record<string, unknown>) {
        mudanca = m;
        return builder;
      },
      eq(c: string, v: unknown) {
        filtros.push([c, v]);
        return builder;
      },
      async maybeSingle() {
        const sql =
          table === "orders" && colunas.includes("(")
            ? `${ORDER_JSON}${where().replace(/ (\w+) =/g, " o.$1 =")}`
            : `select to_jsonb(t) as row from public.${table} t${where()}`;
        const { rows } = await db.query<{ row: Record<string, unknown> }>(sql, filtros.map(([, v]) => v));
        return { data: rows[0]?.row ?? null, error: null };
      },
      then(resolve: (r: { data: null; error: { message: string } | null }) => void, reject: (e: unknown) => void) {
        if (!mudanca) return reject(new Error("só update aqui"));
        const campos = Object.entries(mudanca);
        const sql = `update public.${table} set ${campos.map(([k], i) => `${k} = $${i + 1}`).join(", ")}${where().replace(
          /\$(\d+)/g,
          (_, n) => `$${Number(n) + campos.length}`,
        )}`;
        db.query(sql, [...campos.map(([, v]) => v), ...filtros.map(([, v]) => v)]).then(
          () => resolve({ data: null, error: null }),
          (e: Error) => resolve({ data: null, error: { message: e.message } }),
        );
      },
    };
    return builder;
  };
  const rpc = async (nome: string, params: Record<string, unknown>) => {
    try {
      if (nome === "claim_order_integrations") {
        const { rows } = await db.query("select * from public.claim_order_integrations($1)", [params.p_limit]);
        return { data: rows, error: null };
      }
      if (nome === "trama_apply") {
        const { rows } = await db.query<{ s: string }>("select public.trama_apply($1, $2, $3) as s", [
          params.p_order_id,
          JSON.stringify(params.p_steps),
          JSON.stringify(params.p_erp),
        ]);
        return { data: rows[0]!.s, error: null };
      }
      throw new Error(`rpc ${nome} fora do teste`);
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };
  return { from, rpc } as unknown as SupabaseClient;
}

let db: PGlite;
let client: SupabaseClient;
const codigo = `${Date.now().toString(36).toUpperCase().slice(-5)}`;

async function produto(nome: string, sku: string, preco: number) {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.products (name, slug, sku, price_cents) values ($1, $2, $3, $4) returning id",
    [nome, `${sku.toLowerCase()}-${codigo.toLowerCase()}`, `${sku}`, preco],
  );
  return rows[0]!.id;
}

async function pedido(productId: string, nome: string, preco: number, extra: Record<string, unknown> = {}) {
  const { rows } = await db.query<{ id: string }>("select public.create_order($1) as id", [
    JSON.stringify({
      customerName: "Helena Dias (teste da integração)",
      customerPhone: "5548999990405",
      customerEmail: "helena.dias@cliente.example",
      whatsappOptIn: false,
      address: { cep: "88058000", rua: "Rua das Gaivotas", numero: "300", bairro: "Ingleses", cidade: "Florianópolis", uf: "SC" },
      deliveryMethod: "entrega_propria",
      shippingCents: 0,
      paymentMethod: "pix",
      items: [{ productId, name: nome, unitPriceCents: preco, quantity: 1 }],
      ...extra,
    }),
  ]);
  const id = rows[0]!.id;
  // Códigos únicos a cada rodada: o Trama guarda a referência de pedidos anteriores.
  await db.query("update public.orders set code = $2 where id = $1", [id, `LOJA-${Math.floor(Math.random() * 1e9)}`]);
  return id;
}

const setStatus = (id: string, status: string) => db.query("select public.set_order_status($1, $2::public.order_status)", [id, status]);
const lerPedido = async (id: string) =>
  (await db.query<{ code: string; status: string; scheduled_date: string | null; scheduled_window: string | null }>(
    "select code, status, scheduled_date::text, scheduled_window from public.orders where id = $1",
    [id],
  )).rows[0]!;
const lerFila = async (id: string) => (await db.query<Record<string, unknown>>("select * from public.order_integration where order_id = $1", [id])).rows[0]!;
const notas = async (id: string) =>
  (await db.query<{ status: string; public_note: string | null }>("select status, public_note from public.order_events where order_id = $1 order by created_at, id", [id])).rows;
const numeroNoTrama = async (id: string) => Number((await lerFila(id)).erp_number);
const roda = (args: string) => execSync(`${driver} ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

describe.runIf(ligado)("loja ↔ Trama (Trama rodando no computador)", () => {
  let estoque: string;
  let fabrica: string;
  let cancelado: string;
  let semSku: string;

  beforeAll(async () => {
    db = await createDatabase({ seed: false });
    client = clienteDoBanco(db);
    // Mesmos SKUs e preços do catálogo do Trama (seed): um com unidade livre no CD, outro sem.
    const aurora = await produto("Sofá Aurora 3 lugares suede cinza", "AUR-3L-SU-CIN", 349000);
    const eco = await produto("Poltrona Eco linho terracota", "ECO-PLT-LI-TER", 129000);
    const semCodigo = (await db.query<{ id: string }>("insert into public.products (name, slug, price_cents) values ('Sem SKU', $1, 100) returning id", [`sem-sku-${codigo.toLowerCase()}`])).rows[0]!.id;
    estoque = await pedido(aurora, "Sofá Aurora", 349000);
    fabrica = await pedido(eco, "Poltrona Eco", 129000);
    cancelado = await pedido(eco, "Poltrona Eco", 129000);
    semSku = await pedido(semCodigo, "Sem SKU", 100);
  });

  it("pedido só recebido não sai da loja; confirmado vai para o Trama", async () => {
    expect(await processarFilaDoTrama({ client })).toMatchObject({ enviados: 0 });
    await setStatus(estoque, "pago"); // pago no Pix
    await setStatus(fabrica, "em_preparacao"); // paga na entrega
    await setStatus(cancelado, "pago");
    await setStatus(semSku, "pago");
    const r = await processarFilaDoTrama({ client });
    expect(r).toMatchObject({ enviados: 3, erros: 1 });
    expect(await lerFila(semSku)).toMatchObject({ status: "erro", last_error: '"Sem SKU" está sem SKU no catálogo da loja.' });
  });

  it("com unidade livre: o Trama reserva do estoque e o pedido vai direto para a logística", async () => {
    expect(await lerFila(estoque)).toMatchObject({ status: "enviado", erp_status: "pronto_para_envio", erp_financial_status: "pago" });
    expect(await lerPedido(estoque)).toMatchObject({ status: "em_preparacao" });
    expect((await notas(estoque)).at(-1)).toEqual({ status: "em_preparacao", public_note: "Seu pedido está pronto. Vamos combinar a data da entrega com você." });
  });

  it("sem unidade livre: o Trama abre a ordem de produção para a fábrica", async () => {
    expect(await lerFila(fabrica)).toMatchObject({ status: "enviado", erp_status: "confirmado", erp_financial_status: "a_receber" });
    expect(await lerPedido(fabrica)).toMatchObject({ status: "em_preparacao" });
    if (driver) expect(JSON.parse(roda(`ops ${await numeroNoTrama(fabrica)}`)).ops).toEqual([expect.objectContaining({ status: "aguardando_aceite" })]);
  });

  it("cancelado na loja antes da fábrica aceitar: o Trama cancela também", async () => {
    await setStatus(cancelado, "cancelado");
    expect(await lerFila(cancelado)).toMatchObject({ cancel_status: "pendente" });
    expect(await processarFilaDoTrama({ client })).toMatchObject({ cancelados: 1 });
    expect(await lerFila(cancelado)).toMatchObject({ cancel_status: "feito", erp_status: "cancelado" });
    // Conferir de novo não muda nada na loja (já cancelado).
    expect(await atualizarDaTrama({ orderId: cancelado }, { client })).toMatchObject({ ok: true, status: "cancelado", passos: 0 });
  });

  it.runIf(Boolean(driver))("fábrica aceita a OP: o cliente vê 'em produção'", async () => {
    roda(`aceitar ${await numeroNoTrama(fabrica)} ${daqui(10)}`);
    expect(await atualizarDaTrama({ orderId: fabrica }, { client })).toMatchObject({ ok: true, status: "em_preparacao", passos: 1 });
    expect((await notas(fabrica)).at(-1)).toEqual({ status: "em_preparacao", public_note: "Seu pedido entrou em produção na fábrica." });
    expect(await atualizarDaTrama({ orderId: fabrica }, { client })).toMatchObject({ passos: 0 });
    // Já em produção: a loja não consegue mais cancelar sozinha.
    await setStatus(fabrica, "cancelado");
    await processarFilaDoTrama({ client });
    expect(await lerFila(fabrica)).toMatchObject({ cancel_status: "recusado" });
    expect(String((await lerFila(fabrica)).cancel_error)).toMatch(/em produção ou a caminho/);
  });

  it.runIf(Boolean(driver))("expedição agenda e o entregador sai: data, período e 'saiu para entrega' na loja", async () => {
    const data = daqui(2);
    roda(`agendar ${await numeroNoTrama(estoque)} ${data} tarde`);
    expect(await atualizarDaTrama({ orderId: estoque }, { client })).toMatchObject({ ok: true, status: "enviado" });
    expect(await lerPedido(estoque)).toMatchObject({ status: "enviado", scheduled_date: data, scheduled_window: "Tarde" });
    roda(`rota ${await numeroNoTrama(estoque)} ${data}`);
    expect(await atualizarDaTrama({ orderId: estoque }, { client })).toMatchObject({ ok: true, status: "saiu_para_entrega" });
    expect(await lerFila(estoque)).toMatchObject({ erp_status: "em_rota" });
    expect((await notas(estoque)).map((e) => e.status)).toEqual(["recebido", "pago", "em_preparacao", "enviado", "saiu_para_entrega"]);
  });
});
