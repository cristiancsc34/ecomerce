-- =============================================================================
-- Cuxões — catálogo, mídia, equipe administrativa e auditoria
--
-- Princípios:
--   * RLS ligado em todas as tabelas expostas, com políticas explícitas.
--   * O público (anon) só enxerga produtos PUBLICADOS e que NÃO são demo.
--   * Produto de demonstração nunca pode ser publicado (constraint).
--   * Publicar exige preço, foto principal e textos alternativos (trigger).
--   * Só administradores publicam, arquivam ou alteram produtos publicados;
--     editores trabalham em rascunho/revisão (trigger + políticas).
--   * Equipe não se cadastra pela API: admin_users não tem política de escrita.
--   * Alterações importantes geram trilha em audit_events (triggers).
-- =============================================================================

-- Funções auxiliares ficam num schema que a API (PostgREST) não expõe.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.product_status as enum ('draft', 'review', 'published', 'archived');
create type public.media_type as enum ('image', 'video', 'model_3d');
create type public.staff_role as enum ('admin', 'editor');

-- -----------------------------------------------------------------------------
-- Equipe administrativa
-- -----------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null default 'editor',
  created_at timestamptz not null default now()
);
comment on table public.admin_users is
  'Quem pode usar o painel. Sem cadastro público: linhas são criadas só com a service role (scripts/create-admin.mjs) ou pelo SQL editor.';

alter table public.admin_users enable row level security;

create or replace function private.staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.admin_users where user_id = (select auth.uid());
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function private.staff_role() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.is_admin() from public;
grant execute on function private.staff_role() to anon, authenticated;
grant execute on function private.is_staff() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

