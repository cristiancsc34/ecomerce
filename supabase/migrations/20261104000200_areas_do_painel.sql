-- Áreas do painel: cada senha abre só a sua parte (instrução do dono, 04/11/2026). Ver docs/PAINEL.md.
--
--   * geral (administrador): tudo;
--   * itens: produtos, variações, fotos e 3D, categorias e o histórico do catálogo;
--   * pedidos: pedidos, linha do tempo, avisos do pedido, fábrica e logística (Trama);
--   * entrega: formas de entrega (frete por região) e os avisos automáticos.
--
-- A separação vale no banco, não só na tela: políticas RESTRITIVAS (que se somam às que já existem) exigem a área em
-- cada tabela. Quem tem a sessão de uma área não alcança as outras nem chamando a API do Supabase direto.
-- Conta da equipe sem áreas marcadas (as que já existiam) continua vendo tudo o que via; administrador vê tudo.

alter table public.admin_users
  add column areas text[] not null default '{}'
    constraint admin_users_areas check (areas <@ array['itens', 'pedidos', 'entrega']::text[]);

comment on column public.admin_users.areas is
  'Áreas do painel desta conta (itens, pedidos, entrega). Vazio = todas as que o papel já permitia; admin = tudo.';

/** A conta da equipe pode usar esta área? (admin: sempre; sem áreas marcadas: sim, como antes.) */
create or replace function private.has_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users u
    where u.user_id = (select auth.uid())
      and (u.role = 'admin' or cardinality(u.areas) = 0 or p_area = any (u.areas))
  );
$$;

/** Só quem recebeu a área de propósito (ou é admin). Usada para dar acesso NOVO, sem ampliar as contas antigas. */
create or replace function private.has_explicit_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users u
    where u.user_id = (select auth.uid()) and (u.role = 'admin' or p_area = any (u.areas))
  );
$$;

