-- Fila de avisos de pedido (WhatsApp e e-mail) — estrutura para quando houver checkout.
--
-- Fluxo: pagamento confirmado por webhook verificado -> o servidor grava 1 linha por
-- canal aqui (idempotente por dedupe_key) -> um processador (cron) pega as linhas com
-- claim_notifications(), envia pelo provedor e marca enviado/erro com nova tentativa.
-- Só o service_role acessa: contém contato do cliente (dado pessoal, LGPD).

create type public.notification_channel as enum ('email', 'whatsapp');
create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed', 'cancelled');

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  -- evento:pedido:canal — o mesmo aviso nunca é enfileirado duas vezes (webhook repetido).
  dedupe_key text not null unique,
  order_ref text not null check (length(order_ref) between 1 and 100),
  event text not null check (event in ('pedido_confirmado', 'pedido_enviado', 'pedido_entregue')),
  channel public.notification_channel not null,
  recipient text not null check (length(recipient) between 3 and 320),
  payload jsonb not null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 500),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at)
  where status in ('pending', 'sending');

alter table public.notification_outbox enable row level security;
-- Sem políticas: anon e authenticated não leem nem escrevem nada.
revoke all on public.notification_outbox from public, anon, authenticated;

-- Pega até p_limit avisos vencidos. Um aviso preso em "sending" (processador caiu)
-- volta a ser elegível depois de 10 minutos.
create or replace function public.claim_notifications(p_limit integer default 20)
returns setof public.notification_outbox
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox o
     set status = 'sending',
         attempts = o.attempts + 1,
         next_attempt_at = now() + interval '10 minutes'
   where o.id in (
     select q.id from public.notification_outbox q
      where q.status in ('pending', 'sending') and q.next_attempt_at <= now()
      order by q.next_attempt_at
      limit greatest(1, least(coalesce(p_limit, 20), 100))
      for update skip locked
   )
  returning o.*;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

comment on table public.notification_outbox is
  'Avisos de pedido a enviar (WhatsApp/e-mail). Contém contato do cliente: apagar enviados após 90 dias.';
