-- Pedidos e entregas (logística pós-compra). Ver docs/LOGISTICA.md.
--
-- Enquanto não há checkout, a venda é fechada pelo atendimento (WhatsApp, telefone) e a equipe registra o pedido no
-- painel. Cada mudança de etapa fica na linha do tempo do pedido (order_events). O cliente acompanha em
-- /pedido/<código> com o link secreto (public_token), ou informando o número do pedido e o celular.
--
-- Regras no banco (não só na interface):
--   * só a equipe lê e altera pedidos (RLS); o cliente só vê o próprio pedido pelas funções de acompanhamento;
--   * etapas seguem uma ordem válida (ex.: não dá para ir de "recebido" para "entregue");
--   * valores são recalculados aqui; frete vazio = "a combinar" (nunca inventado);
--   * link de rastreio só https.

create type public.order_status as enum (
  'recebido',              -- pedido registrado, aguardando pagamento ou confirmação
  'pago',                  -- pagamento confirmado
  'em_preparacao',         -- separação, embalagem ou produção
  'enviado',               -- com a transportadora, ou entrega própria agendada
  'saiu_para_entrega',     -- no caminho, no dia da entrega
  'entregue',
  'cancelado',
  'devolucao_solicitada',  -- troca ou devolução pedida pelo cliente
  'devolvido'
);

