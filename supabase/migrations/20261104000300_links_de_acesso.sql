-- Links de acesso ao painel (instrução do dono, 04/11/2026). Ver docs/PAINEL.md, "Links de acesso".
--
-- O acesso geral continua como antes (PIN ou e-mail e senha). Em vez de senhas por área, o administrador cria, no
-- painel, um link para uma ou mais áreas (itens, pedidos, entrega) e manda para a pessoa. Quem abre o link entra numa
-- conta própria daquele link (criada no primeiro uso, papel "editor" e só aquelas áreas em admin_users.areas), e as
-- políticas restritivas de 20261104000200_areas_do_painel.sql seguram o resto no banco.
--
-- Revogar corta na hora: o link deixa de abrir e a conta perde o vínculo com a equipe (admin_users), então a próxima
-- tela ou ação já não passa. O link guardado é só o hash (SHA-256) do código: o link inteiro aparece uma vez, ao criar.

create table public.admin_access_links (
  id uuid primary key default gen_random_uuid(),
  label text not null constraint admin_access_links_label check (char_length(btrim(label)) between 2 and 80),
  areas text[] not null
    constraint admin_access_links_areas check (cardinality(areas) between 1 and 3 and areas <@ array['itens', 'pedidos', 'entrega']::text[]),
  token_hash text not null unique constraint admin_access_links_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Conta do Supabase deste link (criada no primeiro uso, pelo servidor).
  user_id uuid unique references auth.users (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 constraint admin_access_links_use_count check (use_count >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index admin_access_links_created_idx on public.admin_access_links (created_at desc);

alter table public.admin_access_links enable row level security;

-- Só o administrador vê e cria links (pela tela /admin/acessos). Usar e revogar passa pelo servidor (chave de serviço),
-- porque mexe na conta do link no Auth.
create policy "Admin lê os links de acesso" on public.admin_access_links for select to authenticated
  using ((select private.is_admin()));
create policy "Admin cria links de acesso" on public.admin_access_links for insert to authenticated
  with check ((select private.is_admin()));

revoke all on public.admin_access_links from public, anon, authenticated;
grant select, insert on public.admin_access_links to authenticated;
grant select, insert, update, delete on public.admin_access_links to service_role;

comment on table public.admin_access_links is
  'Links de acesso ao painel por área (itens, pedidos, entrega), revogáveis. Guarda só o hash do código.';
