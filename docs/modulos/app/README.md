# Minhas Postagens

**Module ID:** `app`  
**Tipo:** cliente externo / SPA-PWA  
**Rota principal:** `/app`  
**Frontend:** `frontend/app`  
**Backend principal:** serviço Apps Script de etiquetas  
**Integração auxiliar:** Web App externo de NF-e/DANFE  
**Dados sensíveis:** SIM  
**Status de produção:** NÃO CONFIRMADO nesta baseline

## 1. Finalidade

Portal operacional do cliente para cotação, emissão de etiquetas, histórico, destinatários e configuração da conta.

## 2. Rotas internas confirmadas

- `/app/#/nova` - cotação e emissão;
- `/app/#/etiqueta` - etiqueta direta;
- `/app/#/sucesso` - resultado, preview, download e compartilhamento;
- `/app/#/historico` - histórico, reimpressão, cancelamento e rastreio;
- `/app/#/destinatarios` - cadastro, busca e importação;
- `/app/#/config` - conta, conexão e diagnóstico.

## 3. Arquivos principais

- `frontend/app/index.html`
- `frontend/app/js/config.js`
- `frontend/app/js/api.js`
- `frontend/app/js/app.js`
- `frontend/app/js/router.js`
- `frontend/app/js/ui.js`
- `frontend/app/js/nfe-import.js`
- `frontend/app/js/screens/*.js`
- `frontend/app/styles/*.css`
- `frontend/app/manifest.webmanifest`
- `frontend/app/service-worker.js`

## 4. Actions conhecidas

`ping`, `login`, `me`, `logout`, `cep`, `cotar`, `cotarTodos`, `criarEtiqueta`, `criarEtiquetaDireta`, `cancelarEtiqueta`, `reimprimirEtiqueta`, `listarHistorico`, `detalheEtiqueta`, `rastrearObjeto`, `buscarDestinatarios`, `listarDestinatarios`, `salvarDestinatario`, `excluirDestinatario`, `importarDestinatariosCsv`, `testarTokenCws`, `diagnostico` e `parseNfePdf` no Web App fiscal externo.

## 5. Fluxo

```text
Cliente
↓
Login próprio
↓
SPA /app
↓
Api.*
↓
Apps Script de etiquetas
↓
Correios/CWS + bases operacionais
```

A importação de NF-e usa serviço separado e deve devolver somente dados necessários para revisão pelo cliente.

## 6. Segurança

**Atenção sensível.** Pode envolver dados cadastrais, destinatários, endereços, rastreios, contrato/cartão dos Correios, valores, NF-e e credenciais CWS. Segredos não devem aparecer no frontend, logs ou documentação.

## 7. UX/UI

- mobile-first;
- inputs com fonte segura para evitar zoom no iOS;
- loading, toast e modal claros;
- bottom nav sem cobrir ações;
- importação de NF-e deve sempre orientar revisão antes da emissão.

## 8. Performance

Não carregar histórico completo ou cadastros desnecessários na abertura. Preferir respostas enxutas, paginação e dados sob demanda.

## 9. Testes mínimos

- login e sessão;
- cotação;
- criação de etiqueta;
- etiqueta direta;
- histórico/reimpressão/cancelamento;
- rastreio;
- destinatários e CSV;
- importação de NF-e;
- diagnóstico sem exposição de segredo;
- mobile 390px/430px.

## 10. Pendências

- confirmar projeto Apps Script exato e URL `/exec` em produção;
- mapear planilhas/abas e chaves primárias;
- confirmar status de produção e última versão publicada;
- confirmar política de cache/service worker atual.