-- =============================================================================
-- Fotos de catálogo geradas por IA a partir das fotos reais
--
-- O vendedor pode fotografar de qualquer jeito (torto, com partes escondidas,
-- fundo bagunçado). A IA recria a cena no padrão da loja — mesmos ângulos, luz
-- e fundo — usando as fotos reais como referência, sem mudar o produto.
--
-- Regra: imagem de IA só aparece na loja depois que uma pessoa da equipe confere
-- com as fotos reais (cor, formato, peças, acabamento) e aprova. Quem aprovou e
-- quando fica registrado na auditoria.
-- =============================================================================

alter type public.ai_job_kind add value if not exists 'catalog_photos';

alter table public.product_media
  add column ai_generated boolean not null default false,
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users (id) on delete set null;

alter table public.product_media
  add constraint product_media_ai_primary_needs_approval
    check (not (ai_generated and approved_at is null and is_primary));

comment on column public.product_media.ai_generated is
  'Imagem de catálogo gerada por IA a partir das fotos reais. Só vai para a loja depois de aprovada (approved_at).';

-- Público (e quem não é da equipe) não vê imagem de IA sem aprovação.
drop policy "Público lê mídia de produtos publicados" on public.product_media;

create policy "Público lê mídia de produtos publicados"
  on public.product_media for select
  to anon, authenticated
  using (
    (
      exists (
        select 1 from public.products p
        where p.id = product_id and p.status = 'published' and not p.is_demo
      )
      and (not ai_generated or approved_at is not null)
    )
    or (select private.is_staff())
  );

-- A vitrine pode avisar que a imagem foi produzida a partir das fotos reais.
grant select (ai_generated) on public.product_media to anon;

-- Aprovação: o banco registra o autor e a hora (não dá para forjar) e audita.
-- A marcação "gerada por IA" não pode ser removida por update.
create or replace function private.media_ai_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Toda imagem nasce sem aprovação; aprovar é sempre um passo separado.
  if tg_op = 'INSERT' then
    new.approved_at := null;
    new.approved_by := null;
    return new;
  end if;

  new.ai_generated := old.ai_generated;
  if not old.ai_generated then
    new.approved_at := null;
    new.approved_by := null;
  elsif new.approved_at is distinct from old.approved_at then
    if new.approved_at is null then
      new.approved_by := null;
    else
      new.approved_at := now();
      new.approved_by := (select auth.uid());
      perform private.audit('media.ai_approved', 'product', new.product_id,
        jsonb_build_object('media_id', new.id, 'path', new.storage_path));
    end if;
  else
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

create trigger product_media_ai_approval
  before insert or update on public.product_media
  for each row execute function private.media_ai_approval();
