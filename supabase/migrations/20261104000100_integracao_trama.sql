-- Integração com o Trama: a plataforma da fábrica e da logística. Ver docs/INTEGRACAO-TRAMA.md.
--
-- O cliente compra na loja (checkout do site ou pedido do atendimento). Quando a equipe confirma o pedido
-- (pagamento confirmado ou "preparar sem pagamento"), ele entra na fila order_integration e o servidor envia ao
-- Trama (POST /api/v1/pedidos). Lá, o próprio Trama decide o caminho de cada item:
--   * tem unidade livre no estoque → reserva e o pedido vai direto para a expedição (logística);
--   * não tem (ou é personalizado) → cria a ordem de produção para a fábrica.
-- Cada etapa no Trama (produção, pronto, entrega agendada, saiu para entrega, entregue, cancelado) volta para a loja
-- por webhook assinado e é aplicada aqui por trama_apply(), na mesma linha do tempo que o cliente acompanha.
--
-- Regras:
--   * só pedidos confirmados vão para a fábrica: um pedido "recebido" (ainda sem pagamento combinado) não sai daqui;
--   * pedido cancelado na loja depois do envio pede o cancelamento no Trama (cancel_status);
--   * só o servidor (service_role) escreve na fila e aplica etapas; a equipe lê e pede reenvio pelas funções.

