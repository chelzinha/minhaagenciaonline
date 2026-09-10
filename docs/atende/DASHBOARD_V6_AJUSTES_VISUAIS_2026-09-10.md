# Dashboard Atende V6 — Ajustes visuais da rodada final

Data: 2026-09-10
Branch: `feat/atende-dashboard-v6`
Base protegida: `main` permanece sem alteração.

## Objetivo

Refinar três blocos visuais da V6 sem alterar a regra de negócio já definida para projeção, remuneração, classificação de receita ou metas.

## 1. Mapa de medalhas

O card deixa de ser apenas textual e passa a usar duas trilhas visuais independentes, uma para **Balcão AGF** e outra para **Metrô**.

Cada trilha exibe:

- Bronze, Prata, Ouro e Diamante com ícone `military_tech`;
- cor própria por faixa;
- valor mínimo de entrada na faixa;
- destaque forte da faixa atual;
- barra de progresso até a próxima faixa;
- valor que falta para a próxima medalha;
- medalha esperada na projeção V6 quando o backend fornecer a projeção ajustada.

Paleta:

| Faixa | Cor |
|---|---|
| Bronze | `#B87333` |
| Prata | `#8D99A6` |
| Ouro | `#D5A100` |
| Diamante | `#5370D9` |

A projeção exibida usa exclusivamente `projecaoReceita` do backend V6. Não há fallback para extrapolação linear no refinamento visual.

## 2. Realizado x meta x projeção

A tabela simples é substituída por comparação gráfica por grupo:

- Encomendas;
- Balcão AGF;
- Metrô.

Para cada grupo:

- barra azul = realizado;
- camada verde-clara = projeção ajustada;
- marcador amarelo = meta;
- percentual realizado/meta;
- percentual projeção/meta;
- valores absolutos de realizado, meta e projeção.

A escala de cada linha acomoda o maior entre realizado, meta e projeção, para não esconder projeções acima de 100%.

## 3. Faturamento por Local, Mix por Tipo de Serviço e Canal

Os três cards passam de barras horizontais para **gráficos donut**.

Cada donut exibe:

- total no centro;
- fatias por categoria;
- legenda com nome, valor e participação percentual;
- mesma paleta compartilhada do dashboard;
- no máximo cinco categorias principais + `Outros` para preservar legibilidade.

A conversão é aplicada tanto em **Operação** quanto em **Gestão**.

## Estratégia de implementação

Para reduzir risco de regressão enquanto o backend V6 continua sendo fechado em ambiente isolado:

1. `DashboardTabsV4.html` continua sendo a base estrutural.
2. `DashboardIntelligenceV5.html` continua sendo a camada funcional estável nesta etapa.
3. `DashboardVisualV6.html` roda por último e substitui somente os três blocos visuais aprovados.
4. `36_ATENDE_DASHBOARD_V3.gs` libera `projecaoReceita` para o browser quando o Worker V6 passar a fornecê-la.
5. O front visual V6 não calcula projeção linear por conta própria.

## Arquivos desta rodada

- `apps-script/atende/DashboardVisualV6.html`
- `apps-script/atende/32_ATENDE_DASHBOARD.gs`
- `apps-script/atende/36_ATENDE_DASHBOARD_V3.gs`
- `docs/atende/DASHBOARD_V6_AJUSTES_VISUAIS_2026-09-10.md`

## Regras de não regressão

1. Não alterar `main`.
2. Não mudar contratos existentes de payload; apenas liberar a chave nova `projecaoReceita`.
3. Não implementar fórmula de projeção no refinamento visual.
4. Não duplicar regra contratual/PPCC no front.
5. Não alterar permissões de Gestão.
6. Manter responsividade abaixo de 900 px.
7. A projeção visual deve permanecer indisponível se o backend V6 não fornecer a versão ajustada.

A implementação ocorre exclusivamente na branch `feat/atende-dashboard-v6` e só poderá ser levada à `main` depois da validação funcional do ambiente V6 isolado.
