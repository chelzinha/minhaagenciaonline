# Caixa Balcão — AGF José Bonifácio

Arquitetura estabilizada em 01/09/2026.

## Rota ativa

- Frontend: `/caixa-avista/`
- Hospedagem: Netlify
- Backend: Google Apps Script em `apps-script/caixa-avista`
- Autenticação: Portal AGF em `apps-script/autenticacao`
- Frontend ativo: `unit-selector.js -> app.js -> app-v2.js`

Os arquivos modulares antigos `app-*.js` que não fazem parte dessa cadeia são legado e não devem receber novas funcionalidades.

## Fluxo de acesso

1. Usuário entra pelo Portal AGF.
2. O token precisa conter o módulo `caixa`.
3. O backend exige autenticação em modo `enforce`.
4. `Biblioteca_Usuarios` define as unidades e permissões financeiras.
5. Usuário de uma unidade entra automaticamente.
6. Usuário de duas unidades escolhe e pode trocar a unidade no cabeçalho.

## Pagamentos de produção

Ativos:
- Dinheiro
- Pix Santander
- Débito Cielo
- Crédito Cielo
- Débito Infinity
- Crédito Infinity

Pix Infinity e Pix BTG ficam inativos.

Pix Santander:
- somente receita em modo Atender;
- não aceita lote;
- não aparece em despesas;
- BR Code estático com valor e TXID único;
- lançamento nasce PENDENTE;
- atendente precisa marcar que conferiu o crédito antes de confirmar;
- cancelamento é exclusão lógica auditada;
- cobrança pendente pode ser reaberta em Mov.;
- chave e recebedor vêm exclusivamente da planilha.

## Caixa físico

Dinheiro esperado:
saldo inicial + receitas em dinheiro - despesas em dinheiro - sangrias.

Pix e cartões nunca alteram o numerário físico.

## Fechamento

- bloqueado com Pix pendente;
- exige declaração;
- divergência exige justificativa;
- mostra confirmação final dos valores;
- usa a data do servidor (America/Fortaleza);
- grava fechamento, PDF e fila do Conta Azul sob lock;
- tenta processar a fila imediatamente e mantém trigger de retentativa.

## Conta Azul

A integração cria:
- receitas em Contas a Receber;
- despesas em Contas a Pagar.

Não realiza baixa automática. A baixa é manual no Conta Azul.

Por exigência da API do Conta Azul, cada evento usa uma única parcela técnica na condição de pagamento, com a mesma data do lançamento para competência e vencimento. Isso não representa parcelamento comercial.

Mapeamentos de contato, conta financeira, categoria e centro de custo vêm das bibliotecas do Caixa.

## Idempotência

Receitas, despesas, lotes e sangrias usam identificadores estáveis. Repetir uma requisição após timeout não deve criar duplicidade.

## Arquivos de estabilização

- `apps-script/caixa-avista/17_V2_Production_Stabilization.js`
- `apps-script/autenticacao/09_CAIXA_ACCESS_MIGRATION.js`

Execute as migrações somente após backup e antes da homologação final.
