-- Pedido feito pelo site (checkout sem pagamento online). Ver docs/LOGISTICA.md.
--
-- O cliente escolhe os produtos, informa os dados e a forma de entrega; o pedido entra como "recebido" e a loja
-- confirma o pagamento (Pix ou link) e a entrega pelo WhatsApp.
--
-- Regras no banco (não só na tela):
--   * o preço vem SEMPRE do catálogo (variação ou produto); o que o navegador mandar de preço é ignorado;
--   * só produto publicado, que não é de demonstração e com preço; variação precisa ser do produto;
--   * de 1 a 10 unidades por item e até 20 itens; item repetido (mesmo produto e variação) é somado;
--   * entrega da loja exige endereço; frete fica vazio ("a combinar"), nunca inventado; retirada = frete 0;
--   * o cliente aceita ser contatado pelo WhatsApp (é por lá que a venda é confirmada);
--   * a função roda com os direitos do dono (security definer): o visitante continua sem ler a tabela de pedidos e
--     só acompanha o próprio pedido pelo link secreto devolvido aqui;
--   * a função pode ser chamada direto pela API pública (chave anon), sem passar pelo limite por IP do site; por isso
--     o próprio banco limita: até 5 pedidos por celular por hora e até 30 pedidos do site a cada 10 minutos;
--   * textos do cliente perdem caracteres de controle e invisíveis (quebra de linha só nas observações).

-- Contagem rápida dos pedidos recentes do site (limite contra pedidos em massa).
create index if not exists orders_source_created_idx on public.orders (source, created_at desc);

-- Tira caracteres de controle e invisíveis (inclusive os que invertem a direção do texto) e espaços nas pontas.
-- p_multiline = true mantém as quebras de linha (observações da entrega).
create or replace function private.site_clean_text(p_value text, p_multiline boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        case when p_multiline then regexp_replace(coalesce(p_value, ''), '\r\n?', E'\n', 'g') else coalesce(p_value, '') end,
        '[​-‏‪-‮⁠-⁩﻿]', '', 'g'),
      case when p_multiline then '[\u0001-\u0009\u000B-\u001F\u007F-\u009F]+' else '[\u0001-\u001F\u007F-\u009F]+' end,
      ' ', 'g'),
    E' \n');
$$;

revoke all on function private.site_clean_text(text, boolean) from public;

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
    v_shipping := null; -- frete a combinar pelo WhatsApp (nunca inventado)
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
    delivery_notes, assembly, subtotal_cents, shipping_cents, discount_cents, total_cents, created_by
  ) values (
    'recebido', 'site', v_name, v_phone, v_email, true, v_address, v_method::public.delivery_method,
    v_notes, false, v_subtotal::integer, v_shipping, 0, v_total::integer, null
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

  insert into public.order_events (order_id, status, public_note, created_by)
  values (v_id, 'recebido', 'Pedido feito pelo site. Vamos confirmar o pagamento e a entrega com você pelo WhatsApp.', null);

  return jsonb_build_object('code', v_code, 'token', v_token);
end;
$$;

comment on function public.place_site_order(jsonb) is
  'Pedido feito pelo site: preço do catálogo, status recebido, frete a combinar (entrega) ou 0 (retirada). Devolve {code, token}.';

revoke all on function public.place_site_order(jsonb) from public;
grant execute on function public.place_site_order(jsonb) to anon, authenticated;
