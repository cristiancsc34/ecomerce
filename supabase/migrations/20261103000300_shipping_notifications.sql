-- Frete por região e avisos automáticos (e-mail e WhatsApp). Ver docs/FRETE-E-AVISOS.md.
--
-- Complementa 20261103000100_orders.sql (pedidos) e 20261103000200_site_checkout.sql (pedido feito pelo site):
--   * shipping_options: formas de entrega que o DONO define no painel (faixas de CEP, valor, prazo, retirada).
--     Nada de frete inventado: valor vazio = "a combinar". O checkout consulta shipping_options_for(cep).
--   * notification_settings: o dono liga os avisos automáticos por canal (só com o provedor configurado).
--   * Cada etapa nova do pedido (order_events) entra na fila notification_outbox por e-mail e/ou WhatsApp, só com
--     o canal ligado e, no WhatsApp, com o aceite do cliente.

-- -----------------------------------------------------------------------------
-- Formas de entrega
-- -----------------------------------------------------------------------------
create table public.shipping_options (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint shipping_options_name check (char_length(btrim(name)) between 2 and 80),
  method public.delivery_method not null default 'entrega_propria',
  -- Faixas de CEP atendidas: [{"from":"88000000","to":"88099999"}]. Vazio na retirada (vale para todos).
  cep_ranges jsonb not null default '[]'::jsonb constraint shipping_options_ranges check (jsonb_typeof(cep_ranges) = 'array'),
  -- null = "a combinar" (o cliente vê isso antes de concluir; nunca um valor inventado).
  price_cents integer constraint shipping_options_price check (price_cents >= 0),
  -- Prazo em dias úteis depois do pagamento. Vazio = não promete prazo.
  days_min integer constraint shipping_options_days_min check (days_min between 0 and 120),
  days_max integer constraint shipping_options_days_max check (days_max between 0 and 120),
  -- Texto livre que o cliente vê (ex.: endereço e horário da retirada, "entregamos de seg. a sáb.").
  details text constraint shipping_options_details check (char_length(details) <= 500),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_options_days_order check (days_min is null or days_max is null or days_min <= days_max),
  constraint shipping_options_needs_ranges check (method = 'retirada' or jsonb_array_length(cep_ranges) > 0)
);

create trigger shipping_options_touch_updated_at
  before update on public.shipping_options
  for each row execute function private.touch_updated_at();

-- Faixas válidas: CEPs com 8 dígitos e "de" <= "até".
create or replace function private.valid_cep_ranges(p_ranges jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(
    (r ->> 'from') ~ '^[0-9]{8}$' and (r ->> 'to') ~ '^[0-9]{8}$' and (r ->> 'from') <= (r ->> 'to')
  ), true)
  from jsonb_array_elements(p_ranges) r;
$$;

alter table public.shipping_options
  add constraint shipping_options_ranges_valid check (private.valid_cep_ranges(cep_ranges) and jsonb_array_length(cep_ranges) <= 50);