create table public.order_integration (
  order_id uuid primary key references public.orders (id) on delete cascade,
  -- pendente → enviando → enviado; erro = precisa de alguém (SKU, preço, chave); ignorado = não vai para o Trama.
  status text not null default 'pendente'
    constraint order_integration_status check (status in ('pendente', 'enviando', 'enviado', 'erro', 'ignorado')),
  attempts integer not null default 0 constraint order_integration_attempts check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text constraint order_integration_last_error check (char_length(last_error) <= 500),
  -- O que o Trama devolveu (número do pedido lá, etapa, situação do pagamento, previsão e link do rastreio).
  erp_number integer constraint order_integration_erp_number check (erp_number > 0),
  erp_status text constraint order_integration_erp_status check (erp_status ~ '^[a-z_]{3,30}$'),
  erp_financial_status text constraint order_integration_erp_financial check (erp_financial_status ~ '^[a-z_]{3,30}$'),
  erp_forecast date,
  erp_tracking_url text constraint order_integration_erp_tracking check (erp_tracking_url ~ '^https?://' and char_length(erp_tracking_url) <= 500),
  sent_at timestamptz,
  synced_at timestamptz,
  -- Cancelado na loja depois do envio: o Trama precisa saber (recusado = já está em produção ou a caminho).
  cancel_status text constraint order_integration_cancel_status check (cancel_status in ('pendente', 'feito', 'recusado')),
  cancel_error text constraint order_integration_cancel_error check (char_length(cancel_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_integration_due_idx on public.order_integration (next_attempt_at)
  where status in ('pendente', 'enviando') or cancel_status = 'pendente';

create trigger order_integration_touch_updated_at
  before update on public.order_integration
  for each row execute function private.touch_updated_at();

-- Entregas de webhook já processadas (X-Trama-Entrega): o Trama pode repetir a mesma entrega.
create table public.trama_webhook_receipts (
  delivery_id text primary key constraint trama_webhook_receipts_id check (char_length(delivery_id) between 1 and 100),
  event text not null constraint trama_webhook_receipts_event check (char_length(event) <= 60),
  order_code text constraint trama_webhook_receipts_order check (char_length(order_code) <= 80),
  received_at timestamptz not null default now()
);

alter table public.order_integration enable row level security;
alter table public.trama_webhook_receipts enable row level security;

create policy "Equipe lê a integração do pedido" on public.order_integration for select to authenticated
  using ((select private.is_staff()));

revoke all on public.order_integration, public.trama_webhook_receipts from public, anon, authenticated;
grant select on public.order_integration to authenticated;
grant select, insert, update, delete on public.order_integration, public.trama_webhook_receipts to service_role;

-- -----------------------------------------------------------------------------
-- Fila: o pedido confirmado entra; o cancelado pede o cancelamento
-- -----------------------------------------------------------------------------

/** Pedido confirmado (saiu de "recebido" para pago/preparação, ou já nasceu pago) → fila do Trama. */
create or replace function private.enqueue_order_integration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pago', 'em_preparacao') and (tg_op = 'INSERT' or old.status = 'recebido') then
    insert into public.order_integration (order_id) values (new.id) on conflict (order_id) do nothing;
  end if;
  if tg_op = 'UPDATE' and new.status = 'cancelado' and old.status <> 'cancelado' then
    -- Ainda não chegou ao Trama: não envia mais.
    update public.order_integration
       set status = 'ignorado', last_error = 'Pedido cancelado na loja antes de ir para o Trama.'
     where order_id = new.id and status in ('pendente', 'erro');
    -- Já chegou (ou está chegando): pede o cancelamento lá.
    update public.order_integration
       set cancel_status = 'pendente', cancel_error = null, attempts = 0, next_attempt_at = now()
     where order_id = new.id and status in ('enviado', 'enviando') and cancel_status is null;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_order_integration() from public;

create trigger orders_enqueue_integration_insert
  after insert on public.orders
  for each row when (new.status = 'pago') execute function private.enqueue_order_integration();

create trigger orders_enqueue_integration_update
  after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function private.enqueue_order_integration();

/**
 * Pega até p_limit itens vencidos da fila (envio ou cancelamento). Item preso em "enviando" (servidor caiu no meio)
 * volta depois de 10 minutos; o Trama é idempotente pela referência, então repetir o envio não duplica o pedido.
 */
create or replace function public.claim_order_integrations(p_limit integer default 20)
returns setof public.order_integration
language sql
security definer
set search_path = ''
as $$
  update public.order_integration i
     set status = case when i.status = 'pendente' then 'enviando' else i.status end,
         attempts = i.attempts + 1,
         next_attempt_at = now() + interval '10 minutes'
   where i.order_id in (
     select q.order_id from public.order_integration q
      where (q.status in ('pendente', 'enviando') or (q.status = 'enviado' and q.cancel_status = 'pendente'))
        and q.next_attempt_at <= now()
      order by q.next_attempt_at
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
   )
  returning i.*;
$$;

revoke all on function public.claim_order_integrations(integer) from public, anon, authenticated;
grant execute on function public.claim_order_integrations(integer) to service_role;

/**
 * A equipe pede para enviar de novo (depois de corrigir SKU, preço ou a chave) ou para enviar um pedido que já
 * estava confirmado antes da integração existir. Também repete um cancelamento que o Trama recusou.
 */
create or replace function public.requeue_order_integration(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_row public.order_integration;
begin
  if not (select private.is_staff()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select status into v_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  select * into v_row from public.order_integration where order_id = p_order_id for update;
  if found and v_row.status = 'enviado' then
    if v_status = 'cancelado' and v_row.cancel_status = 'recusado' then
      update public.order_integration
         set cancel_status = 'pendente', cancel_error = null, attempts = 0, next_attempt_at = now()
       where order_id = p_order_id;
      return 'cancelamento';
    end if;
    raise exception 'Este pedido já está no Trama.' using errcode = '22023';
  end if;
  if v_status not in ('pago', 'em_preparacao') then
    raise exception 'Só vai para a fábrica e a logística o pedido com pagamento confirmado ou em preparação.' using errcode = '22023';
  end if;
  insert into public.order_integration (order_id) values (p_order_id)
  on conflict (order_id) do update
    set status = 'pendente', attempts = 0, next_attempt_at = now(), last_error = null;
  return 'envio';
end;
$$;

revoke all on function public.requeue_order_integration(uuid) from public, anon;
grant execute on function public.requeue_order_integration(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Etapas que voltam do Trama
-- -----------------------------------------------------------------------------

/**
 * Aplica, numa transação, as etapas calculadas a partir do Trama (lib/trama/mapear.ts) e guarda a situação de lá.
 * p_steps: [{ "status": "em_preparacao", "note": "Seu pedido entrou em produção na fábrica.",
 *             "delivery": { "scheduledDate": "2026-11-12", "scheduledWindow": "tarde" } }, …]
 *   * etapa diferente da atual: só se a ordem da loja permitir (private.order_transition_allowed); senão é pulada;
 *   * mesma etapa: atualiza a data/período combinados e registra o recado, sem repetir o último recado igual.
 * p_erp: { "number", "status", "financialStatus", "forecast", "trackingUrl" }; financialStatus "pago" grava paid_at.
 * Devolve a etapa final do pedido na loja.
 */
create or replace function public.trama_apply(p_order_id uuid, p_steps jsonb, p_erp jsonb default '{}'::jsonb)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step jsonb;
  v_current public.order_status;
  v_target public.order_status;
  v_note text;
  v_delivery jsonb;
  v_changed boolean;
  v_last_note text;
  v_internal constant text := 'Atualizado pelo Trama (fábrica e logística).';
begin
  select status into v_current from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  for v_step in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
    v_target := (v_step ->> 'status')::public.order_status;
    v_note := nullif(btrim(v_step ->> 'note'), '');
    v_delivery := coalesce(v_step -> 'delivery', '{}'::jsonb);
    if v_target = v_current then
      update public.orders set
        scheduled_date = case when v_delivery ? 'scheduledDate' then nullif(v_delivery ->> 'scheduledDate', '')::date else scheduled_date end,
        scheduled_window = case when v_delivery ? 'scheduledWindow' then nullif(btrim(v_delivery ->> 'scheduledWindow'), '') else scheduled_window end
      where id = p_order_id
        and ((v_delivery ? 'scheduledDate' and scheduled_date is distinct from nullif(v_delivery ->> 'scheduledDate', '')::date)
          or (v_delivery ? 'scheduledWindow' and scheduled_window is distinct from nullif(btrim(v_delivery ->> 'scheduledWindow'), '')));
      v_changed := found;
      select e.public_note into v_last_note from public.order_events e
        where e.order_id = p_order_id order by e.created_at desc, e.id desc limit 1;
      if v_note is not null and (v_changed or v_last_note is distinct from v_note) then
        insert into public.order_events (order_id, status, public_note, internal_note, created_by)
        values (p_order_id, v_current, v_note, v_internal, null);
      end if;
    elsif private.order_transition_allowed(v_current, v_target) then
      update public.orders set
        status = v_target,
        paid_at = case when v_target = 'pago' then coalesce(paid_at, now()) else paid_at end,
        scheduled_date = case when v_delivery ? 'scheduledDate' then nullif(v_delivery ->> 'scheduledDate', '')::date else scheduled_date end,
        scheduled_window = case when v_delivery ? 'scheduledWindow' then nullif(btrim(v_delivery ->> 'scheduledWindow'), '') else scheduled_window end
      where id = p_order_id;
      insert into public.order_events (order_id, status, public_note, internal_note, created_by)
      values (p_order_id, v_target, v_note, v_internal, null);
      v_current := v_target;
    end if;
  end loop;

  if p_erp ->> 'financialStatus' = 'pago' then
    update public.orders set paid_at = coalesce(paid_at, now()) where id = p_order_id and paid_at is null;
  end if;

  update public.order_integration set
    erp_number = coalesce((p_erp ->> 'number')::integer, erp_number),
    erp_status = coalesce(p_erp ->> 'status', erp_status),
    erp_financial_status = coalesce(p_erp ->> 'financialStatus', erp_financial_status),
    erp_forecast = case when p_erp ? 'forecast' then nullif(p_erp ->> 'forecast', '')::date else erp_forecast end,
    erp_tracking_url = coalesce(nullif(p_erp ->> 'trackingUrl', ''), erp_tracking_url),
    synced_at = now(),
    -- Cancelado pelo próprio Trama: não precisa pedir o cancelamento de volta.
    cancel_status = case when p_erp ->> 'status' = 'cancelado' then 'feito' else cancel_status end,
    cancel_error = case when p_erp ->> 'status' = 'cancelado' then null else cancel_error end
  where order_id = p_order_id;

  return v_current;
end;
$$;

revoke all on function public.trama_apply(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.trama_apply(uuid, jsonb, jsonb) to service_role;
grant execute on function private.order_transition_allowed(public.order_status, public.order_status) to service_role;

comment on table public.order_integration is
  'Pedidos confirmados enviados ao Trama (fábrica e logística): fila, número e etapa lá, cancelamento.';
comment on table public.trama_webhook_receipts is
  'Entregas de webhook do Trama já processadas (X-Trama-Entrega), para ignorar repetidas.';
