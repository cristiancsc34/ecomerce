# Cores no Estúdio (proposta, não implementado)

> Status (04/11/2026): a loja já tem a estrutura de variantes de cor (seletor “Cor”, fotos e 3D por cor, link do QR
> com a cor; migração `20261103000500_variantes_cor`). Falta o painel criar as cores. Para a demonstração, as cores da
> Poltrona Azul (marrom, branco, vermelho, bege) saem de `npm run demo:variantes` (por computador) ou
> `npm run demo:variantes:gpt` (pelo GPT, com conferência), e só aparecem no ambiente de desenvolvimento.

## Onde entra no fluxo

Depois das **fotos de catálogo aprovadas**, não na limpeza. A limpeza trabalha com as fotos do celular (quantidade e
ângulos variam); as fotos de catálogo são as 4 padronizadas da loja. Trocando a cor nelas, cada cor sai com os mesmos 4
ângulos, gasta menos e o 3D acompanha.

Novo passo no Estúdio: **5. Cores (opcional)**.

1. **Definir a cor**: nome (ex.: “Linho bege”) e a cor, por um destes caminhos:
   - **foto da amostra do tecido** (recomendado): o painel mede a cor da amostra, sem depender da calibração da tela;
   - código **#RRGGBB** ou **RGB** (ex.: 205, 183, 151), com o seletor de cor.
2. **Gerar** (fila do estúdio, como as outras etapas):
   - as 4 fotos de catálogo na cor nova pelo GPT (`openaiRecolorEngine`, mesma chave das fotos de catálogo);
   - cada foto passa pela **conferência automática** (`fidelityCheck`): fora do tecido, madeira, fundo e sombra têm de
     continuar iguais à foto original. Se a IA mexeu na peça, a foto é refeita ou fica a versão recolorida por
     computador, com aviso;
   - o 3D: o mesmo modelo, com a cor nova como variante dentro do `.glb` (`KHR_materials_variants`), pintado com a cor
     medida nas fotos geradas; e o `.usdz` dessa cor para o iPhone, quando o tamanho real estiver conferido.
3. **Conferir e aprovar**: antes × depois lado a lado, foto por foto (como as fotos de catálogo). Até alguém aprovar,
   nada vai para a loja. Na loja, a foto aparece como “Imagem ilustrativa” até a foto real da cor chegar.
4. **Publicar a cor**: vira uma variação em “Preço e estoque” (preço igual ou diferente, estoque), com as fotos ligadas
   a ela. O seletor “Cor” aparece sozinho na página do produto.

## Regras

- Só cores que a loja **realmente vende** (tecido disponível com o fornecedor). Cor recolorida não é foto real: fica
  marcada como ilustrativa; quando houver foto real, ela substitui.
- A primeira cor da lista é a das fotos originais do produto.

## Custo e esforço

- GPT: cerca de **US$ 0,35 por cor** (4 fotos; medido nas fotos de catálogo, ~US$ 0,35 por 4 fotos). 3D e conferência:
  sem custo (feitos no servidor).
- Implementar: novo tipo de tarefa na fila (`color_variant`, migração no enum `ai_job_kind`), passo “Cores” no Estúdio,
  aprovação e criação da variação; testes com o motor falso, como nas outras etapas.
