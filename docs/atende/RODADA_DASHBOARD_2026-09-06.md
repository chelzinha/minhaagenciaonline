# Atende - visão Dashboard - 06/09/2026

## Objetivo

Adicionar uma segunda forma de leitura do mesmo universo filtrado do Atende, sem alterar o RAW e sem duplicar a lógica de filtros.

A navegação passa a oferecer:

```text
Tabela | Dashboard
```

Os filtros existentes continuam sendo a fonte única de contexto para as duas visões.

## Regras preservadas

- RAW dos CSVs dos Correios permanece imutável;
- nenhuma linha é deduplicada, mesclada ou sobrescrita;
- os filtros facetados continuam dependentes;
- busca, período manual, mês completo, Todo período e todos os filtros categóricos são reutilizados;
- Remetentes não foi alterado nesta rodada;
- a futura integração de clientes do consolidador permanece fora do escopo desta entrega.

## Backend

O Worker reutiliza `/atende` com:

```text
view=dashboard
```

Em vez de retornar as linhas da tabela, o D1 calcula agregações server-side.

Isso evita transferir toda a base para o navegador e mantém a solução escalável conforme o histórico crescer.

## Indicadores

O Dashboard retorna quatro KPIs principais:

- Postagens;
- Faturamento;
- Valor médio;
- Estornos, com quantidade e valor associado.

## Evolução temporal

O gráfico principal possui alternância entre:

```text
Faturamento | Postagens
```

Granularidade:

- até 62 dias de período explícito: evolução diária;
- períodos maiores ou Todo período: evolução mensal.

## Gráficos de composição e ranking

A primeira versão inclui:

- Tipo de serviço;
- Tabela;
- Subgrupo;
- Top 10 serviços;
- Local;
- Top 10 atendentes;
- Intermediador;
- Tipo de contrato.

Cada linha de ranking mostra faturamento e quantidade de postagens.

## Clientes

Gráficos estratégicos de cliente não entram nesta rodada porque a modelagem de Remetentes/Clientes ainda será complementada com a ideia de integração ao consolidador.

O filtro Cliente existente continua funcionando e pode restringir o Dashboard normalmente.

## Frontend

A lógica visual do Dashboard fica separada em:

```text
apps-script/atende/DashboardAddon.html
apps-script/atende/32_ATENDE_DASHBOARD.gs
```

O `Index.html` apenas carrega o addon após a tela principal estar pronta.

## Publicação

Não há migration D1 nesta rodada.

É necessário:

1. atualizar a branch `feat/atende-csv-diario`;
2. publicar o Worker;
3. executar `clasp push`;
4. atualizar o deployment existente do Apps Script.

Cloudflare Pages não precisa ser publicado.
