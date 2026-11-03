# Checklist antes de vender

Marque cada item com o dono da loja.

## Configuração

- [ ] `npm run config:verificar` sem nenhum ✗.
- [ ] `npm run check` e `npm run test:e2e` passando.
- [ ] Nenhuma chave no GitHub (`git log -p | grep -E "sk-proj-|service_role"` não encontra nada).
- [ ] Cadastro público do Supabase desligado (o verificador mostra ✓).
- [ ] Senha do administrador entregue ao dono (e PIN, se usar).

## Loja

- [ ] Nome, logo, cores e ícone da aba são os da loja nova (inclusive no celular).
- [ ] Contatos e dados legais corretos; o que não existe está vazio (e escondido).
- [ ] Políticas com o texto real da loja, ou com o aviso de “em revisão” ainda ligado.
- [ ] Categorias certas no painel (as de exemplo removidas ou renomeadas).
- [ ] Pelo menos um produto real publicado, com preço e medidas confirmados pelo dono.
- [ ] `CATALOG_SOURCE=supabase` na Vercel quando os produtos reais estiverem publicados (sem isso, a vitrine mostra a
      demonstração).
- [ ] Compartilhar o link no WhatsApp mostra o nome e a imagem da loja.

## IA

- [ ] Um produto passou pelo estúdio: fotos limpas, 4 fotos de catálogo e descrição.
- [ ] As fotos de catálogo foram comparadas com as fotos reais e aprovadas (o produto não mudou).
- [ ] “Aprimorar descrição” preenche a aba Informações sem pedir de novo à IA.
- [ ] 3D (se usar): abre no painel e em “Ver no seu ambiente” no celular, no tamanho certo e apoiado no chão.
- [ ] Assistente (se usar): responde só com dados do catálogo e não inventa preço nem prazo.

## Vercel

- [ ] Variáveis em Production, secretas marcadas como Sensitive.
- [ ] Plano adequado para venda (Hobby é não comercial).
- [ ] Domínio próprio apontado (se houver) e `NEXT_PUBLIC_SITE_URL` atualizado.

## Segurança depois da entrega

- [ ] Chaves que apareceram em chat, print ou e-mail foram trocadas.
- [ ] Tokens de automação (`VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`) apagados ou guardados só no ambiente da IA.
