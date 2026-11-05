-- =============================================================================
-- Cores no Estúdio (1 de 2): tipo de tarefa novo na fila de IA.
--
-- Sozinho no arquivo de propósito: o Postgres não deixa usar um valor novo de
-- enum na mesma transação em que ele foi criado (mesmo padrão de
-- 20261028000200_catalog_photos.sql). O resto está em 20261105000200_cores.sql.
--
-- Ordem de publicação: aplicar ESTA migração e a próxima ANTES de publicar o
-- código que liga a tarefa 'color_variant' (lib/ai-cloud/config.ts).
-- =============================================================================

alter type public.ai_job_kind add value if not exists 'color_variant';
