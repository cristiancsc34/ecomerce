-- Frete por transportadora (Melhor Envio) com cotação por CEP (AzConfort, 19/11/2026).
--
-- PENDENTE: aplicar no Supabase do projeto só com o ok do dono. O código funciona sem esta migração (sem ela, a
-- loja simplesmente não mostra cotação de transportadora e o frete continua pelas formas cadastradas ou "a combinar").
--
-- 1. Embalagens (caixas) de cada produto, para cotar o frete: products.shipping_packages (lista de caixas com peso em
--    kg e medidas em cm, já embaladas). Uma variação pode ter as próprias caixas (product_variants.shipping_packages;
--    vazio/null = usa as do produto). Sem caixas cadastradas, a loja não cota (frete "a combinar").
-- 2. Cotações da transportadora: public.shipping_carrier_quotes. Quem grava é só o servidor da loja (chave de
--    serviço), na hora de fechar o pedido, depois de cotar de novo na API da transportadora. O visitante não lê nem
--    grava. A cotação vale 30 minutos, para um CEP e uma sacola, e só para um pedido.
-- 3. Nova versão de public.place_site_order: aceita carrierQuoteId (opcional). O banco confere a cotação (existe, não
--    venceu, não foi usada, mesmo CEP e mesmos itens) e o frete do pedido vem dela, nunca do navegador.
--    Chamadas antigas funcionam igual à versão anterior (20261119000100).

-- Caixas: [{"weightKg": 32.5, "lengthCm": 200, "widthCm": 40, "heightCm": 30}, ...] (até 10).
create or replace function private.valid_shipping_packages(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_box jsonb;
  v_key text;
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 10 then
    return false;
  end if;
  for v_box in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(v_box) <> 'object' then
      return false;
    end if;
    if (select count(*) from jsonb_object_keys(v_box)) <> 4 then
      return false;
    end if;
    foreach v_key in array array['weightKg', 'lengthCm', 'widthCm', 'heightCm'] loop
      if jsonb_typeof(v_box -> v_key) is distinct from 'number'
         or (v_box ->> v_key)::numeric <= 0
         or (v_box ->> v_key)::numeric > 1000 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_shipping_packages(jsonb) from public;
-- A regra (check) roda com o papel de quem grava: a equipe pelo painel e o servidor.
grant execute on function private.valid_shipping_packages(jsonb) to authenticated, service_role;

alter table public.products
  add column shipping_packages jsonb not null default '[]'::jsonb
    constraint products_shipping_packages_valid check (private.valid_shipping_packages(shipping_packages));

alter table public.product_variants
  add column shipping_packages jsonb
    constraint product_variants_shipping_packages_valid check (private.valid_shipping_packages(shipping_packages));

comment on column public.products.shipping_packages is
  'Caixas do produto embalado, para cotar o frete: [{weightKg, lengthCm, widthCm, heightCm}] (até 10). Vazio = não cota (a combinar).';
comment on column public.product_variants.shipping_packages is
  'Caixas próprias da variação (ex.: tamanho de colchão). Null ou vazio = usa as do produto.';

-- Medidas de embalagem não são segredo: a vitrine (anon) lê, sempre limitada pelo RLS aos produtos publicados.
grant select (shipping_packages) on public.products to anon;
grant select (shipping_packages) on public.product_variants to anon;

-- Itens da sacola num formato único (mesmo produto e variação somados, em ordem), para comparar a cotação com o pedido.
create or replace function private.normalized_cart_items(p_items jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('productId', s.product_id, 'variantId', s.variant_id, 'quantity', s.quantity)
                            order by s.product_id, s.variant_id nulls first), '[]'::jsonb)
  from (
    select lower(e ->> 'productId') as product_id,
           lower(nullif(e ->> 'variantId', '')) as variant_id,
           sum((e ->> 'quantity')::integer) as quantity
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
    group by 1, 2
  ) s;
$$;
revoke all on function private.normalized_cart_items(jsonb) from public;

