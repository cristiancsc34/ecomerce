# Painel da loja (`/admin`)

Feito para cadastrar e vender pelo celular, sem precisar de manual: cada tela mostra o que falta e leva direto ao
lugar de resolver.

![Painel no celular: PIN, Início, Produtos e Novo produto](img/painel-celular-1.jpg)
![Página do produto no celular: abas, painel “Pronto para vender” e barra de salvar](img/painel-celular-2.jpg)

## Entrar

- Abra **`/admin`**. Com o PIN ligado, a tela pede só o **PIN da loja** (na demonstração: `1234`).
- “Entrar com e-mail e senha” continua disponível para cada pessoa da equipe usar a própria conta.
- **Sair** fica no menu lateral (computador) ou no ícone do topo (celular).

### Como o PIN funciona (e por que é seguro o bastante para o MVP)

O PIN **não** substitui as contas da equipe. Quando o PIN confere, o servidor entra numa conta de verdade do Supabase
(`ADMIN_PIN_EMAIL` / `ADMIN_PIN_PASSWORD`, senha longa que nunca vai ao navegador). Por isso o banco continua aplicando
as regras de acesso (RLS) e o histórico registra quem fez cada alteração.

- Comparação em tempo constante; 5 tentativas a cada 10 minutos por IP.
- Desligado se faltar qualquer uma das três variáveis (`ADMIN_PIN`, `ADMIN_PIN_EMAIL`, `ADMIN_PIN_PASSWORD`).
- **`1234` é só para demonstração.** Antes de vender de verdade: troque por um PIN longo, ou apague `ADMIN_PIN` para
  usar só e-mail e senha.

Para ligar:

```bash
ADMIN_PASSWORD='uma-senha-longa-e-aleatoria' npm run admin:create -- painel@sualoja.com.br admin
# em .env.local (e nas variáveis da Vercel, sem NEXT_PUBLIC_):
ADMIN_PIN=1234
ADMIN_PIN_EMAIL=painel@sualoja.com.br
ADMIN_PIN_PASSWORD=uma-senha-longa-e-aleatoria
```

## Telas

| Tela | Para quê |
| --- | --- |
| **Início** | Quantos produtos em cada status e **“O que fazer agora”**: o próximo passo de cada produto (fotos da IA para conferir, o que falta, ou “já pode publicar”). Toque e cai na aba certa. |
| **Produtos** | Busca, filtro por status e, em cada linha, a barrinha **“Pronto para vender”** (ex.: 5/6) com o que falta. |
| **Novo produto** | Um passo só: nome e categoria → o rascunho é criado e abre direto em **Fotos e 3D**. O endereço (link) é gerado pelo nome. |
| **Categorias** / **Atividade** | Cadastro de categorias e histórico de tudo que mudou. |

No celular, a navegação fica embaixo (Início, Produtos, **+ Novo**, Categorias, Atividade); no computador, no menu
lateral.

### Página do produto

Abas, uma tarefa por vez (o endereço guarda a aba: `?aba=preco`):

| Aba | O que tem |
| --- | --- |
| **Fotos e 3D** | Estúdio de IA (fotos do celular → fundo limpo → fotos de catálogo → 3D) e as fotos que aparecem na loja (ordem, capa, descrição de cada foto). |
| **Informações** | Nome, categoria, descrição curta e completa. |
| **Preço** | Preço, preço “de” (só se for real), estoque, SKU e variações (em colchões, tamanhos com medidas-padrão). |
| **Detalhes** | Medidas (altura, largura, profundidade, peso), materiais, tecido, garantia, cuidados, outras especificações e perguntas frequentes. Firmeza e camadas só aparecem em colchões. |
| **Link e Google** | Endereço na loja e como o produto aparece no Google (com prévia). |

- **Pronto para vender** (lateral no computador; resumo de uma linha no celular, “Ver o que falta”): checklist com as
  **mesmas regras que o banco usa para publicar**. Tocar num item leva à aba dele. As abas com pendência têm um ponto
  laranja. Ali ficam também Enviar para revisão, Publicar, Arquivar, Duplicar e Excluir.
- **Barra de salvar fixa** embaixo: mostra “Alterações não salvas”, **Descartar** e **Salvar**. Trocar de aba não
  perde o que foi digitado; fechar ou recarregar a página com algo não salvo pede confirmação. Publicar só depois de salvar.
- Se algo der erro ao salvar, o painel abre a aba do campo com problema e coloca o cursor nele.
- Campo vazio não aparece na loja. Nada de medida, material ou garantia sem confirmação do fabricante.

## Vídeo

Fica para a próxima etapa (o banco e o servidor já aceitam MP4/WebM, mas o envio está fora da tela por enquanto).

## Para desenvolvedores

- Código: `app/admin/(painel)/`, `components/admin/` (`product-editor.tsx`, `product-form.tsx`, `admin-nav.tsx`),
  `lib/admin/readiness.ts` (checklist), `lib/admin/pin.ts` e `lib/admin/actions/auth.ts` (PIN),
  `createProductDraftAction` em `lib/admin/actions/products.ts`.
- Testes: `tests/unit/admin-panel.test.ts`, `tests/unit/admin-actions-auth.test.ts` e
  `tests/e2e-supabase/admin.spec.ts` (`npm run test:e2e:supabase`; os testes apagam os produtos e arquivos que criam).
- O painel online precisa do Supabase na nuvem; sem ele, `/admin` mostra como conectar.