create type public.delivery_method as enum ('entrega_propria', 'transportadora', 'retirada');

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PED-' || nextval('public.order_number_seq')::text),
  status public.order_status not null default 'recebido',
  source text not null default 'painel' constraint orders_source check (source in ('painel', 'site')),
  customer_name text not null constraint orders_customer_name check (char_length(btrim(customer_name)) between 2 and 120),
  -- Só dígitos, com DDI (ex.: 5511999998888); o painel completa o 55 de números do Brasil.
  customer_phone text constraint orders_customer_phone check (customer_phone ~ '^[0-9]{12,15}$'),
  customer_email text constraint orders_customer_email check (customer_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  whatsapp_opt_in boolean not null default false,
  -- Endereço: cep, rua, numero, complemento, bairro, cidade, uf, referencia (vazio na retirada).
  address jsonb not null default '{}'::jsonb constraint orders_address_object check (jsonb_typeof(address) = 'object'),
  delivery_method public.delivery_method not null default 'entrega_propria',
  carrier text constraint orders_carrier check (char_length(carrier) <= 80),
  tracking_code text constraint orders_tracking_code check (char_length(tracking_code) <= 80),
  tracking_url text constraint orders_tracking_url check (tracking_url ~ '^https://' and char_length(tracking_url) <= 500),
  scheduled_date date,
  scheduled_window text constraint orders_scheduled_window check (char_length(scheduled_window) <= 40),
  -- Acesso para a entrega (andar, elevador, escada, portaria, horários): o entregador precisa saber.
  delivery_notes text constraint orders_delivery_notes check (char_length(delivery_notes) <= 1000),
  assembly boolean not null default false,
  subtotal_cents integer not null default 0 constraint orders_subtotal check (subtotal_cents >= 0),
  shipping_cents integer constraint orders_shipping check (shipping_cents >= 0),
  discount_cents integer not null default 0 constraint orders_discount check (discount_cents >= 0),
  total_cents integer not null default 0 constraint orders_total check (total_cents >= 0),
  payment_method text constraint orders_payment_method check (payment_method in ('pix', 'cartao', 'boleto', 'dinheiro', 'link', 'outro')),
  paid_at timestamptz,
  internal_notes text constraint orders_internal_notes check (char_length(internal_notes) <= 2000),
  public_token uuid not null default gen_random_uuid(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_created_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  -- Cópia do nome no momento da venda (o produto pode mudar ou sair do catálogo depois).
  name text not null constraint order_items_name check (char_length(btrim(name)) between 1 and 200),
  variant_name text constraint order_items_variant_name check (char_length(variant_name) <= 120),
  unit_price_cents integer not null constraint order_items_price check (unit_price_cents >= 0),
  quantity integer not null constraint order_items_quantity check (quantity between 1 and 99),
  sort_order integer not null default 0
);

create index order_items_order_idx on public.order_items (order_id, sort_order);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  public_note text constraint order_events_public_note check (char_length(public_note) <= 500),
  internal_note text constraint order_events_internal_note check (char_length(internal_note) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function private.touch_updated_at();

-- Acesso: só a equipe. A linha do tempo não se edita nem se apaga.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

create policy "Equipe lê pedidos" on public.orders for select to authenticated using ((select private.is_staff()));
create policy "Equipe cria pedidos" on public.orders for insert to authenticated with check ((select private.is_staff()));
create policy "Equipe edita pedidos" on public.orders for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Admin remove pedidos" on public.orders for delete to authenticated using ((select private.is_admin()));

create policy "Equipe lê itens" on public.order_items for select to authenticated using ((select private.is_staff()));
create policy "Equipe cria itens" on public.order_items for insert to authenticated with check ((select private.is_staff()));
create policy "Equipe edita itens" on public.order_items for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "Equipe remove itens" on public.order_items for delete to authenticated using ((select private.is_staff()));

create policy "Equipe lê a linha do tempo" on public.order_events for select to authenticated using ((select private.is_staff()));
create policy "Equipe registra etapas" on public.order_events for insert to authenticated with check ((select private.is_staff()));

-- O Supabase dá permissões padrão em toda tabela nova; aqui ficam só as necessárias.
revoke all on public.orders, public.order_items, public.order_events from anon, authenticated;
grant select, insert, update, delete on public.orders, public.order_items to authenticated;
grant select, insert on public.order_events to authenticated;
grant usage on sequence public.order_number_seq to authenticated;

-- Ordem das etapas. Fora daqui, o banco recusa.
create or replace function private.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'recebido' then p_to in ('pago', 'em_preparacao', 'cancelado')
    when 'pago' then p_to in ('em_preparacao', 'cancelado')
    -- Entrega própria pode sair direto; retirada na loja vai direto para entregue.
    when 'em_preparacao' then p_to in ('enviado', 'saiu_para_entrega', 'entregue', 'cancelado')
    when 'enviado' then p_to in ('saiu_para_entrega', 'entregue', 'cancelado')
    -- Não deu para entregar: volta para "enviado" (reagendar).
    when 'saiu_para_entrega' then p_to in ('entregue', 'enviado')
    when 'entregue' then p_to in ('devolucao_solicitada')
    -- O cliente pode desistir da devolução.
    when 'devolucao_solicitada' then p_to in ('devolvido', 'entregue')
    else false
  end;
$$;

-- Itens e totais a partir do JSON do painel. O nome vem do catálogo quando o produto existe.
create or replace function private.write_order_items(p_order_id uuid, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_position integer := 0;
  v_subtotal bigint := 0;
  v_name text;
  v_variant_name text;
  v_price integer;
  v_quantity integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Inclua pelo menos um item no pedido.' using errcode = '22023';
  end if;
  delete from public.order_items where order_id = p_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_price := (v_item ->> 'unitPriceCents')::integer;
    v_quantity := (v_item ->> 'quantity')::integer;
    select p.name into v_name from public.products p where p.id = (v_item ->> 'productId')::uuid;
    select v.name into v_variant_name from public.product_variants v
      where v.id = (v_item ->> 'variantId')::uuid and v.product_id = (v_item ->> 'productId')::uuid;
    insert into public.order_items (order_id, product_id, variant_id, name, variant_name, unit_price_cents, quantity, sort_order)
    values (
      p_order_id,
      (v_item ->> 'productId')::uuid,
      case when v_variant_name is not null then (v_item ->> 'variantId')::uuid end,
      coalesce(v_name, v_item ->> 'name'),
      coalesce(v_variant_name, nullif(btrim(v_item ->> 'variantName'), '')),
      v_price,
      v_quantity,
      v_position
    );
    v_subtotal := v_subtotal + v_price::bigint * v_quantity;
    v_position := v_position + 1;
  end loop;
  return v_subtotal::integer;
end;
$$;

create or replace function private.order_totals(p_order_id uuid, p_subtotal integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total bigint;
begin
  select p_subtotal::bigint + coalesce(o.shipping_cents, 0) - o.discount_cents into v_total
    from public.orders o where o.id = p_order_id;
  if v_total < 0 then
    raise exception 'O desconto não pode ser maior que o valor do pedido.' using errcode = '22023';
  end if;
  update public.orders set subtotal_cents = p_subtotal, total_cents = v_total where id = p_order_id;
end;
$$;

-- Campos editáveis do pedido (cliente, endereço, entrega, valores, pagamento, observações).
create or replace function private.order_fields(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'customer_name', btrim(p_data ->> 'customerName'),
    'customer_phone', nullif(regexp_replace(coalesce(p_data ->> 'customerPhone', ''), '[^0-9]', '', 'g'), ''),
    'customer_email', nullif(btrim(p_data ->> 'customerEmail'), ''),
    'whatsapp_opt_in', coalesce((p_data ->> 'whatsappOptIn')::boolean, false),
    'address', coalesce(p_data -> 'address', '{}'::jsonb),
    'delivery_method', coalesce(p_data ->> 'deliveryMethod', 'entrega_propria'),
    'delivery_notes', nullif(btrim(p_data ->> 'deliveryNotes'), ''),
    'assembly', coalesce((p_data ->> 'assembly')::boolean, false),
    'shipping_cents', (p_data ->> 'shippingCents')::integer,
    'discount_cents', coalesce((p_data ->> 'discountCents')::integer, 0),
    'payment_method', nullif(p_data ->> 'paymentMethod', ''),
    'internal_notes', nullif(btrim(p_data ->> 'internalNotes'), '')
  );
$$;

/** Cria o pedido com itens e a primeira etapa ("recebido" ou "pago"), numa transação. */
create or replace function public.create_order(p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_fields jsonb := private.order_fields(p_data);
  v_status public.order_status := coalesce(nullif(p_data ->> 'status', ''), 'recebido')::public.order_status;
begin
  if v_status not in ('recebido', 'pago') then
    raise exception 'Um pedido novo começa como recebido ou pago.' using errcode = '22023';
  end if;
  insert into public.orders (
    status, customer_name, customer_phone, customer_email, whatsapp_opt_in, address, delivery_method,
    delivery_notes, assembly, shipping_cents, discount_cents, payment_method, internal_notes, paid_at
  ) values (
    v_status,
    v_fields ->> 'customer_name',
    v_fields ->> 'customer_phone',
    v_fields ->> 'customer_email',
    (v_fields ->> 'whatsapp_opt_in')::boolean,
    v_fields -> 'address',
    (v_fields ->> 'delivery_method')::public.delivery_method,
    v_fields ->> 'delivery_notes',
    (v_fields ->> 'assembly')::boolean,
    (v_fields ->> 'shipping_cents')::integer,
    (v_fields ->> 'discount_cents')::integer,
    v_fields ->> 'payment_method',
    v_fields ->> 'internal_notes',
    case when v_status = 'pago' then now() end
  )
  returning id into v_id;
  perform private.order_totals(v_id, private.write_order_items(v_id, p_data -> 'items'));
  insert into public.order_events (order_id, status, public_note, internal_note)
  values (v_id, v_status, nullif(btrim(p_data ->> 'publicNote'), ''), nullif(btrim(p_data ->> 'internalNote'), ''));
  return v_id;
end;
$$;

/** Edita os dados do pedido. Os itens só mudam antes do envio. */
create or replace function public.update_order(p_order_id uuid, p_data jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fields jsonb := private.order_fields(p_data);
  v_status public.order_status;
  v_subtotal integer;
begin
  select status, subtotal_cents into v_status, v_subtotal from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;
  update public.orders set
    customer_name = v_fields ->> 'customer_name',
    customer_phone = v_fields ->> 'customer_phone',
    customer_email = v_fields ->> 'customer_email',
    whatsapp_opt_in = (v_fields ->> 'whatsapp_opt_in')::boolean,
    address = v_fields -> 'address',
    delivery_method = (v_fields ->> 'delivery_method')::public.delivery_method,
    delivery_notes = v_fields ->> 'delivery_notes',
    assembly = (v_fields ->> 'assembly')::boolean,
    shipping_cents = (v_fields ->> 'shipping_cents')::integer,
    discount_cents = (v_fields ->> 'discount_cents')::integer,
    payment_method = v_fields ->> 'payment_method',
    internal_notes = v_fields ->> 'internal_notes'
  where id = p_order_id;
  if p_data ? 'items' then
    if v_status not in ('recebido', 'pago', 'em_preparacao') then
      raise exception 'Os itens só podem mudar antes do envio.' using errcode = '22023';
    end if;
    v_subtotal := private.write_order_items(p_order_id, p_data -> 'items');
  end if;
  perform private.order_totals(p_order_id, v_subtotal);
end;
$$;

/**
 * Avança o pedido para a próxima etapa e registra na linha do tempo. Na mesma
 * transação, grava os dados da entrega (transportadora, rastreio, data e janela).
 */
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_public_note text default null,
  p_internal_note text default null,
  p_delivery jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.order_status;
begin
  select status into v_current from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;
  if not private.order_transition_allowed(v_current, p_status) then
    raise exception 'Não dá para passar de "%" para "%".', v_current, p_status using errcode = '22023';
  end if;
  update public.orders set
    status = p_status,
    paid_at = case when p_status = 'pago' then coalesce(paid_at, now()) else paid_at end,
    carrier = case when p_delivery ? 'carrier' then nullif(btrim(p_delivery ->> 'carrier'), '') else carrier end,
    tracking_code = case when p_delivery ? 'trackingCode' then nullif(btrim(p_delivery ->> 'trackingCode'), '') else tracking_code end,
    tracking_url = case when p_delivery ? 'trackingUrl' then nullif(btrim(p_delivery ->> 'trackingUrl'), '') else tracking_url end,
    scheduled_date = case when p_delivery ? 'scheduledDate' then nullif(p_delivery ->> 'scheduledDate', '')::date else scheduled_date end,
    scheduled_window = case when p_delivery ? 'scheduledWindow' then nullif(btrim(p_delivery ->> 'scheduledWindow'), '') else scheduled_window end
  where id = p_order_id;
  insert into public.order_events (order_id, status, public_note, internal_note)
  values (p_order_id, p_status, nullif(btrim(p_public_note), ''), nullif(btrim(p_internal_note), ''));
end;
$$;

revoke all on function public.create_order(jsonb) from public, anon;
revoke all on function public.update_order(uuid, jsonb) from public, anon;
revoke all on function public.set_order_status(uuid, public.order_status, text, text, jsonb) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.update_order(uuid, jsonb) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text, jsonb) to authenticated;
revoke all on function private.order_transition_allowed(public.order_status, public.order_status) from public;
revoke all on function private.write_order_items(uuid, jsonb) from public;
revoke all on function private.order_totals(uuid, integer) from public;
revoke all on function private.order_fields(jsonb) from public;
grant execute on function private.order_transition_allowed(public.order_status, public.order_status) to authenticated;
grant execute on function private.write_order_items(uuid, jsonb) to authenticated;
grant execute on function private.order_totals(uuid, integer) to authenticated;
grant execute on function private.order_fields(jsonb) to authenticated;

-- Acompanhamento pelo cliente --------------------------------------------------

/**
 * O que o cliente vê do próprio pedido (sem observações internas, sem quem
 * registrou, endereço só bairro/cidade/UF). Exige o link secreto do pedido.
 */
create or replace function public.order_tracking(p_code text, p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'customerFirstName', split_part(btrim(o.customer_name), ' ', 1),
    'createdAt', o.created_at,
    'paidAt', o.paid_at,
    'deliveryMethod', o.delivery_method,
    'carrier', o.carrier,
    'trackingCode', o.tracking_code,
    'trackingUrl', o.tracking_url,
    'scheduledDate', o.scheduled_date,
    'scheduledWindow', o.scheduled_window,
    'assembly', o.assembly,
    'place', jsonb_build_object('bairro', o.address ->> 'bairro', 'cidade', o.address ->> 'cidade', 'uf', o.address ->> 'uf'),
    'subtotalCents', o.subtotal_cents,
    'shippingCents', o.shipping_cents,
    'discountCents', o.discount_cents,
    'totalCents', o.total_cents,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name, 'variantName', i.variant_name, 'quantity', i.quantity,
        'unitPriceCents', i.unit_price_cents) order by i.sort_order)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.status, 'note', e.public_note, 'at', e.created_at) order by e.created_at)
      from public.order_events e where e.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where o.code = upper(btrim(p_code)) and o.public_token = p_token;
$$;

/** Número do pedido + celular de quem comprou → o link secreto (para a página "Acompanhar pedido"). */
create or replace function public.order_tracking_token(p_code text, p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.public_token
  from public.orders o
  where o.code = upper(btrim(p_code))
    and o.customer_phone is not null
    and length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) >= 10
    -- Compara os últimos 10 dígitos: funciona com ou sem o 55 (e com ou sem o DDD completo de celular).
    and right(o.customer_phone, 10) = right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 10);
$$;

revoke all on function public.order_tracking(text, uuid) from public;
revoke all on function public.order_tracking_token(text, text) from public;
grant execute on function public.order_tracking(text, uuid) to anon, authenticated;
grant execute on function public.order_tracking_token(text, text) to anon, authenticated;
