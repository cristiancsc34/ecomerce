-- Publicar produto sem preço (AzConfort, 19/11/2026).
--
-- O dono quer os produtos reais na vitrine antes de definir os preços. Sem preço, a loja mostra "Preço em breve",
-- o produto não tem dados de oferta para o Google e não pode ser comprado: public.place_site_order continua
-- recusando produto sem preço. As outras regras de publicação (foto principal real, textos alternativos, 3D quando
-- a categoria exige, nada de demonstração) continuam iguais.
--
-- Nova versão de private.products_before_write (a anterior está em 20261027000100_catalog.sql), sem a exigência
-- de preço.

CREATE OR REPLACE FUNCTION private.products_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      if new.is_demo is distinct from old.is_demo then
        raise exception 'Somente administradores podem converter um produto de demonstração.'
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
    if new.is_demo then
      raise exception 'Produto de demonstração não pode ser publicado. Cadastre o produto real.'
        using errcode = '23514', constraint = 'products_demo_never_published';
    end if;
    -- Preço não é mais exigido para publicar (19/11/2026): sem preço, a loja mostra "Preço em breve" e o produto
    -- não entra em pedido (public.place_site_order recusa produto sem preço).
    if not exists (
      select 1 from public.product_media m
      where m.product_id = new.id and m.media_type = 'image' and m.is_primary
    ) then
      raise exception 'Para publicar, envie uma foto e defina a foto principal.'
        using errcode = '23514', constraint = 'publish_requires_primary_image';
    end if;
    if exists (
      select 1 from public.product_media m
      where m.product_id = new.id and m.is_primary and m.is_illustrative
    ) then
      raise exception 'Para publicar, a foto principal precisa ser uma foto real do produto (não ilustrativa).'
        using errcode = '23514', constraint = 'publish_requires_real_primary_image';
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
$function$;