-- O CEP está numa das faixas? (CEP com 8 dígitos; comparação de texto funciona porque o tamanho é fixo.)
create or replace function private.cep_in_ranges(p_cep text, p_ranges jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_cep ~ '^[0-9]{8}$' and exists (
    select 1 from jsonb_array_elements(p_ranges) r where p_cep between (r ->> 'from') and (r ->> 'to')
  );
$$;

-- -----------------------------------------------------------------------------
-- Avisos automáticos: ligados por canal (uma linha só)
-- -----------------------------------------------------------------------------
create table public.notification_settings (
  id boolean primary key default true constraint notification_settings_single check (id),
  notify_email boolean not null default false,
  notify_whatsapp boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

insert into public.notification_settings (id) values (true);

create trigger notification_settings_touch_updated_at
  before update on public.notification_settings
  for each row execute function private.touch_updated_at();

-- Acesso: a equipe lê; só administradores mudam. O público usa shipping_options_for().
alter table public.shipping_options enable row level security;
alter table public.notification_settings enable row level security;

create policy "Equipe lê formas de entrega" on public.shipping_options for select to authenticated using ((select private.is_staff()));
create policy "Admin cria formas de entrega" on public.shipping_options for insert to authenticated with check ((select private.is_admin()));
create policy "Admin edita formas de entrega" on public.shipping_options for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admin remove formas de entrega" on public.shipping_options for delete to authenticated using ((select private.is_admin()));

create policy "Equipe lê os avisos ligados" on public.notification_settings for select to authenticated using ((select private.is_staff()));
create policy "Admin liga e desliga avisos" on public.notification_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on public.shipping_options, public.notification_settings from anon, authenticated;
grant select, insert, update, delete on public.shipping_options to authenticated;
grant select, update on public.notification_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Frete para um CEP (sem login)
-- -----------------------------------------------------------------------------

/** Formas de entrega para um CEP (retirada sempre aparece, se ativa). */
create or replace function public.shipping_options_for(p_cep text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'method', o.method,
    'priceCents', o.price_cents,
    'daysMin', o.days_min,
    'daysMax', o.days_max,
    'details', o.details
  ) order by o.sort_order, o.price_cents nulls last, o.name), '[]'::jsonb)
  from public.shipping_options o
  where o.active
    and (o.method = 'retirada'
      or private.cep_in_ranges(regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g'), o.cep_ranges));
$$;

revoke all on function public.shipping_options_for(text) from public;
grant execute on function public.shipping_options_for(text) to anon, authenticated;
revoke all on function private.valid_cep_ranges(jsonb) from public;
revoke all on function private.cep_in_ranges(text, jsonb) from public;
grant execute on function private.valid_cep_ranges(jsonb) to anon, authenticated;
grant execute on function private.cep_in_ranges(text, jsonb) to anon, authenticated;
-- A regra das faixas (check constraint) roda com o papel de quem grava: scripts com a chave de serviço também.
grant usage on schema private to service_role;
grant execute on function private.valid_cep_ranges(jsonb) to service_role;
grant execute on function private.cep_in_ranges(text, jsonb) to service_role;

comment on table public.shipping_options is
  'Formas de entrega definidas pelo dono: faixas de CEP, valor (vazio = a combinar), prazo em dias úteis, retirada.';
comment on table public.notification_settings is
  'Avisos automáticos ao cliente a cada etapa do pedido: ligados por canal (e-mail, WhatsApp).';

-- -----------------------------------------------------------------------------
-- Avisos automáticos a cada etapa
-- -----------------------------------------------------------------------------

-- A fila passa a aceitar todas as etapas do pedido (pedido_recebido, pedido_pago, pedido_enviado…).
alter table public.notification_outbox drop constraint notification_outbox_event_check;
alter table public.notification_outbox
  add constraint notification_outbox_event_check check (event ~ '^pedido_[a-z_]{3,40}$');

/**
 * Etapa nova → avisos na fila (um por canal). O texto é montado na hora do envio, com os dados atuais do pedido.
 * Só entra na fila o canal que o dono ligou; WhatsApp só com o aceite do cliente.
 */
create or replace function private.enqueue_order_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.notification_settings;
  v_order public.orders;
  v_payload jsonb;
begin
  select * into v_settings from public.notification_settings where id;
  if not found or not (v_settings.notify_email or v_settings.notify_whatsapp) then
    return new;
  end if;
  select * into v_order from public.orders where id = new.order_id;
  v_payload := jsonb_build_object('orderId', new.order_id, 'eventId', new.id, 'status', new.status);
  if v_settings.notify_email and v_order.customer_email is not null then
    insert into public.notification_outbox (dedupe_key, order_ref, event, channel, recipient, payload)
    values ('etapa:' || new.id || ':email', new.order_id::text, 'pedido_' || new.status, 'email', v_order.customer_email, v_payload)
    on conflict (dedupe_key) do nothing;
  end if;
  if v_settings.notify_whatsapp and v_order.whatsapp_opt_in and v_order.customer_phone is not null then
    insert into public.notification_outbox (dedupe_key, order_ref, event, channel, recipient, payload)
    values ('etapa:' || new.id || ':whatsapp', new.order_id::text, 'pedido_' || new.status, 'whatsapp', v_order.customer_phone, v_payload)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_order_notifications() from public;

create trigger order_events_enqueue_notifications
  after insert on public.order_events
  for each row execute function private.enqueue_order_notifications();

-- A equipe vê, no pedido, o que foi avisado (sem o conteúdo da mensagem nem o erro técnico completo).
create or replace function public.order_notifications(p_order_id uuid)
returns table (event text, channel public.notification_channel, status public.notification_status, attempts integer,
  created_at timestamptz, sent_at timestamptz, last_error text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.event, n.channel, n.status, n.attempts, n.created_at, n.sent_at, left(n.last_error, 200)
  from public.notification_outbox n
  where n.order_ref = p_order_id::text and (select private.is_staff())
  order by n.created_at, n.channel;
$$;

revoke all on function public.order_notifications(uuid) from public, anon;
grant execute on function public.order_notifications(uuid) to authenticated;

comment on table public.shipping_options is
  'Formas de entrega definidas pelo dono: faixas de CEP, valor (vazio = a combinar), prazo em dias úteis, retirada.';
