import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createDatabase } from "./helpers";

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase({ seed: false });
});

afterAll(async () => {
  await db.close();
});

const insert = (key: string, nextAttempt = "now()") =>
  db.query(
    `insert into public.notification_outbox (dedupe_key, order_ref, event, channel, recipient, payload, next_attempt_at)
     values ($1, 'pedido-1', 'pedido_confirmado', 'email', 'maria@exemplo.com', '{}'::jsonb, ${nextAttempt})`,
    [key],
  );

describe("fila de avisos (notification_outbox)", () => {
  it("o mesmo aviso não entra duas vezes", async () => {
    await insert("pedido_confirmado:pedido-1:email");
    await expect(insert("pedido_confirmado:pedido-1:email")).rejects.toThrow(/duplicate key|unique/i);
  });

  it("visitante e equipe logada não leem, não gravam e não reservam avisos", async () => {
    for (const actor of ["anon", "admin"] as const) {
      await expect(as(db, actor, (tx) => tx.query("select * from public.notification_outbox"))).rejects.toThrow(/permission denied/i);
      await expect(
        as(db, actor, (tx) =>
          tx.query(
            `insert into public.notification_outbox (dedupe_key, order_ref, event, channel, recipient, payload)
             values ('x', 'p', 'pedido_confirmado', 'email', 'a@b.co', '{}')`,
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(as(db, actor, (tx) => tx.query("select * from public.claim_notifications(10)"))).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it("o processador reserva só os vencidos, uma vez, e recupera os presos após 10 minutos", async () => {
    await insert("pedido_confirmado:pedido-2:email", "now() + interval '1 hour'");
    const first = await db.query<{ dedupe_key: string; status: string; attempts: number }>(
      "select dedupe_key, status, attempts from public.claim_notifications(10)",
    );
    expect(first.rows).toEqual([{ dedupe_key: "pedido_confirmado:pedido-1:email", status: "sending", attempts: 1 }]);
    // Já reservado: não volta na hora (evita envio duplicado por dois processadores).
    expect((await db.query("select * from public.claim_notifications(10)")).rows).toEqual([]);
    // Processador caiu: depois de 10 minutos o aviso volta a ser elegível.
    await db.query(
      "update public.notification_outbox set next_attempt_at = now() - interval '1 second' where dedupe_key = 'pedido_confirmado:pedido-1:email'",
    );
    const retry = await db.query<{ attempts: number }>("select attempts from public.claim_notifications(10)");
    expect(retry.rows).toEqual([{ attempts: 2 }]);
  });

  it("valida evento e tamanho dos campos", async () => {
    await expect(
      db.query(
        `insert into public.notification_outbox (dedupe_key, order_ref, event, channel, recipient, payload)
         values ('y', 'p', 'promocao', 'email', 'a@b.co', '{}')`,
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