create policy "Equipe lê o próprio vínculo; admin lê todos"
  on public.admin_users for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Categorias
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null constraint categories_name_length check (length(btrim(name)) between 1 and 60),
  description text constraint categories_description_length check (length(description) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Todos leem categorias"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "Equipe cria categorias"
  on public.categories for insert
  to authenticated
  with check ((select private.is_staff()));

create policy "Equipe edita categorias"
  on public.categories for update
  to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "Admin remove categorias"
  on public.categories for delete
  to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint products_name_length check (length(btrim(name)) between 1 and 120),
  slug text not null unique
    constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  short_description text constraint products_short_description_length check (length(short_description) <= 240),
  description text constraint products_description_length check (length(description) <= 8000),
  category_id uuid references public.categories (id) on delete restrict,
  status public.product_status not null default 'draft',
  is_demo boolean not null default false,
  price_cents integer constraint products_price_non_negative check (price_cents >= 0),
  compare_at_price_cents integer,
  currency text not null default 'BRL' constraint products_currency_brl check (currency = 'BRL'),
  sku text unique constraint products_sku_length check (length(sku) between 1 and 64),
  stock_quantity integer constraint products_stock_non_negative check (stock_quantity >= 0),
  dimensions jsonb not null default '{}'::jsonb constraint products_dimensions_object check (jsonb_typeof(dimensions) = 'object'),
  attributes jsonb not null default '{}'::jsonb constraint products_attributes_object check (jsonb_typeof(attributes) = 'object'),
  faq jsonb not null default '[]'::jsonb constraint products_faq_array check (jsonb_typeof(faq) = 'array'),
  seo_title text constraint products_seo_title_length check (length(seo_title) <= 70),
  seo_description text constraint products_seo_description_length check (length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,

  -- "Preço de" só quando existe preço atual menor (nunca desconto fictício sem base).
  constraint products_compare_at_gt_price check (
    compare_at_price_cents is null or (price_cents is not null and compare_at_price_cents > price_cents)
  ),
  -- Dados de demonstração nunca vão ao ar por engano.
  constraint products_demo_never_published check (not (is_demo and status = 'published')),
  constraint products_published_requires_category check (status <> 'published' or category_id is not null),
  constraint products_published_requires_description check (
    status <> 'published' or coalesce(length(btrim(description)), 0) > 0
  )
);

create index products_status_idx on public.products (status) where status = 'published';
create index products_category_idx on public.products (category_id);

comment on column public.products.is_demo is
  'Produto de demonstração (placeholder). A constraint products_demo_never_published impede a publicação.';
comment on column public.products.price_cents is 'Preço em centavos (inteiro). Nunca usar float.';

alter table public.products enable row level security;

-- -----------------------------------------------------------------------------
-- Variações (tamanhos)
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null constraint product_variants_name_length check (length(btrim(name)) between 1 and 120),
  sku text unique constraint product_variants_sku_length check (length(sku) between 1 and 64),
  price_cents integer not null constraint product_variants_price_non_negative check (price_cents >= 0),
  stock_quantity integer constraint product_variants_stock_non_negative check (stock_quantity >= 0),
  attributes jsonb not null default '{}'::jsonb constraint product_variants_attributes_object check (jsonb_typeof(attributes) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_variants_product_idx on public.product_variants (product_id, sort_order);

alter table public.product_variants enable row level security;

-- -----------------------------------------------------------------------------
-- Mídia (fotos, vídeos, modelos 3D)
-- -----------------------------------------------------------------------------
create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null constraint product_media_path_length check (length(storage_path) between 1 and 300),
  media_type public.media_type not null,
  alt_text text not null default '' constraint product_media_alt_length check (length(alt_text) <= 300),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  is_illustrative boolean not null default false,
  width integer constraint product_media_width_positive check (width > 0),
  height integer constraint product_media_height_positive check (height > 0),
  mime_type text,
  size_bytes integer constraint product_media_size_positive check (size_bytes > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint product_media_primary_is_image check (not is_primary or media_type = 'image')
);

create unique index product_media_one_primary on public.product_media (product_id) where is_primary;
create index product_media_product_idx on public.product_media (product_id, sort_order);
create index product_media_path_idx on public.product_media (storage_path);

alter table public.product_media enable row level security;

-- -----------------------------------------------------------------------------
-- Trilha de auditoria
-- -----------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);

alter table public.audit_events enable row level security;

create policy "Equipe lê a auditoria"
  on public.audit_events for select
  to authenticated
  using ((select private.is_staff()));
-- Sem políticas de escrita: só os triggers (security definer) inserem.

create or replace function private.audit(p_action text, p_entity_type text, p_entity_id uuid, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function private.audit(text, text, uuid, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Regras de escrita em produtos
-- -----------------------------------------------------------------------------
create or replace function private.can_edit_product(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_admin())
      or exists (
        select 1 from public.products p
        where p.id = p_product_id and p.status in ('draft', 'review')
      );
$$;
revoke all on function private.can_edit_product(uuid) from public;
grant execute on function private.can_edit_product(uuid) to authenticated;

create or replace function private.products_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_is_admin boolean := (select private.is_admin());
begin
  -- Papéis: só valem para requisições de usuários da API (service role e SQL
  -- editor não têm auth.uid()).
  if v_actor is not null and not v_is_admin then
    if tg_op = 'INSERT' and new.status not in ('draft', 'review') then
      raise exception 'Somente administradores podem criar produtos já publicados ou arquivados.'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      if old.status in ('published', 'archived') then
        raise exception 'Somente administradores podem alterar produtos publicados ou arquivados.'
          using errcode = '42501';
      end if;
      if new.status in ('published', 'archived') then
        raise exception 'Somente administradores podem publicar ou arquivar produtos.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(v_actor, new.updated_by);

  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if new.price_cents is null
       and not exists (select 1 from public.product_variants v where v.product_id = new.id) then
      raise exception 'Para publicar, informe o preço ou cadastre variações com preço.'
        using errcode = '23514', constraint = 'publish_requires_price';
    end if;
    if not exists (
      select 1 from public.product_media m
      where m.product_id = new.id and m.media_type = 'image' and m.is_primary
    ) then
      raise exception 'Para publicar, envie uma foto e defina a foto principal.'
        using errcode = '23514', constraint = 'publish_requires_primary_image';
    end if;
    if exists (
      select 1 from public.product_media m
      where m.product_id = new.id and length(btrim(m.alt_text)) < 5
    ) then
      raise exception 'Para publicar, todas as mídias precisam de texto alternativo.'
        using errcode = '23514', constraint = 'publish_requires_alt_text';
    end if;
    new.published_at := now();
  end if;

  return new;
end;
$$;

create trigger products_before_write
  before insert or update on public.products
  for each row execute function private.products_before_write();

create or replace function private.products_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('product.created', 'product', new.id,
      jsonb_build_object('name', new.name, 'status', new.status, 'is_demo', new.is_demo));
    return new;
  elsif tg_op = 'DELETE' then
    perform private.audit('product.deleted', 'product', old.id,
      jsonb_build_object('name', old.name, 'status', old.status));
    return old;
  end if;

  if new.status is distinct from old.status then
    perform private.audit('product.status_changed', 'product', new.id,
      jsonb_build_object('name', new.name, 'from', old.status, 'to', new.status));
  end if;
  if new.price_cents is distinct from old.price_cents
     or new.compare_at_price_cents is distinct from old.compare_at_price_cents then
    perform private.audit('product.price_changed', 'product', new.id,
      jsonb_build_object('name', new.name,
        'from', old.price_cents, 'to', new.price_cents,
        'compare_at_from', old.compare_at_price_cents, 'compare_at_to', new.compare_at_price_cents));
  end if;
  if new.slug is distinct from old.slug then
    perform private.audit('product.slug_changed', 'product', new.id,
      jsonb_build_object('name', new.name, 'from', old.slug, 'to', new.slug));
  end if;
  return new;
end;
$$;

create trigger products_audit
  after insert or update or delete on public.products
  for each row execute function private.products_audit();

create or replace function private.variants_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.price_cents is distinct from old.price_cents then
    perform private.audit('variant.price_changed', 'product', new.product_id,
      jsonb_build_object('variant', new.name, 'from', old.price_cents, 'to', new.price_cents));
  elsif tg_op = 'INSERT' then
    perform private.audit('variant.created', 'product', new.product_id,
      jsonb_build_object('variant', new.name, 'price_cents', new.price_cents));
  elsif tg_op = 'DELETE' then
    perform private.audit('variant.deleted', 'product', old.product_id,
      jsonb_build_object('variant', old.name));
    return old;
  end if;
  return new;
end;
$$;

create trigger product_variants_audit
  after insert or update or delete on public.product_variants
  for each row execute function private.variants_audit();

create or replace function private.media_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('media.added', 'product', new.product_id,
      jsonb_build_object('media_id', new.id, 'type', new.media_type, 'path', new.storage_path));
    return new;
  elsif tg_op = 'DELETE' then
    perform private.audit('media.removed', 'product', old.product_id,
      jsonb_build_object('media_id', old.id, 'type', old.media_type, 'path', old.storage_path));
    return old;
  end if;
  return new;
end;
$$;

create trigger product_media_audit
  after insert or delete on public.product_media
  for each row execute function private.media_audit();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger categories_touch before update on public.categories
  for each row execute function private.touch_updated_at();
create trigger product_variants_touch before update on public.product_variants
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Políticas de produtos, variações e mídia
-- -----------------------------------------------------------------------------
create policy "Público lê produtos publicados"
  on public.products for select
  to anon
  using (status = 'published' and not is_demo);

create policy "Equipe lê todos os produtos; demais usuários só os publicados"
  on public.products for select
  to authenticated
  using ((status = 'published' and not is_demo) or (select private.is_staff()));

create policy "Equipe cria produtos"
  on public.products for insert
  to authenticated
  with check ((select private.is_staff()));

create policy "Equipe edita produtos"
  on public.products for update
  to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy "Admin remove rascunhos e arquivados"
  on public.products for delete
  to authenticated
  using ((select private.is_admin()) and status in ('draft', 'archived'));

create policy "Público lê variações de produtos publicados"
  on public.product_variants for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.status = 'published' and not p.is_demo
    )
    or (select private.is_staff())
  );

create policy "Equipe cria variações em produtos editáveis"
  on public.product_variants for insert
  to authenticated
  with check ((select private.is_staff()) and private.can_edit_product(product_id));

create policy "Equipe edita variações em produtos editáveis"
  on public.product_variants for update
  to authenticated
  using ((select private.is_staff()) and private.can_edit_product(product_id))
  with check ((select private.is_staff()) and private.can_edit_product(product_id));

create policy "Equipe remove variações em produtos editáveis"
  on public.product_variants for delete
  to authenticated
  using ((select private.is_staff()) and private.can_edit_product(product_id));

create policy "Público lê mídia de produtos publicados"
  on public.product_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id and p.status = 'published' and not p.is_demo
    )
    or (select private.is_staff())
  );

