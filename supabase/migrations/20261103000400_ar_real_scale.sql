-- =============================================================================
-- Realidade aumentada em tamanho real: arquivo do iPhone (.usdz) ao lado do .glb.
--
-- O estúdio (e o botão "Conferir medidas" do painel) mede o modelo 3D, ajusta a
-- escala pelas medidas do catálogo e confere com tolerância de 2 cm. Só então
-- grava o .usdz e marca o modelo como em tamanho real. Sem medidas, ou fora da
-- tolerância, nada disso é gravado e a loja mostra o tamanho como aproximado.
--
-- PENDENTE: aplicar no Supabase do projeto ANTES de publicar o código que lê
-- estas colunas (a vitrine e o painel passam a pedi-las).
-- =============================================================================

alter table public.product_media
  add column usdz_storage_path text
    constraint product_media_usdz_path_length check (length(usdz_storage_path) between 1 and 300),
  -- true só quando a caixa do modelo bateu com as medidas do catálogo (±2 cm).
  add column real_scale boolean not null default false,
  -- Caixa do modelo conferido, em cm: {"widthCm":…, "depthCm":…, "heightCm":…}.
  add column bounds_cm jsonb
    constraint product_media_bounds_object check (jsonb_typeof(bounds_cm) = 'object');

-- .usdz e tamanho real só existem em modelo 3D; tamanho real exige o .usdz e a caixa.
alter table public.product_media
  add constraint product_media_ar_only_model check (
    (usdz_storage_path is null and not real_scale and bounds_cm is null) or media_type = 'model_3d'
  ),
  add constraint product_media_real_scale_files check (
    not real_scale or (usdz_storage_path is not null and bounds_cm is not null)
  );

create index product_media_usdz_path_idx on public.product_media (usdz_storage_path) where usdz_storage_path is not null;

-- A vitrine lê o .usdz e a marcação de tamanho real.
grant select (usdz_storage_path, real_scale, bounds_cm) on public.product_media to anon;

-- O bucket passa a aceitar o .usdz (mesmo limite de 4 MB).
update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'model/gltf-binary',
     'model/vnd.usdz+zip'
   ]
 where id = 'product-media';

-- Arquivo "no ar" também inclui o .usdz de produto publicado (editor não apaga).
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
     where (m.storage_path = p_path or m.usdz_storage_path = p_path)
       and p.status in ('published', 'archived')
  );
$$;
revoke all on function private.media_path_is_live(text) from public;
grant execute on function private.media_path_is_live(text) to authenticated;
