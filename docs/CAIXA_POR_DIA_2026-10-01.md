# Caixa Balcão - caixa por dia (01/10/2026)

Base: `origin/main` com o Caixa igual ao commit 5bf5ba3 (ajustes de 23/09/2026).

## Funcionamento

1. O topo do Caixa tem um seletor de dia: setas de dia anterior e próximo dia e um botão com a data, que abre o calendário.
2. Ao escolher um dia anterior, o Caixa inteiro passa a operar naquele dia: Lançar, Mov., Fechar, fechamento complementar e PDFs.
3. Uma faixa laranja indica "Caixa de dd/mm/aaaa" com o botão **Hoje** para voltar.
4. Datas futuras não são aceitas.

## Regras de dia anterior

| Ação | Dia anterior |
|---|---|
| Consultar Mov., totais, fechamento e PDFs | Liberado para todos com acesso ao Caixa |
| Lançar Pix Infinity e cartões (Atender, Avulso, Lote) | Liberado |
| Lançar em Dinheiro (receita ou despesa) | Bloqueado |
| Gerar Pix Santander (QR) | Bloqueado |
| Confirmar ou cancelar Pix Santander pendente | Liberado |
| Excluir lançamento não consolidado | Liberado, exceto lançamento em Dinheiro |
| Sangria e sangria no fechamento | Bloqueado |
| Ajuste de saldo inicial | Bloqueado |
| Fechamento e fechamento complementar | Liberado (sem sangria) |

Motivo do bloqueio de dinheiro: qualquer alteração de dinheiro em dia passado mudaria o que ficou na gaveta e o saldo inicial de todos os dias seguintes.

## Auditoria

Toda alteração em dia anterior (lançamento, lote, exclusão, fechamento, confirmação de Pix) é registrada na aba `Auditoria_Retroativa` da planilha do Caixa, criada automaticamente: data/hora real, dia do caixa, unidade, usuário, ação, identificador, valor e detalhe.

No Mov., um lançamento feito em outro dia mostra a data real ao lado do horário (ex.: `30/09 14:03`).

Conta Azul: a data de competência é o dia do caixa escolhido.

## Implementação

- Frontend envia `workDate` em todas as chamadas (`app-v2.js` e `v21-safe-patch.js`).
- Backend (`26_CAIXA_Dia_Trabalho.js`): o router valida `workDate` e `v2Today_()` passa a devolver o dia de trabalho dentro da requisição. Todas as rotinas existentes passam a operar no dia escolhido sem duplicar regra.
- Bloqueios no backend: `caixaAssertRetroAllowed_` (router), `caixaAssertRetroPayment_` (validação do lançamento), `caixaAssertDeleteAllowed_` (exclusão).
- Gatilhos e funções rodadas no editor não recebem `workDate` e continuam usando o dia real.

## Arquivos

Backend: `01_Config_Router.js`, `09_V2_Library_Entries.js`, `12_V2_Pdf_Utils.js`, novo `26_CAIXA_Dia_Trabalho.js`.
Frontend: `frontend/caixa/index.html`, `frontend/caixa-avista/app.js`, `app-v2.js`, `v21-safe-patch.js`, `unit-selector.js`, `styles-v2.css`.
