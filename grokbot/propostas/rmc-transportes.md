# RMC Transportes e Agenciamento de Cargas: análise da tabela

- **Origem:** tabela recebida pelo Cristian em 13/11/2026 (`Tabela_Cliente_MGF_2026.xlsx`).
- **Empresa:** RMC Transportes e Agenciamento de Cargas Ltda. Filial em Paiçandu-PR (Rua Curitiba, 900, CNPJ 09.265.225/0006-59), matriz em Jaraguá do Sul-SC.
- **Simulador com as contas:** `Analise_Frete_RMC.xlsx`, nesta mesma pasta.

## Como a tabela cobra

- **Frete** = (tarifa + taxa de origem + taxa de destino + valor da NF × ad valorem) ÷ 0,96.
- **Cada parcela** = valor mínimo até 10 kg + (peso − 10) × valor por kg excedente.
- **Cubagem:** 167 kg/m³ (C × L × A ÷ 6.000). Cobra o maior entre o peso real e o cubado.
- **Ad valorem:** 0,33% nas capitais, 0,7% no interior e 1% no interior do RJ. Não tem GRIS.
- **Reentrega:** 50% do frete. **Devolução:** 100% do frete.
- **Agendamento ou espera acima de 1 hora:** valor sob consulta, o que é comum em entrega para pessoa física.
- **Embalagem:** mercadoria frágil ou mal embalada fica **sem cobertura de seguro**.
- **Faturamento:** quinzena + 12 dias.
- **Prazos:** D+3 a D+4 nas capitais do Sul e Sudeste, D+6 a D+7 no interior.
- **Cobertura:** praticamente todos os municípios do Sul e do Sudeste.
- **Tipo de serviço:** a tabela tem cara de **frete aéreo ou expresso**. Indícios: cubagem de 167 kg/m³, aba de aeroportos, cláusula sobre "transporte aéreo" e o fator ÷ 0,96, que equivale a embutir 4% de ICMS.

## Custo por m³ de móvel (não depende do produto)

| Destino | R$ por m³ adicional |
|---|---|
| Maringá | ~R$ 130 |
| Londrina | ~R$ 190 |
| Rio de Janeiro (capital) | ~R$ 620 |
| Porto Alegre | ~R$ 740 |
| Curitiba | ~R$ 760 |
| Belo Horizonte | ~R$ 820 |
| Vitória | ~R$ 850 |
| Interior MG | ~R$ 1.240 |
| **São Paulo (capital e interior)** | **~R$ 2.540 a 2.690** |
| **Santa Catarina (Florianópolis, Joinville, interior)** | **~R$ 2.580 a 2.670** |

## Exemplos com medidas estimadas

| Produto | Volume | Valor NF |
|---|---|---|
| Sofá 3 lugares | 1,98 m³ | R$ 5.000 |
| Mesa de centro | 0,14 m³ | R$ 900 |

| Destino | Sofá 3 lugares | Mesa de centro |
|---|---|---|
| Maringá | R$ 340 (7%) | R$ 83 (9%) |
| Londrina | R$ 439 (9%) | R$ 84 (9%) |
| Curitiba | R$ 1.580 (32%) | R$ 175 (19%) |
| Porto Alegre | R$ 1.557 (31%) | R$ 176 (20%) |
| Rio de Janeiro | R$ 1.371 (27%) | R$ 212 (24%) |
| Belo Horizonte | R$ 1.711 (34%) | R$ 188 (21%) |
| São Paulo (capital) | R$ 5.097 (102%) | R$ 419 (47%) |
| Florianópolis | R$ 5.382 (108%) | R$ 459 (51%) |

Entre parênteses: o frete em % do valor do produto.

## Conclusão

- **Não compensa como transportadora principal dos móveis.** Para sofá e poltrona, o frete passa de 30% do valor do produto em todas as capitais do Sul e Sudeste. Em SP e SC passa de 100%.
- **Pode compensar para:**
  - entregas em **Maringá e Londrina** (7% a 10%);
  - itens pequenos ou urgentes para PR, RS, RJ, MG e ES.
- **SP e SC custam cerca de 3,5× mais por kg** que PR, RS, RJ, MG e ES, e SP é o maior mercado. Isso precisa ser explicado ou renegociado.

## Perguntas para a RMC

1. Essa tabela é aérea ou expressa? Vocês têm **tabela rodoviária** (carga fracionada) para móveis?
2. Por que SP e SC custam cerca de 3,5× mais por kg que RJ, RS e MG? Dá para revisar?
3. Quanto custa a **entrega residencial com agendamento**, que a tabela deixa "sob consulta"?
4. Quais são as **regras de embalagem** para móveis terem cobertura de seguro?
5. Têm tarifa diferenciada por volume mensal ou para cargas acima de 100 kg?
