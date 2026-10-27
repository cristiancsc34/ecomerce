-- =============================================================================
-- Correções da revisão de código
--
-- 1) Storage: editor não altera nem apaga arquivos de produtos publicados
--
-- As políticas originais de UPDATE/DELETE em storage.objects só exigiam ser da
-- equipe. Um editor podia, pela API do Storage, sobrescrever (upsert) ou apagar
-- a foto de um produto já publicado — contornando os triggers que impedem
-- editores de mexer em produtos publicados.
--
--   * UPDATE (sobrescrever/mover): só administradores. O painel sempre envia
--     com upsert desligado, então não precisa disso.
--   * DELETE: administradores; editores só apagam arquivos que não estejam em
--     uso por um produto publicado ou arquivado.
-- =============================================================================

create or replace function private.media_path_is_live(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.product_media m
      join public.products p on p.id = m.product_id
     where m.storage_path = p_path
       and p.status in ('published', 'archived')
  );
$$;
revoke all on function private.media_path_is_live(text) from public;
grant execute on function private.media_path_is_live(text) to authenticated;

drop policy if exists "Equipe atualiza mídia de produtos" on storage.objects;
drop policy if exists "Equipe remove mídia de produtos" on storage.objects;

create policy "Admin atualiza mídia de produtos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-media' and (select private.is_admin()))
  with check (
    bucket_id = 'product-media'
    and (select private.is_admin())
    and (storage.foldername(name))[1] = 'products'
  );

create policy "Equipe remove mídia que não está no ar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-media'
    and (
      (select private.is_admin())
      or ((select private.is_staff()) and not private.media_path_is_live(storage.objects.name))
    )
  );

-- -----------------------------------------------------------------------------
-- 2) duplicate_product: o slug da cópia sempre respeita o formato e os 80
--    caracteres (antes, um slug longo passava do limite e um corte no meio
--    podia gerar "--").
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