create policy "Equipe cria mídia em produtos editáveis"
  on public.product_media for insert
  to authenticated
  with check ((select private.is_staff()) and private.can_edit_product(product_id));

create policy "Equipe edita mídia em produtos editáveis"
  on public.product_media for update
  to authenticated
  using ((select private.is_staff()) and private.can_edit_product(product_id))
  with check ((select private.is_staff()) and private.can_edit_product(product_id));

create policy "Equipe remove mídia em produtos editáveis"
  on public.product_media for delete
  to authenticated
  using ((select private.is_staff()) and private.can_edit_product(product_id));

-- -----------------------------------------------------------------------------
-- Privilégios explícitos (defesa em profundidade além do RLS)
-- -----------------------------------------------------------------------------
revoke all on public.admin_users, public.categories, public.products,
  public.product_variants, public.product_media, public.audit_events
  from anon, authenticated;

-- Público: só leitura, e só das colunas necessárias para a vitrine.
grant select on public.categories to anon;
grant select (
  id, name, slug, short_description, description, category_id, status, is_demo,
  price_cents, compare_at_price_cents, currency, sku, stock_quantity, dimensions,
  attributes, faq, seo_title, seo_description, created_at, updated_at, published_at
) on public.products to anon;
grant select (
  id, product_id, name, sku, price_cents, stock_quantity, attributes, sort_order
) on public.product_variants to anon;
grant select (
  id, product_id, storage_path, media_type, alt_text, sort_order, is_primary,
  is_illustrative, width, height
) on public.product_media to anon;

