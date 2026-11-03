-- =============================================================================
-- Variantes de cor ou tecido.
--
-- Cada variação (product_variants) pode ter uma cor (attributes.colorHex, ex.:
-- "#6B4A35") e mídias próprias: fotos e, se existir, um modelo 3D próprio
-- (product_media.variant_id). Sem mídia própria, a loja usa as do produto e o
-- visualizador 3D troca a cor do material principal.
--
-- Enquanto nenhum produto tiver variação com cor, a loja não mostra o seletor.
--
-- PENDENTE: aplicar no Supabase do projeto ANTES de publicar o código que lê
-- product_media.variant_id.
-- =============================================================================

alter table public.product_media
  add column variant_id uuid references public.product_variants (id) on delete set null;

create index product_media_variant_idx on public.product_media (variant_id) where variant_id is not null;

-- A mídia de uma variação é do mesmo produto.
create or replace function private.media_variant_same_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.variant_id is not null and not exists (
    select 1 from public.product_variants v where v.id = new.variant_id and v.product_id = new.product_id
  ) then
    raise exception 'A variação não pertence a este produto.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.media_variant_same_product() from public;

create trigger product_media_variant_same_product
  before insert or update of variant_id, product_id on public.product_media
  for each row execute function private.media_variant_same_product();

grant select (variant_id) on public.product_media to anon;

-- Cor no formato #RRGGBB (ou nenhuma).
alter table public.product_variants
  add constraint product_variants_color_hex check (
    not (attributes ? 'colorHex') or (attributes ->> 'colorHex') ~ '^#[0-9A-Fa-f]{6}$'
  );

-- O painel passa a salvar a cor da variação (antes, salvar apagava qualquer
-- atributo além de tamanho e medidas). Mesma função, com 'colorHex'.
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
begin
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
