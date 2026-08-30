# Caixa à Vista V1 - Apps Script

Backend novo e independente do caixa legado.

## Segurança e isolamento

- não reutiliza as planilhas do caixa atual;
- não contém IDs, chaves Pix ou segredos no código;
- valida a sessão AGF pelo gate JWT;
- permite migração gradual de `monitor` para `enforce`;
- usa `LockService` em todas as gravações concorrentes;
- mantém histórico completo, sem rotação diária destrutiva.

## Configuração inicial

1. Crie um novo projeto Apps Script.
2. Adicione `00_AGF_AUTH_GATE.js`, `Code.js` e `appsscript.json`.
3. Execute `setupCaixaAvista()` manualmente uma vez.
4. Autorize o acesso ao Google Sheets.
5. Confira no log a URL da nova planilha criada.
6. Em Propriedades do script, configure:

| Propriedade | Obrigatória | Conteúdo |
|---|---:|---|
| `CAIXA_AVISTA_SPREADSHEET_ID` | automática | criada por `setupCaixaAvista()` |
| `CAIXA_AVISTA_PIX_KEY` | sim para Pix | chave Pix |
| `CAIXA_AVISTA_PIX_NAME` | sim para Pix | nome do recebedor, até 25 caracteres |
| `CAIXA_AVISTA_PIX_CITY` | sim para Pix | cidade, até 15 caracteres |
| `AGF_AUTH_JWT_SECRET` | sim | mesmo segredo do projeto AGF_AUTH |
| `AGF_API_AUTH_MODE` | sim | começar com `monitor`; depois usar `enforce` |
| `CAIXA_AVISTA_ACCOUNT_CASH` | opcional | padrão `CAIXA À VISTA` |
| `CAIXA_AVISTA_ACCOUNT_PIX` | opcional | padrão `SANTANDER AGUANAMBI` |
| `CAIXA_AVISTA_ACCOUNT_CARD` | opcional | padrão `Cloudwalk Instituição de Pagamento` |
| `CAIXA_AVISTA_COST_CENTER` | opcional | padrão `Metro (Projeto Rachel)` |

7. Publique como Web App:
   - executar como usuário que fez a implantação;
   - acesso para qualquer pessoa;
   - segurança efetiva feita pelo gate JWT.
8. Copie a URL `/exec` para a tela Configurações do novo frontend.

## Abas criadas

- `Clientes`
- `Lancamentos`
- `Fechamentos`
- `Export_ContaAzul_Receitas`
- `Export_ContaAzul_Despesas`
- `_Export_Control`

## Exportação Conta Azul

As abas de exportação mantêm os mesmos 32 cabeçalhos usados pelo caixa atual. O nome do cliente passa a ser o nome selecionado no atendimento.

A exportação acontece somente no fechamento operacional. Isso cria um snapshot imutável e evita que edição ou exclusão posterior deixe o financeiro divergente.

A aba `_Export_Control` impede exportação duplicada de um mesmo `entry_id` em caso de repetição do fechamento.

## Fechamento

### Operacional

- total de receitas;
- total de despesas;
- saldo;
- Pix pendente;
- dinheiro esperado;
- Pix confirmado esperado;
- geração das linhas de exportação;
- bloqueio dos lançamentos fechados.

### Conferência financeira

- dinheiro contado;
- Pix localizado na conta;
- diferença de dinheiro;
- diferença de Pix;
- observações;
- usuário e horário.

## Lote

O frontend valida todas as linhas antes de enviar. O backend valida novamente e grava as linhas financeiras em um único `setValues`.

Formato:

```text
cliente;valor;pagamento;objetos
Loja Raquel Moda;150,00;PIX;3
Cliente de Balcão;50,00;Dinheiro;1
```

Pix inserido em lote é tratado como confirmado, pois o lote é destinado ao registro de recebimentos já conhecidos.

## Rollback

- não alterar `/caixa/`;
- remover ou ignorar a URL do novo backend no frontend;
- manter `AGF_API_AUTH_MODE=off` apenas em emergência e por tempo limitado;
- como a base é separada, o caixa legado continua disponível durante toda a homologação.
