-- =============================================================================
-- Estúdio de IA: fotos do celular → foto com fundo limpo → modelo 3D
--
-- O painel cria "jobs"; um processador (scripts/ai-worker.mjs, com a chave de
-- serviço) pega um job por vez, roda os modelos e grava o resultado como mídia
-- do produto. A equipe só cria e acompanha jobs; quem altera o status é o
-- processador.
--
-- Arquivos no Storage (sempre com UUID no nome):
--   products/<produto>/originais/<uuid>.<ext>  foto enviada (fundo qualquer)
--   products/<produto>/recortes/<uuid>.png     recorte com transparência (entrada do 3D)
--   products/<produto>/<uuid>.jpg|.glb         resultado (vira mídia do produto)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias que exigem 3D para publicar (móveis)
-- -----------------------------------------------------------------------------
alter table public.categories add column requires_3d boolean not null default false;

comment on column public.categories.requires_3d is
  'Produtos desta categoria só são publicados com um modelo 3D (fotos e 3D obrigatórios; vídeo opcional).';

insert into public.categories (slug, name, description, sort_order, requires_3d)
values ('cadeiras', 'Cadeiras e poltronas', 'Cadeiras e poltronas com fotos reais e visualização em 3D.', 1, true)
on conflict (slug) do nothing;

create or replace function private.products_require_3d()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and exists (select 1 from public.categories c where c.id = new.category_id and c.requires_3d)
     and not exists (
       select 1 from public.product_media m where m.product_id = new.id and m.media_type = 'model_3d'
     ) then
    raise exception 'Para publicar nesta categoria, gere ou envie o modelo 3D.'
      using errcode = '23514', constraint = 'publish_requires_3d';
  end if;
  return new;
end;
$$;

create trigger products_require_3d
  before insert or update on public.products
  for each row execute function private.products_require_3d();

-- -----------------------------------------------------------------------------
-- Jobs de IA
-- -----------------------------------------------------------------------------
create type public.ai_job_kind as enum ('background_removal', 'model_3d');
create type public.ai_job_status as enum ('queued', 'running', 'succeeded', 'failed');

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  kind public.ai_job_kind not null,
  status public.ai_job_status not null default 'queued',
  input_path text not null
    constraint ai_jobs_input_path_format check (input_path like 'products/%' and length(input_path) <= 300),
  -- 3D: a foto limpa usada como base.
  source_media_id uuid references public.product_media (id) on delete set null,
  -- Resultado gravado como mídia do produto.
  output_media_id uuid references public.product_media (id) on delete set null,
  -- Limpeza de fundo: recorte com transparência, entrada do 3D.
  cutout_path text constraint ai_jobs_cutout_path_format check (cutout_path like 'products/%'),
  engine text constraint ai_jobs_engine_length check (length(engine) <= 80),
  error text constraint ai_jobs_error_length check (length(error) <= 500),
  details jsonb not null default '{}'::jsonb constraint ai_jobs_details_object check (jsonb_typeof(details) = 'object'),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index ai_jobs_queue_idx on public.ai_jobs (created_at) where status = 'queued';
create index ai_jobs_product_idx on public.ai_jobs (product_id, created_at);

alter table public.ai_jobs enable row level security;

create policy "Equipe acompanha os jobs de IA"
  on public.ai_jobs for select
  to authenticated
  using ((select private.is_staff()));

create policy "Equipe cria jobs em produtos editáveis"
  on public.ai_jobs for insert
  to authenticated
  with check (
    (select private.is_staff())
    and private.can_edit_product(product_id)
    and status = 'queued'
    and input_path like 'products/' || product_id::text || '/%'
  );

create policy "Equipe descarta jobs de produtos editáveis"
  on public.ai_jobs for delete
  to authenticated
  using ((select private.is_staff()) and private.can_edit_product(product_id));

revoke all on public.ai_jobs from anon, authenticated;
grant select, delete on public.ai_jobs to authenticated;
grant insert (product_id, kind, input_path, source_media_id) on public.ai_jobs to authenticated;

-- -----------------------------------------------------------------------------
-- Processadores (sinal de vida e o que cada um sabe fazer)
-- -----------------------------------------------------------------------------
create table public.ai_workers (
  id text primary key constraint ai_workers_id_length check (length(id) between 1 and 80),
  capabilities public.ai_job_kind[] not null default '{}',
  engines jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);

alter table public.ai_workers enable row level security;

create policy "Equipe vê os processadores"
  on public.ai_workers for select
  to authenticated
  using ((select private.is_staff()));

revoke all on public.ai_workers from anon, authenticated;
grant select on public.ai_workers to authenticated;

-- -----------------------------------------------------------------------------
-- Fila: o processador pega o job mais antigo que sabe fazer, sem disputa.
-- -----------------------------------------------------------------------------
create or replace function public.claim_ai_job(p_kinds public.ai_job_kind[])
returns setof public.ai_jobs
language sql
security definer
set search_path = ''
as $$
  update public.ai_jobs j
     set status = 'running', started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select q.id from public.ai_jobs q
      where q.status = 'queued' and q.kind = any (p_kinds)
      order by q.created_at
      limit 1
      for update skip locked
   )
  returning j.*;
$$;

revoke all on function public.claim_ai_job(public.ai_job_kind[]) from public, anon, authenticated;
grant execute on function public.claim_ai_job(public.ai_job_kind[]) to service_role;
