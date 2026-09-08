# Atende - Dashboard Gerencial V3 - 2026-09-08

## Objetivo

Concentrar a leitura gerencial no desktop sem perder responsividade mobile e incorporar metas mensais administraveis.

## Decisoes de UX

- 8 KPIs compactos na primeira linha desktop.
- Evolucao do periodo e faturamento dos ultimos 6 meses lado a lado.
- Todos os donuts na secao `Composicao da operacao`.
- Grade de 4 donuts no desktop e 2 no mobile.
- `Intermediador` passa a ser apresentado como `Canal` na interface; o nome tecnico do campo no banco permanece inalterado para compatibilidade.
- Removido ranking `Top Atendentes` do Dashboard.
- `Balcao` permanece no grafico de Local mesmo com faturamento zero quando estiver cadastrado como Local ativo.

## Regras de remuneracao usadas

A leitura contratual nao usa apenas o segmento comercial. A base correta e a classificacao da biblioteca de servicos:

- `R2 G1` = Mensageria (carta, impresso, telegrama e demais codigos classificados nessa tabela).
- `R2 G2` = Encomendas (PAC e SEDEX classificados nessa tabela).

As escadas de Mensageria e Encomendas seguem o material de remuneracao do Contrato AGF Tipo 12, Anexo 3, vigencia 17/11/2025, com limites em reais do PPCC de R$ 3,85.

O Dashboard mostra a parcela variavel estimada (`faturamento x percentual do degrau`) e deixa explicito que o ajuste fixo do degrau nao esta incluido, pois a tabela completa de ajustes nao esta disponivel no material usado para esta rodada.

## Oportunidade de embalagem

- Conta postagens R2 G2 como base de encomendas.
- Conta embalagens pelos codigos movimentados conhecidos e nomes de embalagem da tabela R1 G1.
- Mostra taxa atual de anexacao.
- Simula metas de 10% e 20%.
- Usa R$ 3,78 como retorno medio unitario para estimar ganho incremental.

## Metas mensais

Nova configuracao em Admin > Metas:

- competencia `AAAA-MM`;
- dias uteis realizados;
- dias uteis do mes;
- Encomendas: meta unica;
- Balcao AGF: Bronze, Prata, Ouro, Diamante;
- Metro: Bronze, Prata, Ouro, Diamante.

Nao ha calculo de premio/comissao nesta rodada. O Dashboard informa apenas realizado, projecao e patamar atingido.

## Persistencia

Tabela D1: `atende_dashboard_metas_mensais`.

A configuracao nao altera nenhuma linha RAW e nao interfere na importacao oficial dos Correios.
