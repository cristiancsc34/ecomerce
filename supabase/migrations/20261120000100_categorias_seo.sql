-- =============================================================================
-- SEO das categorias: título e descrição para o Google e um texto da página.
--
-- O dono preenche no painel (Categorias). Tudo opcional: campo vazio fica de
-- fora da página e o site usa o nome e a descrição curta da categoria.
--   seo_title        → título na aba e no Google (até 70 caracteres)
--   seo_description  → resumo que aparece no Google (até 170 caracteres)
--   content          → texto da página da categoria, abaixo dos produtos
--                      (dicas de escolha, medidas, cuidados; até 4000 caracteres)
--
-- PENDENTE: aplicar no Supabase do projeto. O código já funciona sem ela: lê e
-- grava as colunas novas só quando o banco as tiver.
-- =============================================================================

alter table public.categories
  add column seo_title text
    constraint categories_seo_title_length check (length(btrim(seo_title)) between 1 and 70),
  add column seo_description text
    constraint categories_seo_description_length check (length(btrim(seo_description)) between 1 and 170),
  add column content text
    constraint categories_content_length check (length(btrim(content)) between 1 and 4000);

comment on column public.categories.seo_title is 'Título para o Google (opcional, até 70 caracteres).';
comment on column public.categories.seo_description is 'Resumo para o Google (opcional, até 170 caracteres).';
comment on column public.categories.content is 'Texto da página da categoria (opcional, até 4000 caracteres, texto simples).';
