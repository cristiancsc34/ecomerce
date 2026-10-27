-- =============================================================================
-- Dados de DEMONSTRAÇÃO (opcionais)
--
-- Três produtos placeholder do protótipo, em RASCUNHO e com is_demo = true.
-- A constraint products_demo_never_published impede que sejam publicados.
-- Preço, firmeza e altura são ilustrativos; materiais, camadas, garantia e
-- cuidados ficam vazios de propósito (não inventamos especificações).
-- As imagens apontam para ilustrações estáticas em /public/demo (caminhos
-- iniciados por "demo/"), não para o Storage.
--
-- Rodado automaticamente por `supabase db reset` no ambiente local. Em um
-- projeto hospedado, rode manualmente no SQL Editor se quiser os exemplos.
-- =============================================================================

do $$
declare
  v_category uuid;
  v_product uuid;
  r record;
  v_view record;
  v_variant record;
  v_position integer;
begin
  select id into v_category from public.categories where slug = 'colchoes';

  for r in
    select * from (values
      ('nuvem-essencial', 'Nuvem Essencial',
       'Proposta de colchão de entrada, com toque mais macio.',
       'Proposta de linha de entrada da marca, pensada para quem prefere um toque mais macio.',
       'medio-macio', 24, false,
       '[["solteiro","Solteiro (88 × 188 cm)",89900,88,188],["casal","Casal (138 × 188 cm)",129900,138,188],["queen","Queen (158 × 198 cm)",159900,158,198]]'::jsonb),
      ('brisa-premium', 'Brisa Premium',
       'Proposta de colchão de firmeza média, para uso do dia a dia.',
       'Proposta de linha intermediária, com firmeza média para quem não quer nem muito macio nem muito firme.',
       'medio', 28, false,
       '[["casal","Casal (138 × 188 cm)",189900,138,188],["queen","Queen (158 × 198 cm)",219900,158,198],["king","King (193 × 203 cm)",279900,193,203]]'::jsonb),
      ('sereno-hibrido', 'Sereno Híbrido',
       'Proposta de colchão híbrido, com sensação médio-firme.',
       'Proposta de linha superior, com sensação médio-firme. É o produto escolhido para a prova de conceito do visualizador 3D.',
       'medio-firme', 30, true,
       '[["solteiro-king","Solteiro King (96 × 203 cm)",219900,96,203],["casal","Casal (138 × 188 cm)",249900,138,188],["queen","Queen (158 × 198 cm)",289900,158,198],["king","King (193 × 203 cm)",349900,193,203]]'::jsonb)
    ) as t(slug, name, short_description, description, firmness, height_cm, has_3d, variants)
  loop
    if exists (select 1 from public.products where slug = r.slug) then
      continue;
    end if;

    insert into public.products (
      name, slug, short_description, description, category_id, status, is_demo,
      dimensions, attributes
    ) values (
      r.name,
      r.slug,
      r.short_description,
      r.description || E'\n\nProduto demonstrativo. Nome, preço, firmeza, altura e imagens são ilustrativos e serão substituídos pelos dados reais verificados antes de qualquer publicação.',
      v_category,
      'draft',
      true,
      jsonb_build_object('heightCm', r.height_cm),
      jsonb_build_object('firmness', r.firmness)
    )
    returning id into v_product;

    v_position := 0;
    for v_variant in select * from jsonb_array_elements(r.variants) as e(item)
    loop
      insert into public.product_variants (product_id, name, price_cents, attributes, sort_order)
      values (
        v_product,
        v_variant.item ->> 1,
        (v_variant.item ->> 2)::integer,
        jsonb_build_object(
          'size', v_variant.item ->> 0,
          'widthCm', (v_variant.item ->> 3)::integer,
          'lengthCm', (v_variant.item ->> 4)::integer),
        v_position
      );
      v_position := v_position + 1;
    end loop;

    v_position := 0;
    for v_view in
      select * from (values
        ('frente', 'vista em três quartos, mostrando o tampo e a lateral'),
        ('lateral', 'vista lateral, mostrando a altura e o perfil'),
        ('detalhe', 'detalhe aproximado do tecido e da costura do tampo'),
        ('ambiente', 'colchão montado sobre uma cama em um quarto claro')
      ) as v(view_key, alt)
    loop
      insert into public.product_media (
        product_id, storage_path, media_type, alt_text, sort_order, is_primary,
        is_illustrative, width, height, mime_type
      ) values (
        v_product,
        'demo/' || r.slug || '-' || v_view.view_key || '.svg',
        'image',
        'Ilustração do colchão ' || r.name || ': ' || v_view.alt || '.',
        v_position,
        v_position = 0,
        true,
        1200,
        900,
        'image/svg+xml'
      );
      v_position := v_position + 1;
    end loop;

    if r.has_3d then
      insert into public.product_media (
        product_id, storage_path, media_type, alt_text, sort_order, is_illustrative, mime_type
      ) values (
        v_product,
        'demo/' || r.slug || '.glb',
        'model_3d',
        'Modelo 3D ilustrativo do colchão ' || r.name || ', que pode ser girado para ver todos os lados.',
        99,
        true,
        'model/gltf-binary'
      );
    end if;
  end loop;
end;
$$;