-- Usuários autenticados: RLS decide o que cada um pode fazer.
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_variants to authenticated;
grant select, insert, update, delete on public.product_media to authenticated;
grant select on public.admin_users to authenticated;
grant select on public.audit_events to authenticated;

-- -----------------------------------------------------------------------------
-- Operações atômicas usadas pelo painel (security invoker: RLS se aplica)
-- -----------------------------------------------------------------------------

-- Cria ou atualiza um produto e sincroniza as variações numa única transação.
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
          'lengthCm', v_variant -> 'lengthCm')),
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
          'lengthCm', v_variant -> 'lengthCm')),
        v_position
      );
    end if;
    v_position := v_position + 1;
  end loop;

  return v_id;
end;
$$;

-- Troca a foto principal sem violar o índice de "uma principal por produto".
create or replace function public.set_primary_media(p_media_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product uuid;
begin
  select product_id into v_product
    from public.product_media
    where id = p_media_id and media_type = 'image';
  if v_product is null then
    raise exception 'Imagem não encontrada.' using errcode = 'P0002';
  end if;
  update public.product_media set is_primary = false where product_id = v_product and is_primary;
  update public.product_media set is_primary = true where id = p_media_id;
end;
$$;

-- Reordena a mídia de um produto conforme a lista recebida.
create or replace function public.reorder_media(p_product_id uuid, p_ordered_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.product_media m
     set sort_order = o.position - 1
    from unnest(p_ordered_ids) with ordinality as o(id, position)
   where m.id = o.id and m.product_id = p_product_id;
$$;

-- Duplica um produto como rascunho (variações e referências de mídia incluídas).
create or replace function public.duplicate_product(p_product_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new uuid;
  v_suffix text := substr(md5(gen_random_uuid()::text), 1, 6);
begin
  insert into public.products (
    name, slug, short_description, description, category_id, status, is_demo,
    price_cents, compare_at_price_cents, sku, stock_quantity, dimensions, attributes,
    faq, seo_title, seo_description
  )
  select
    left(name || ' (cópia)', 120),
    left(slug, 70) || '-copia-' || v_suffix,
    short_description, description, category_id, 'draft', is_demo,
    price_cents, compare_at_price_cents, null, stock_quantity, dimensions, attributes,
    faq, seo_title, seo_description
  from public.products
  where id = p_product_id
  returning id into v_new;

  if v_new is null then
    raise exception 'Produto não encontrado ou sem permissão.' using errcode = 'P0002';
  end if;

  insert into public.product_variants (product_id, name, sku, price_cents, stock_quantity, attributes, sort_order)
  select v_new, name, null, price_cents, stock_quantity, attributes, sort_order
    from public.product_variants where product_id = p_product_id;

  insert into public.product_media (
    product_id, storage_path, media_type, alt_text, sort_order, is_primary,
    is_illustrative, width, height, mime_type, size_bytes
  )
  select v_new, storage_path, media_type, alt_text, sort_order, is_primary,
         is_illustrative, width, height, mime_type, size_bytes
    from public.product_media where product_id = p_product_id;

  return v_new;
end;
$$;

revoke all on function public.save_product(uuid, jsonb) from public, anon;
revoke all on function public.set_primary_media(uuid) from public, anon;
revoke all on function public.reorder_media(uuid, uuid[]) from public, anon;
revoke all on function public.duplicate_product(uuid) from public, anon;
grant execute on function public.save_product(uuid, jsonb) to authenticated;
grant execute on function public.set_primary_media(uuid) to authenticated;
grant execute on function public.reorder_media(uuid, uuid[]) to authenticated;
grant execute on function public.duplicate_product(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket de mídia de produtos
-- -----------------------------------------------------------------------------
-- Leitura pública por URL (necessária para servir as fotos da vitrine).
-- Os caminhos usam UUIDs aleatórios; listar o bucket exige ser da equipe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'model/gltf-binary']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Equipe lista mídia de produtos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-media' and (select private.is_staff()));

create policy "Equipe envia mídia de produtos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-media'
    and (select private.is_staff())
    and (storage.foldername(name))[1] = 'products'
  );

create policy "Equipe atualiza mídia de produtos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-media' and (select private.is_staff()))
  with check (
    bucket_id = 'product-media'
    and (select private.is_staff())
    and (storage.foldername(name))[1] = 'products'
  );

create policy "Equipe remove mídia de produtos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-media' and (select private.is_staff()));

-- -----------------------------------------------------------------------------
-- Categoria inicial (real: a loja vende colchões)
-- -----------------------------------------------------------------------------
insert into public.categories (slug, name, description, sort_order)
values ('colchoes', 'Colchões', 'Colchões para diferentes preferências de firmeza e tamanhos de cama.', 0)
on conflict (slug) do nothing;
