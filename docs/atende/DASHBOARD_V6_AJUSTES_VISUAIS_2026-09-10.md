# Dashboard Atende V6 — Ajustes visuais da rodada final

Data: 2026-09-10
Branch: `feat/atende-dashboard-v6`
Base protegida: `main` permanece sem alteração.

## Objetivo

Refinar três blocos visuais da V6 sem alterar a regra de negócio já definida para projeção, remuneração, classificação de receita ou metas.

## 1. Mapa de medalhas

O card deixa de ser apenas textual e passa a usar duas trilhas visuais independentes, uma para **Balcão AGF** e outra para **Metrô**.

Cada trilha deve exibir:

- Bronze, Prata, Ouro e Diamante com ícone `military_tech`;
- cor própria por faixa;
- valor mínimo de entrada na faixa;
- destaque forte da faixa atual;
- barra de progresso até a próxima faixa;
- valor que falta para a próxima medalha;
- medalha esperada na projeção V6.

Paleta:

| Faixa | Cor |
|---|---|
| Bronze | `#B87333` |
| Prata | `#8D99A6` |
| Ouro | `#D5A100` |
| Diamante | `#5370D9` |

A projeção exibida continua usando a regra V6: receita recorrente é extrapolada; Campanha/Pontual soma somente o realizado; sinais pendentes mantêm a projeção sob revisão.

## 2. Realizado x meta x projeção

Substituir a tabela simples por comparação gráfica por grupo:

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

A escala de cada linha deve acomodar o maior entre realizado, meta e projeção, para não esconder projeções acima de 100%.

## 3. Faturamento por Local, Mix por Tipo de Serviço e Canal

Os três cards passam de barras horizontais para **gráficos donut**.

Cada donut deve exibir:

- total no centro;
- fatias por categoria;
- legenda com nome, valor e participação percentual;
- mesma paleta compartilhada do dashboard;
- no máximo cinco categorias principais + `Outros` para preservar legibilidade.

Aplicar tanto em **Operação** quanto em **Gestão**.

## Regras de não regressão

1. Não alterar `main`.
2. Não mudar contratos de payload.
3. Não alterar fórmula de projeção V6.
4. Não duplicar regra contratual/PPCC no front.
5. Não alterar permissões de Gestão.
6. Manter responsividade abaixo de 900 px.
7. Continuar usando `DashboardTabsV4.html` como base visual e `DashboardIntelligenceV6.html` como camada de patch.

## Arquivo principal

`apps-script/atende/DashboardIntelligenceV6.html`

A implementação deve ocorrer na branch `feat/atende-dashboard-v6` e só poderá ser levada à `main` depois da validação funcional do ambiente V6 isolado.
