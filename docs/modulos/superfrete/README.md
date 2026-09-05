# Minhas Postagens - Portal do Cliente SuperFrete

**Module ID:** `superfrete`  
**Tipo:** cliente externo  
**Rota:** `/superfrete`  
**Frontend:** `frontend/superfrete`  
**Backend:** NÃO CONFIRMADO; integra-se ao domínio SuperFrete/etiquetas  
**Dados sensíveis:** SIM  
**Status de produção:** NÃO CONFIRMADO

## 1. Finalidade

Portal do cliente para operação baseada no projeto SuperFrete AGF, com login próprio, visão financeira/resumo da conta e fluxos de etiquetas/postagens.

## 2. Evidências confirmadas no repositório

O diretório `frontend/superfrete` possui README próprio e cliente de API. A documentação existente registra login por `sfClientLogin` e dashboard com dados do cliente, saldo, limite e disponível.

## 3. Fluxo conceitual

```text
Cliente
↓
Login SuperFrete
↓
Dashboard da conta
↓
Operações de postagem/etiqueta
↓
Histórico e documentos
```

## 4. Segurança

**Atenção sensível.** Pode envolver saldo, limite, movimentações, dados cadastrais, etiquetas e documentos fiscais. Escritas financeiras ou consumo de carteira precisam de `LockService`/idempotência no backend quando houver concorrência.

## 5. UX/UI

Deve manter linguagem de cliente externo, feedback claro de saldo/operação, erros humanos e fluxo mobile-first.

## 6. Testes mínimos

- login e sessão;
- dashboard com dados corretos do cliente autenticado;
- isolamento entre clientes;
- emissão sem gravação parcial;
- histórico/documentos;
- erro de saldo/limite;
- mobile.

## 7. Pendências

- confirmar backend Apps Script exato;
- confirmar actions e planilhas;
- confirmar vínculo com `apps-script/etiquetas`;
- confirmar status real de produção e política de conta corrente.