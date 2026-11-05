-- =============================================================================
-- Cores no Estúdio (2 de 2)
--
-- Uma cor nova de um produto, feita pelo GPT a partir das fotos de catálogo já
-- aprovadas:
-- 1. a equipe pede: ai_jobs com kind 'color_variant' e, em params, o nome da
--    cor, a cor (#RRGGBB) e as fotos de catálogo de origem;
-- 2. o processador gera as fotos na cor nova: product_media com ai_generated,
--    is_illustrative e color_job_id (a tarefa que as gerou), sem aprovação.
--    Como toda imagem de IA sem aprovação, elas não aparecem na loja;
-- 3. uma pessoa confere foto por foto e publica: publish_color_variant cria a
--    variação (na primeira cor, também a da cor atual do produto), aprova as
--    fotos escolhidas e liga as fotos à variação, tudo de uma vez.
--
-- Não existe variação oculta: a cor só passa a existir (e a aparecer no
-- seletor "Cor" da loja) ao publicar, já com as fotos aprovadas.
--
-- Também: apagar uma cor apaga as fotos de cor dela, e duplicar um produto não
-- leva mais fotos de IA sem conferência para a cópia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Parâmetros da tarefa (o painel grava ao pedir; o processador lê).
-- -----------------------------------------------------------------------------
alter table public.ai_jobs
  add column params jsonb not null default '{}'::jsonb
    constraint ai_jobs_params_object check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 4096);

-- coalesce(..., false): faltando um campo, a regra dá "falso" (e não "desconhecido", que o check aceitaria).
alter table public.ai_jobs
  add constraint ai_jobs_color_params check (
    kind <> 'color_variant' or coalesce(
      (params ->> 'colorHex') ~ '^#[0-9A-Fa-f]{6}$'
      and length(btrim(params ->> 'colorName')) between 1 and 60
      and jsonb_typeof(params -> 'sourceMediaIds') = 'array'
      and jsonb_array_length(
        case when jsonb_typeof(params -> 'sourceMediaIds') = 'array' then params -> 'sourceMediaIds' else '[]'::jsonb end
      ) between 1 and 8,
      false
    )
  );

comment on column public.ai_jobs.params is
  'Pedido feito pelo painel. color_variant: {colorName, colorHex, sourceMediaIds}.';

grant insert (params) on public.ai_jobs to authenticated;

-- -----------------------------------------------------------------------------
-- 2) Foto de cor: de qual tarefa ela veio.
--    Sem chave estrangeira de propósito: a foto continua marcada como foto de
--    cor mesmo que a tarefa seja apagada (senão viraria "foto de catálogo").
--    A loja não lê esta coluna (sem grant para anon).
-- -----------------------------------------------------------------------------
alter table public.product_media
  add column color_job_id uuid;

create index product_media_color_job_idx on public.product_media (color_job_id) where color_job_id is not null;

-- Foto de cor é imagem de IA, ilustrativa e nunca a principal.
alter table public.product_media
  add constraint product_media_color_photo check (
    color_job_id is null or (media_type = 'image' and ai_generated and is_illustrative and not is_primary)
  );

comment on column public.product_media.color_job_id is
  'Foto feita pelo passo Cores do Estúdio (tarefa color_variant). Ilustrativa; a variação fica em variant_id.';

-- -----------------------------------------------------------------------------
-- 3) Apagar uma cor apaga as fotos de cor dela.
--    Sem isto, ao tirar a cor em "Preço e estoque" (save_product apaga as
--    variações que não vêm na lista), as fotos voltariam a ser do produto
--    (variant_id é "on delete set null") e apareceriam como fotos da cor atual.
--    Os arquivos no Storage ficam; o painel limpa os que ficarem sem uso.
-- -----------------------------------------------------------------------------
create or replace function private.variant_delete_color_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.product_media where variant_id = old.id and color_job_id is not null;
  return old;
end;
$$;
revoke all on function private.variant_delete_color_media() from public;

create trigger product_variants_delete_color_media
  before delete on public.product_variants
  for each row execute function private.variant_delete_color_media();

-- -----------------------------------------------------------------------------
-- 4) Publicar a cor (com a sessão de quem confere: valem RLS, área e papel).
--    Nome comparado como no link ?cor= (sem acento, maiúsculas nem espaços):
--    "Café" e "cafe" são a mesma cor.
-- -----------------------------------------------------------------------------
create or replace function private.color_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_name, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]+', '-', 'g'), '-')
$$;
revoke all on function private.color_key(text) from public;
grant execute on function private.color_key(text) to authenticated;

