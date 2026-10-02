# Caixa Balcão - Relatório consolidado por período (2026-10-02)

## O que é

PDF de conferência do caixa de uma unidade em um intervalo de datas, para a gestão validar.
Somente usuários com perfil **admin**. O relatório é só leitura: não altera nenhum lançamento, fechamento ou saldo.

## Como usar

1. Abrir o Caixa na unidade desejada.
2. Tocar no ícone de relatório no topo (ao lado do botão de trocar unidade). O ícone só aparece para admin.
3. Escolher um atalho (Últimos 7 dias, Mês atual, Mês anterior, Últimos 30 dias) ou preencher **Data inicial** e **Data final**.
4. Tocar em **Gerar relatório** (pode levar até 1 minuto em períodos longos).
5. Conferir o resumo na tela e tocar em **Abrir PDF**.

## Regras

1. Período máximo: 92 dias.
2. Data final no futuro é ajustada para hoje. Data inicial no futuro é recusada.
3. Uma unidade por relatório (a unidade aberta no Caixa).
4. O backend confere o perfil admin de novo; o botão escondido não é a única proteção.
5. O PDF é salvo no Drive da unidade, pasta `Relatorios/AAAA/MM`, com o nome `UNIDADE_Relatorio_Caixa_INICIO_a_FIM_DATAHORA.pdf`.

## Conteúdo do PDF

1. Cabeçalho com unidade, período, emissor e data de emissão.
2. Indicadores: receitas, despesas, resultado, sangrias, lançamentos de receita, objetos, ticket médio e Pix pendente.
3. **Pontos de atenção**: dias sem fechamento, Pix pendente, exclusões, alterações feitas em dia anterior, envios ao Conta Azul com erro.
4. **Dinheiro físico no período**: saldo inicial, entradas e saídas em dinheiro, sangrias e gaveta final.
5. **Resumo por dia**: situação (Fechado, Fechado + complementos, Sem fechamento), receitas, despesas, resultado, sangrias, gaveta final e links para os PDFs de fechamento do dia.
6. Receitas por grupo (Atende, SARA etc.) e por forma de pagamento.
7. Despesas por categoria.
8. Sangrias do período.
9. Pix pendente (Santander sem confirmação).
10. Lançamentos excluídos, com motivo e responsável.
11. Alterações em dia anterior (aba `Auditoria_Retroativa`).
12. Situação do envio ao Conta Azul (lançamentos por situação).
13. Bloco de validação com assinaturas: **Emitido por** e **Validado por (gestão)**.

Gaveta final marcada com `*` foi calculada (dia sem fechamento), e não lido de um fechamento.

## Arquivos

1. `apps-script/caixa-avista/27_CAIXA_Relatorio_Periodo.js` (novo): montagem dos dados e do PDF.
2. `apps-script/caixa-avista/01_Config_Router.js`: nova ação `periodReport`.
3. `apps-script/caixa-avista/25_CAIXA_Pdf_Layout.js`: assinaturas aceitam rótulos.
4. `frontend/caixa/index.html`: botão do topo e janela do relatório.
5. `frontend/caixa-avista/app-v2.js`: abrir janela, atalhos, validação e chamada com tempo maior (120 s).
6. `frontend/caixa-avista/styles-v2.css`: bloco `CAIXA-RELATORIO-PERIODO-20261002`.
7. Versões de cache: `20261002120000`.

## Teste rápido

1. Entrar como admin, abrir `/caixa/` com Ctrl+Shift+R.
2. Conferir o ícone de relatório no topo. Entrar como operador e conferir que ele não aparece.
3. Gerar o **Mês anterior** e abrir o PDF.
4. Conferir 2 ou 3 dias do PDF contra os PDFs de fechamento desses dias.

## Reverter

1. Frontend: `git revert` do merge na main (o Cloudflare republica).
2. Apps Script: no editor, Implantar > Gerenciar implantações > editar cada implantação (V2 e V3) e escolher a versão anterior (V2 @24, V3 @25).