create table public.shipping_carrier_quotes (
  id uuid primary key default gen_random_uuid(),
  provider text not null constraint shipping_carrier_quotes_provider check (provider in ('melhor_envio')),
  service_id integer not null constraint shipping_carrier_quotes_service check (service_id > 0),
  service_name text not null constraint shipping_carrier_quotes_service_name check (char_length(service_name) between 1 and 80),
  company_name text not null constraint shipping_carrier_quotes_company check (char_length(company_name) between 1 and 80),
  cep text not null constraint shipping_carrier_quotes_cep check (cep ~ '^[0-9]{8}$'),
  items jsonb not null constraint shipping_carrier_quotes_items check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  price_cents integer not null constraint shipping_carrier_quotes_price check (price_cents >= 0),
  days_min integer constraint shipping_carrier_quotes_days_min check (days_min >= 0),
  days_max integer constraint shipping_carrier_quotes_days_max check (days_max >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  order_id uuid unique references public.orders (id) on delete set null
);

comment on table public.shipping_carrier_quotes is
  'Cotação de transportadora feita pelo servidor da loja ao fechar o pedido (vale 30 min, um CEP, uma sacola, um pedido).';

create index shipping_carrier_quotes_order_idx on public.shipping_carrier_quotes (order_id) where order_id is not null;

-- Só o servidor (service_role, que passa por cima do RLS) grava e lê. Equipe lê para conferir o pedido.
alter table public.shipping_carrier_quotes enable row level security;
revoke all on public.shipping_carrier_quotes from anon, authenticated;
grant select on public.shipping_carrier_quotes to authenticated;
grant select, insert, update on public.shipping_carrier_quotes to service_role;

create policy "Equipe lê as cotações de transportadora"
  on public.shipping_carrier_quotes for select to authenticated
  using (private.is_staff());

create or replace function public.place_site_order(p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_email text;
  v_method text;
  v_addr jsonb;
  v_cep text;
  v_rua text;
  v_numero text;
  v_complemento text;
  v_bairro text;
  v_cidade text;
  v_uf text;
  v_referencia text;
  v_address jsonb := '{}'::jsonb;
  v_notes text;
  v_shipping integer;
  v_items jsonb;
  v_item jsonb;
  v_line record;
  v_product record;
  v_variant_id uuid;
  v_variant_name text;
  v_has_variants boolean;
  v_price integer;
  v_stock integer;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_total bigint;
  v_id uuid;
  v_code text;
  v_token uuid;
  v_option_id text;
  v_option record;
  v_delivery public.delivery_method;
  v_option_name text;
  v_payment text;
  v_event_note text;
  v_quote_id text;
  v_quote record;
  v_quote_uuid uuid;
  v_quote_items jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Envie os dados do pedido.' using errcode = '22023';
  end if;

  -- Cliente ------------------------------------------------------------------
  v_name := private.site_clean_text(p_data ->> 'customerName');
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Informe seu nome (de 2 a 120 letras).' using errcode = '22023';
  end if;

  v_phone := regexp_replace(coalesce(p_data ->> 'customerPhone', ''), '[^0-9]', '', 'g');
  if char_length(v_phone) in (10, 11) then
    v_phone := '55' || v_phone;
  end if;
  if v_phone !~ '^[0-9]{12,15}$' then
    raise exception 'Informe o celular com DDD, ex.: (11) 98765-4321.' using errcode = '22023';
  end if;

  v_email := nullif(private.site_clean_text(p_data ->> 'customerEmail'), '');
  if v_email is not null and (char_length(v_email) > 200 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'E-mail inválido. Confira ou deixe em branco.' using errcode = '22023';
  end if;

  if coalesce(p_data -> 'whatsappOptIn', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'Para fazer o pedido, aceite que a loja fale com você pelo WhatsApp para confirmar o pagamento e a entrega.'
      using errcode = '22023';
  end if;
  if coalesce(p_data -> 'acceptTerms', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'Para fazer o pedido, aceite as condições de compra.' using errcode = '22023';
  end if;

  -- Entrega ------------------------------------------------------------------
  v_method := coalesce(p_data ->> 'deliveryMethod', '');
  if v_method not in ('entrega_propria', 'retirada') then
    raise exception 'Escolha entre entrega e retirada na loja.' using errcode = '22023';
  end if;

  v_delivery := v_method::public.delivery_method;

  -- Pagamento escolhido (Pix, cartão ou boleto). A confirmação continua com a loja até o banco (Blue) ser ligado.
  v_payment := nullif(coalesce(p_data ->> 'paymentMethod', ''), '');
  if v_payment is not null and v_payment not in ('pix', 'cartao', 'boleto') then
    raise exception 'Escolha a forma de pagamento: Pix, cartão ou boleto.' using errcode = '22023';
  end if;

  v_notes := nullif(private.site_clean_text(p_data ->> 'deliveryNotes', true), '');
  if char_length(v_notes) > 1000 then
    raise exception 'Observações da entrega: no máximo 1000 caracteres.' using errcode = '22023';
  end if;

  if v_method = 'entrega_propria' then
    v_addr := case when jsonb_typeof(p_data -> 'address') = 'object' then p_data -> 'address' else '{}'::jsonb end;
    v_cep := regexp_replace(coalesce(v_addr ->> 'cep', ''), '[^0-9]', '', 'g');
    v_rua := private.site_clean_text(v_addr ->> 'rua');
    v_numero := private.site_clean_text(v_addr ->> 'numero');
    v_complemento := private.site_clean_text(v_addr ->> 'complemento');
    v_bairro := private.site_clean_text(v_addr ->> 'bairro');
    v_cidade := private.site_clean_text(v_addr ->> 'cidade');
    v_uf := upper(private.site_clean_text(v_addr ->> 'uf'));
    v_referencia := private.site_clean_text(v_addr ->> 'referencia');
    if v_cep !~ '^[0-9]{8}$' then
      raise exception 'Informe o CEP da entrega (8 números).' using errcode = '22023';
    end if;
    if v_rua = '' then
      raise exception 'Informe a rua da entrega.' using errcode = '22023';
    end if;
    if v_numero = '' then
      raise exception 'Informe o número da entrega (ou "s/n").' using errcode = '22023';
    end if;
    if v_cidade = '' then
      raise exception 'Informe a cidade da entrega.' using errcode = '22023';
    end if;
    if v_uf !~ '^[A-Z]{2}$' then
      raise exception 'Informe a UF da entrega (2 letras, ex.: SP).' using errcode = '22023';
    end if;
    if char_length(v_rua) > 160 or char_length(v_numero) > 20 or char_length(v_complemento) > 80
       or char_length(v_bairro) > 80 or char_length(v_cidade) > 80 or char_length(v_referencia) > 200 then
      raise exception 'Endereço com texto longo demais. Revise os campos.' using errcode = '22023';
    end if;
    v_address := jsonb_strip_nulls(jsonb_build_object(
      'cep', v_cep,
      'rua', v_rua,
      'numero', v_numero,
      'complemento', nullif(v_complemento, ''),
      'bairro', nullif(v_bairro, ''),
      'cidade', v_cidade,
      'uf', v_uf,
      'referencia', nullif(v_referencia, '')
    ));
    v_shipping := null; -- sem forma de entrega escolhida: frete a combinar (nunca inventado)
    -- Forma de entrega escolhida pelo cliente: o banco confere se está ativa e atende o CEP, e o valor vem do
    -- cadastro do dono (vazio = a combinar). O que o navegador mandar de valor é ignorado.
    v_option_id := nullif(coalesce(p_data ->> 'shippingOptionId', ''), '');
    if v_option_id is not null then
      if v_option_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Forma de entrega inválida. Calcule o frete de novo.' using errcode = '22023';
      end if;
      select o.id, o.name, o.method, o.price_cents into v_option
        from public.shipping_options o
        where o.id = v_option_id::uuid and o.active and o.method <> 'retirada'
          and private.cep_in_ranges(v_cep, o.cep_ranges);
      if not found then
        raise exception 'Esta forma de entrega não atende o seu CEP. Calcule o frete de novo ou fale com o atendimento.'
          using errcode = '22023';
      end if;
      v_shipping := v_option.price_cents;
      v_delivery := v_option.method;
      v_option_name := v_option.name;
    end if;
    -- Cotação de transportadora (Melhor Envio) gravada pelo servidor da loja ao fechar o pedido. O banco confere
    -- tudo; o valor vem da cotação. Os itens são conferidos mais abaixo, depois de validados.
    v_quote_id := nullif(coalesce(p_data ->> 'carrierQuoteId', ''), '');
    if v_quote_id is not null then
      if v_option_id is not null then
        raise exception 'Escolha só uma forma de entrega.' using errcode = '22023';
      end if;
      if v_quote_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Frete da transportadora inválido. Calcule o frete de novo.' using errcode = '22023';
      end if;
      select q.* into v_quote
        from public.shipping_carrier_quotes q
        where q.id = v_quote_id::uuid and q.order_id is null and q.expires_at > now() and q.cep = v_cep
        for update;
      if not found then
        raise exception 'O frete da transportadora venceu ou não vale para este CEP. Calcule o frete de novo.'
          using errcode = '22023';
      end if;
      v_quote_uuid := v_quote.id;
      v_quote_items := v_quote.items;
      v_shipping := v_quote.price_cents;
      v_delivery := 'transportadora';
      v_option_name := v_quote.company_name || ' ' || v_quote.service_name
        || case
             when v_quote.days_max is null then ''
             when v_quote.days_min is null or v_quote.days_min = v_quote.days_max
               then ' (prazo da transportadora: até ' || v_quote.days_max || ' dia(s) útil(eis) após a postagem)'
             else ' (prazo da transportadora: de ' || v_quote.days_min || ' a ' || v_quote.days_max || ' dias úteis após a postagem)'
           end;
    end if;
  else
    v_address := '{}'::jsonb;
    v_shipping := 0;
  end if;

  -- Itens: só ids e quantidades valem; preço e nome vêm do catálogo -----------
  v_items := p_data -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'A sacola está vazia. Escolha pelo menos um produto.' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 20 then
    raise exception 'A sacola aceita até 20 itens diferentes por pedido.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'productId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (jsonb_typeof(v_item -> 'variantId') not in ('null')
           and coalesce(v_item ->> 'variantId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'Produto indisponível no momento. Atualize a sacola e tente de novo.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or (v_item ->> 'quantity') !~ '^[0-9]+$'
       or (v_item ->> 'quantity')::numeric not between 1 and 10 then
      raise exception 'Quantidade inválida: escolha de 1 a 10 unidades por item.' using errcode = '22023';
    end if;
  end loop;

  -- A cotação da transportadora foi feita para exatamente estes itens.
  if v_quote_uuid is not null and private.normalized_cart_items(v_quote_items) <> private.normalized_cart_items(v_items) then
    raise exception 'A sacola mudou depois do cálculo do frete. Calcule o frete de novo.' using errcode = '22023';
  end if;

  -- Mesmo produto e mesma variação em duas linhas: soma as quantidades.
  for v_line in
    select (e ->> 'productId')::uuid as product_id,
           (e ->> 'variantId')::uuid as variant_id,
           sum((e ->> 'quantity')::integer)::integer as quantity,
           min(n) as position
    from jsonb_array_elements(v_items) with ordinality as t(e, n)
    group by 1, 2
    order by min(n)
  loop
    if v_line.quantity > 10 then
      raise exception 'Quantidade inválida: escolha de 1 a 10 unidades por item.' using errcode = '22023';
    end if;

    select p.id, p.name, p.price_cents, p.stock_quantity into v_product
      from public.products p
      where p.id = v_line.product_id and p.status = 'published' and not p.is_demo;
    if not found then
      raise exception 'Produto indisponível no momento. Atualize a sacola e tente de novo.' using errcode = '22023';
    end if;

    v_has_variants := exists (select 1 from public.product_variants pv where pv.product_id = v_product.id);
    if v_line.variant_id is not null then
      select pv.id, pv.name, pv.price_cents, coalesce(pv.stock_quantity, v_product.stock_quantity)
        into v_variant_id, v_variant_name, v_price, v_stock
        from public.product_variants pv
        where pv.id = v_line.variant_id and pv.product_id = v_product.id;
      if not found then
        raise exception 'Variação não encontrada para “%”. Escolha o tamanho de novo.', v_product.name using errcode = '22023';
      end if;
    else
      if v_has_variants then
        raise exception 'Escolha o tamanho (ou a opção) de “%”.', v_product.name using errcode = '22023';
      end if;
      v_variant_id := null;
      v_variant_name := null;
      v_price := v_product.price_cents;
      v_stock := v_product.stock_quantity;
    end if;

    if v_price is null then
      raise exception 'Produto sem preço no momento: “%”. Fale com o atendimento.', v_product.name using errcode = '22023';
    end if;
    if v_stock is not null and v_stock = 0 then
      raise exception 'Produto esgotado: “%”. Remova da sacola para continuar.', v_product.name using errcode = '22023';
    end if;
    if v_stock is not null and v_line.quantity > v_stock then
      raise exception 'Estoque insuficiente: temos % unidade(s) de “%”.', v_stock, v_product.name using errcode = '22023';
    end if;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', v_variant_id,
      'name', v_product.name,
      'variant_name', v_variant_name,
      'price', v_price,
      'quantity', v_line.quantity
    );
    v_subtotal := v_subtotal + v_price::bigint * v_line.quantity;
  end loop;

  v_total := v_subtotal + coalesce(v_shipping, 0);
  if v_total > 2147483647 then
    raise exception 'Valor do pedido acima do limite. Fale com o atendimento.' using errcode = '22023';
  end if;

  -- Limite contra pedidos em massa (a função também pode ser chamada direto pela API pública).
  -- A trava em fila deixa a contagem exata mesmo com pedidos chegando ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtext('public.place_site_order'));
  if (select count(*) from public.orders o
      where o.source = 'site' and o.customer_phone = v_phone and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Já recebemos vários pedidos deste celular na última hora. Aguarde um pouco ou fale com o atendimento.'
      using errcode = '22023';
  end if;
  if (select count(*) from public.orders o
      where o.source = 'site' and o.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitos pedidos ao mesmo tempo agora. Tente de novo em alguns minutos ou fale com o atendimento.'
      using errcode = '22023';
  end if;

  -- Grava (tudo validado antes, para não gastar números de pedido à toa) -------
  insert into public.orders (
    status, source, customer_name, customer_phone, customer_email, whatsapp_opt_in, address, delivery_method,
    delivery_notes, assembly, subtotal_cents, shipping_cents, discount_cents, total_cents, payment_method, created_by
  ) values (
    'recebido', 'site', v_name, v_phone, v_email, true, v_address, v_delivery,
    v_notes, false, v_subtotal::integer, v_shipping, 0, v_total::integer, v_payment, null
  )
  returning id, code, public_token into v_id, v_code, v_token;

  insert into public.order_items (order_id, product_id, variant_id, name, variant_name, unit_price_cents, quantity, sort_order)
  select v_id,
         (l ->> 'product_id')::uuid,
         (l ->> 'variant_id')::uuid,
         l ->> 'name',
         l ->> 'variant_name',
         (l ->> 'price')::integer,
         (l ->> 'quantity')::integer,
         (n - 1)::integer
  from jsonb_array_elements(v_lines) with ordinality as t(l, n);

  if v_quote_uuid is not null then
    update public.shipping_carrier_quotes set order_id = v_id where id = v_quote_uuid;
  end if;

  v_event_note := 'Pedido feito pelo site.'
    || case when v_option_name is not null then ' Entrega: ' || v_option_name || '.' else '' end
    || ' Vamos confirmar o pagamento e a entrega com você pelo WhatsApp.';
  insert into public.order_events (order_id, status, public_note, created_by)
  values (v_id, 'recebido', v_event_note, null);

  return jsonb_build_object('code', v_code, 'token', v_token);
end;
$$;

comment on function public.place_site_order(jsonb) is
  'Pedido feito pelo site: preço do catálogo, status recebido, frete da forma de entrega escolhida (conferida pelo CEP; vazio = a combinar), da cotação de transportadora gravada pelo servidor (carrierQuoteId) ou 0 (retirada), forma de pagamento (pix, cartao, boleto). Devolve {code, token}.';

revoke all on function public.place_site_order(jsonb) from public;
grant execute on function public.place_site_order(jsonb) to anon, authenticated;