-- -----------------------------------------------------------------------------
--    p_color:    {"priceCents": 129990, "stockQuantity": 3 | null}
--    p_original: só na primeira cor, a cor atual do produto (das fotos de
--                catálogo): {"name": "Azul", "colorHex": "#2F3E62",
--                "priceCents": 129990, "stockQuantity": null}
--    Devolve o id da variação nova.
-- -----------------------------------------------------------------------------
create or replace function public.publish_color_variant(
  p_job_id uuid,
  p_media_ids uuid[],
  p_color jsonb,
  p_original jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product uuid;
  v_params jsonb;
  v_name text;
  v_wanted integer;
  v_found integer;
  v_has_colors boolean;
  v_next integer;
  v_variant uuid;
  v_updated integer;
begin
  select j.product_id, j.params into v_product, v_params
    from public.ai_jobs j
   where j.id = p_job_id and j.kind = 'color_variant' and j.status = 'succeeded';
  if v_product is null then
    raise exception 'Tarefa de cor não encontrada ou ainda não terminou.' using errcode = 'P0002';
  end if;
  if not private.can_edit_product(v_product) then
    raise exception 'Sem permissão para alterar este produto.' using errcode = '42501';
  end if;
  -- Uma publicação de cor por vez em cada produto (dois cliques ou duas abas).
  perform 1 from public.products where id = v_product for update;

  select count(distinct x) into v_wanted from unnest(p_media_ids) x;
  if coalesce(v_wanted, 0) = 0 then
    raise exception 'Escolha ao menos uma foto para publicar a cor.' using errcode = '22023';
  end if;
  select count(*) into v_found
    from public.product_media m
   where m.id = any (p_media_ids)
     and m.product_id = v_product
     and m.color_job_id = p_job_id
     and m.ai_generated and m.approved_at is null and m.variant_id is null;
  if v_found <> v_wanted then
    raise exception 'Alguma foto escolhida não é desta cor ou já foi publicada.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.product_variants v
     where v.product_id = v_product and not (v.attributes ? 'colorHex')
  ) then
    raise exception 'Este produto tem variações sem cor (por exemplo, tamanhos). Cores e tamanhos no mesmo produto ainda não são possíveis.'
      using errcode = '23514';
  end if;

  v_has_colors := exists (select 1 from public.product_variants v where v.product_id = v_product);
  if not v_has_colors then
    if p_original is null or length(btrim(coalesce(p_original ->> 'name', ''))) = 0 then
      raise exception 'Na primeira cor, informe também a cor atual do produto (nome, cor e preço).' using errcode = '22023';
    end if;
    if coalesce(p_original ->> 'colorHex', '') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'A cor atual precisa estar no formato #RRGGBB.' using errcode = '22023';
    end if;
    insert into public.product_variants (product_id, name, price_cents, stock_quantity, attributes, sort_order)
    values (
      v_product,
      btrim(p_original ->> 'name'),
      (p_original ->> 'priceCents')::integer,
      (p_original ->> 'stockQuantity')::integer,
      jsonb_build_object('colorHex', upper(p_original ->> 'colorHex')),
      0
    );
  elsif p_original is not null then
    raise exception 'A cor atual do produto já está cadastrada.' using errcode = '22023';
  end if;

  v_name := btrim(v_params ->> 'colorName');
  if exists (
    select 1 from public.product_variants v
     where v.product_id = v_product and private.color_key(v.name) = private.color_key(v_name)
  ) then
    raise exception 'Este produto já tem uma cor com esse nome.' using errcode = '23514';
  end if;

  select coalesce(max(v.sort_order), 0) + 1 into v_next from public.product_variants v where v.product_id = v_product;
  insert into public.product_variants (product_id, name, price_cents, stock_quantity, attributes, sort_order)
  values (
    v_product,
    v_name,
    (p_color ->> 'priceCents')::integer,
    (p_color ->> 'stockQuantity')::integer,
    jsonb_build_object('colorHex', upper(v_params ->> 'colorHex')),
    v_next
  )
  returning id into v_variant;

  -- Aprovar com a sessão: o banco grava quem aprovou e quando, e audita (media.ai_approved).
  update public.product_media
     set variant_id = v_variant, approved_at = now()
   where id = any (p_media_ids)
     and product_id = v_product
     and color_job_id = p_job_id
     and approved_at is null
     and variant_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> v_wanted then
    raise exception 'Alguma foto escolhida não é desta cor ou já foi publicada.' using errcode = '22023';
  end if;

  -- O formulário "Preço e estoque" recarrega as variações quando o produto muda.
  update public.products set updated_at = now() where id = v_product;

  return v_variant;