revoke all on function private.has_area(text) from public;
revoke all on function private.has_explicit_area(text) from public;
grant execute on function private.has_area(text) to anon, authenticated, service_role;
grant execute on function private.has_explicit_area(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Pedidos: ler e mexer exige a área "pedidos"
-- -----------------------------------------------------------------------------
create policy "Área de pedidos: pedidos" on public.orders as restrictive for all to authenticated
  using ((select private.has_area('pedidos'))) with check ((select private.has_area('pedidos')));
create policy "Área de pedidos: itens do pedido" on public.order_items as restrictive for all to authenticated
  using ((select private.has_area('pedidos'))) with check ((select private.has_area('pedidos')));
create policy "Área de pedidos: linha do tempo" on public.order_events as restrictive for all to authenticated
  using ((select private.has_area('pedidos'))) with check ((select private.has_area('pedidos')));
create policy "Área de pedidos: fábrica e logística" on public.order_integration as restrictive for select to authenticated
  using ((select private.has_area('pedidos')));

-- Funções que já conferiam "é da equipe": agora conferem a área.
create or replace function public.order_notifications(p_order_id uuid)
returns table (event text, channel public.notification_channel, status public.notification_status, attempts integer,
  created_at timestamptz, sent_at timestamptz, last_error text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.event, n.channel, n.status, n.attempts, n.created_at, n.sent_at, left(n.last_error, 200)
  from public.notification_outbox n
  where n.order_ref = p_order_id::text and (select private.has_area('pedidos'))
  order by n.created_at, n.channel;
$$;

create or replace function public.requeue_order_integration(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_row public.order_integration;
begin
  if not (select private.has_area('pedidos')) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select status into v_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  select * into v_row from public.order_integration where order_id = p_order_id for update;
  if found and v_row.status = 'enviado' then
    if v_status = 'cancelado' and v_row.cancel_status = 'recusado' then
      update public.order_integration
         set cancel_status = 'pendente', cancel_error = null, attempts = 0, next_attempt_at = now()
       where order_id = p_order_id;
      return 'cancelamento';
    end if;
    raise exception 'Este pedido já está no Trama.' using errcode = '22023';
  end if;
  if v_status not in ('pago', 'em_preparacao') then
    raise exception 'Só vai para a fábrica e a logística o pedido com pagamento confirmado ou em preparação.' using errcode = '22023';
  end if;
  insert into public.order_integration (order_id) values (p_order_id)
  on conflict (order_id) do update
    set status = 'pendente', attempts = 0, next_attempt_at = now(), last_error = null;
  return 'envio';
end;
$$;

-- -----------------------------------------------------------------------------
-- Itens (catálogo): criar, editar e remover exige a área "itens". Ler o catálogo continua livre para a equipe
-- (a área de pedidos escolhe produtos ao lançar um pedido).
-- -----------------------------------------------------------------------------
create policy "Área de itens: cria categorias" on public.categories as restrictive for insert to authenticated
  with check ((select private.has_area('itens')));
create policy "Área de itens: edita categorias" on public.categories as restrictive for update to authenticated
  using ((select private.has_area('itens'))) with check ((select private.has_area('itens')));
create policy "Área de itens: remove categorias" on public.categories as restrictive for delete to authenticated
  using ((select private.has_area('itens')));

create policy "Área de itens: cria produtos" on public.products as restrictive for insert to authenticated
  with check ((select private.has_area('itens')));
create policy "Área de itens: edita produtos" on public.products as restrictive for update to authenticated
  using ((select private.has_area('itens'))) with check ((select private.has_area('itens')));
create policy "Área de itens: remove produtos" on public.products as restrictive for delete to authenticated
  using ((select private.has_area('itens')));

create policy "Área de itens: cria variações" on public.product_variants as restrictive for insert to authenticated
  with check ((select private.has_area('itens')));
create policy "Área de itens: edita variações" on public.product_variants as restrictive for update to authenticated
  using ((select private.has_area('itens'))) with check ((select private.has_area('itens')));
create policy "Área de itens: remove variações" on public.product_variants as restrictive for delete to authenticated
  using ((select private.has_area('itens')));

create policy "Área de itens: cria mídia" on public.product_media as restrictive for insert to authenticated
  with check ((select private.has_area('itens')));
create policy "Área de itens: edita mídia" on public.product_media as restrictive for update to authenticated
  using ((select private.has_area('itens'))) with check ((select private.has_area('itens')));
create policy "Área de itens: remove mídia" on public.product_media as restrictive for delete to authenticated
  using ((select private.has_area('itens')));

create policy "Área de itens: cria jobs de IA" on public.ai_jobs as restrictive for insert to authenticated
  with check ((select private.has_area('itens')));
create policy "Área de itens: descarta jobs de IA" on public.ai_jobs as restrictive for delete to authenticated
  using ((select private.has_area('itens')));

create policy "Área de itens: histórico do catálogo" on public.audit_events as restrictive for select to authenticated
  using ((select private.has_area('itens')));

-- Arquivos das fotos e modelos 3D (bucket product-media). Os outros buckets não mudam.
create policy "Área de itens: envia arquivos do catálogo" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'product-media' or (select private.has_area('itens')));
create policy "Área de itens: atualiza arquivos do catálogo" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'product-media' or (select private.has_area('itens')))
  with check (bucket_id <> 'product-media' or (select private.has_area('itens')));
create policy "Área de itens: remove arquivos do catálogo" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'product-media' or (select private.has_area('itens')));

-- -----------------------------------------------------------------------------
-- Entrega: formas de entrega e avisos automáticos. Antes só o admin mudava; agora também quem recebeu a área
-- "entrega" de propósito (as contas antigas sem área continuam só lendo, como antes).
-- -----------------------------------------------------------------------------
create policy "Área de entrega: formas de entrega" on public.shipping_options as restrictive for all to authenticated
  using ((select private.has_area('entrega'))) with check ((select private.has_area('entrega')));
create policy "Área de entrega: avisos automáticos" on public.notification_settings as restrictive for all to authenticated
  using ((select private.has_area('entrega'))) with check ((select private.has_area('entrega')));

create policy "Área de entrega cria formas de entrega" on public.shipping_options for insert to authenticated
  with check ((select private.has_explicit_area('entrega')));
create policy "Área de entrega edita formas de entrega" on public.shipping_options for update to authenticated
  using ((select private.has_explicit_area('entrega'))) with check ((select private.has_explicit_area('entrega')));
create policy "Área de entrega remove formas de entrega" on public.shipping_options for delete to authenticated
  using ((select private.has_explicit_area('entrega')));
create policy "Área de entrega liga e desliga avisos" on public.notification_settings for update to authenticated
  using ((select private.has_explicit_area('entrega'))) with check ((select private.has_explicit_area('entrega')));