end;
$$;

revoke all on function public.publish_color_variant(uuid, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.publish_color_variant(uuid, uuid[], jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Duplicar produto, revisto:
--    - as fotos de IA ainda sem conferência NÃO vão para a cópia (antes iam
--      como fotos comuns e apareceriam na loja sem conferência);
--    - as fotos de IA já aprovadas continuam marcadas como IA e aprovadas
--      (aprovação registrada em nome de quem duplicou);
--    - cada foto ou modelo de uma cor segue a cor correspondente da cópia;
--    - o modelo 3D leva o arquivo do iPhone (.usdz) e o tamanho real conferido.
-- -----------------------------------------------------------------------------
create or replace function public.duplicate_product(p_product_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new uuid;
  v_suffix text := substr(md5(gen_random_uuid()::text), 1, 6);
  v_variant record;
  v_variant_map jsonb := '{}'::jsonb;
  v_new_variant uuid;
  v_media record;
  v_new_media uuid;
  v_ai_primary uuid;
begin
  insert into public.products (
    name, slug, short_description, description, category_id, status, is_demo,
    price_cents, compare_at_price_cents, sku, stock_quantity, dimensions, attributes,
    faq, seo_title, seo_description
  )
  select
    left(name || ' (cópia)', 120),
    rtrim(left(slug, 67), '-') || '-copia-' || v_suffix,
    short_description, description, category_id, 'draft', is_demo,
    price_cents, compare_at_price_cents, null, stock_quantity, dimensions, attributes,
    faq, seo_title, seo_description
  from public.products
  where id = p_product_id
  returning id into v_new;

  if v_new is null then
    raise exception 'Produto não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;

  for v_variant in
    select * from public.product_variants where product_id = p_product_id order by sort_order, created_at
  loop
    insert into public.product_variants (product_id, name, sku, price_cents, stock_quantity, attributes, sort_order)
    values (v_new, v_variant.name, null, v_variant.price_cents, v_variant.stock_quantity, v_variant.attributes, v_variant.sort_order)
    returning id into v_new_variant;
    v_variant_map := v_variant_map || jsonb_build_object(v_variant.id::text, v_new_variant);
  end loop;

  for v_media in
    select * from public.product_media
     where product_id = p_product_id and not (ai_generated and approved_at is null)
     order by sort_order, created_at
  loop
    insert into public.product_media (
      product_id, storage_path, media_type, alt_text, sort_order, is_primary,
      is_illustrative, width, height, mime_type, size_bytes, ai_generated,
      variant_id, color_job_id, usdz_storage_path, real_scale, bounds_cm
    )
    values (
      v_new, v_media.storage_path, v_media.media_type, v_media.alt_text, v_media.sort_order,
      -- Foto de IA só pode ser a principal depois de aprovada (abaixo).
      v_media.is_primary and not v_media.ai_generated,
      v_media.is_illustrative, v_media.width, v_media.height, v_media.mime_type, v_media.size_bytes,
      v_media.ai_generated,
      case when v_media.variant_id is null then null else (v_variant_map ->> v_media.variant_id::text)::uuid end,
      v_media.color_job_id, v_media.usdz_storage_path, v_media.real_scale, v_media.bounds_cm
    )
    returning id into v_new_media;

    if v_media.ai_generated then
      update public.product_media set approved_at = now() where id = v_new_media;
      if v_media.is_primary then
        v_ai_primary := v_new_media;
      end if;
    end if;
  end loop;

  if v_ai_primary is not null then
    update public.product_media set is_primary = true where id = v_ai_primary;
  end if;

  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) save_product (a mesma de 20261103000500_variantes_cor.sql) com guarda de
--    versão: o painel manda expectedUpdatedAt (a versão que ele mostra). Se o
--    produto mudou depois disso, salvar é recusado em vez de apagar as cores
--    publicadas pelo Estúdio (e, pelo gatilho acima, as fotos delas).
-- -----------------------------------------------------------------------------
create or replace function public.save_product(p_product_id uuid, p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_variant jsonb;
  v_position integer := 0;
  v_keep uuid[];
  v_current timestamptz;
begin
  -- Formulário velho (outra aba, outra pessoa, ou antes de uma cor publicada no
  -- Estúdio): salvar apagaria as variações que ele não conhece. Recusa e pede
  -- para recarregar. Sem expectedUpdatedAt (chamadas antigas), salva como antes.
  if p_product_id is not null and nullif(p_data ->> 'expectedUpdatedAt', '') is not null then
    select p.updated_at into v_current from public.products p where p.id = p_product_id;
    if found and date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', (p_data ->> 'expectedUpdatedAt')::timestamptz) then
      raise exception 'O produto mudou desde que você abriu esta página (por exemplo, uma cor publicada no Estúdio). Recarregue a página para não perder nada.'
        using errcode = '22023';
    end if;
  end if;

  if p_product_id is null then
    insert into public.products (
      name, slug, short_description, description, category_id, price_cents,
      compare_at_price_cents, sku, stock_quantity, dimensions, attributes, faq,
      seo_title, seo_description
    ) values (
      p_data ->> 'name',
      p_data ->> 'slug',
      p_data ->> 'shortDescription',
      p_data ->> 'description',
      (p_data ->> 'categoryId')::uuid,
      (p_data ->> 'priceCents')::integer,
      (p_data ->> 'compareAtPriceCents')::integer,
      p_data ->> 'sku',
      (p_data ->> 'stockQuantity')::integer,
      coalesce(p_data -> 'dimensions', '{}'::jsonb),
      coalesce(p_data -> 'attributes', '{}'::jsonb),
      coalesce(p_data -> 'faq', '[]'::jsonb),
      p_data ->> 'seoTitle',
      p_data ->> 'seoDescription'
    )
    returning id into v_id;
  else
    update public.products set
      name = p_data ->> 'name',
      slug = p_data ->> 'slug',
      short_description = p_data ->> 'shortDescription',
      description = p_data ->> 'description',
      category_id = (p_data ->> 'categoryId')::uuid,
      price_cents = (p_data ->> 'priceCents')::integer,
      compare_at_price_cents = (p_data ->> 'compareAtPriceCents')::integer,
      sku = p_data ->> 'sku',
      stock_quantity = (p_data ->> 'stockQuantity')::integer,
      dimensions = coalesce(p_data -> 'dimensions', '{}'::jsonb),
      attributes = coalesce(p_data -> 'attributes', '{}'::jsonb),
      faq = coalesce(p_data -> 'faq', '[]'::jsonb),
      seo_title = p_data ->> 'seoTitle',
      seo_description = p_data ->> 'seoDescription'
    where id = p_product_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Produto não encontrado ou sem permissão.' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(array_agg((x ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(coalesce(p_data -> 'variants', '[]'::jsonb)) as x
    where x ? 'id';

  delete from public.product_variants
    where product_id = v_id and not (id = any (v_keep));

  for v_variant in select * from jsonb_array_elements(coalesce(p_data -> 'variants', '[]'::jsonb))
  loop
    if v_variant ? 'id' then
      update public.product_variants set
        name = v_variant ->> 'name',
        sku = v_variant ->> 'sku',
        price_cents = (v_variant ->> 'priceCents')::integer,
        stock_quantity = (v_variant ->> 'stockQuantity')::integer,
        attributes = jsonb_strip_nulls(jsonb_build_object(
          'size', v_variant -> 'size',
          'widthCm', v_variant -> 'widthCm',
          'lengthCm', v_variant -> 'lengthCm',
          'colorHex', v_variant -> 'colorHex')),
        sort_order = v_position
      where id = (v_variant ->> 'id')::uuid and product_id = v_id;
      if not found then
        raise exception 'Variação não pertence ao produto.' using errcode = 'P0002';
      end if;
    else
      insert into public.product_variants (product_id, name, sku, price_cents, stock_quantity, attributes, sort_order)
      values (
        v_id,
        v_variant ->> 'name',
        v_variant ->> 'sku',
        (v_variant ->> 'priceCents')::integer,
        (v_variant ->> 'stockQuantity')::integer,
        jsonb_strip_nulls(jsonb_build_object(
          'size', v_variant -> 'size',
          'widthCm', v_variant -> 'widthCm',
          'lengthCm', v_variant -> 'lengthCm',
          'colorHex', v_variant -> 'colorHex')),
        v_position
      );
    end if;
    v_position := v_position + 1;
  end loop;

  return v_id;
end;
$$;
