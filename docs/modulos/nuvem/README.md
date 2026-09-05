# Minhas Postagens Nuvemshop

**Module ID:** `nuvem`  
**Tipo:** cliente externo / integração e-commerce  
**Rota:** `/nuvem`  
**Frontend:** `frontend/nuvem`  
**Backend:** `apps-script/nuvemshop`  
**Dados sensíveis:** SIM  
**Status de produção:** NÃO CONFIRMADO nesta baseline

## 1. Finalidade

Integrar pedidos pagos da Nuvemshop ao fluxo de geração de etiquetas e disponibilizar histórico/retorno operacional ao lojista.

## 2. Rotas internas confirmadas

- `/nuvem/#/pedidos`
- `/nuvem/#/revisar/:orderId`
- `/nuvem/#/emitidas`
- `/nuvem/#/conta`

## 3. Arquivos principais

`frontend/nuvem/index.html`, `js/config.js`, `js/api.js`, `js/app.js`, `js/router.js`, `js/ui.js`, `js/screens/pedidos.js`, `js/screens/historico.js`, `styles/base.css` e `styles/screens.css`.

## 4. Fluxo

```text
Lojista
↓
Login do módulo
↓
Sincronização de pedidos Nuvemshop
↓
Filtro de pedidos elegíveis
↓
Revisão de postagem
↓
Geração de etiqueta
↓
Histórico / rastreio / retorno
```

## 5. Regras conhecidas

- pedidos sem pagamento confirmado ou cancelados não devem ser elegíveis;
- sincronização deve trabalhar em lote controlado;
- nomes das actions, rotas hash, IDs e chaves locais não devem ser alterados sem mapeamento.

## 6. Segurança

**Atenção sensível.** OAuth, access tokens, webhooks, dados de pedidos, clientes, endereços e rastreios exigem proteção. O Plano Mestre determina migração de `ACCESS_TOKEN` para armazenamento seguro em `PropertiesService` ou equivalente, sem exposição em planilha, frontend, logs ou documentação.

## 7. Performance

- evitar importar volume desnecessário por sincronização;
- retornar JSON enxuto;
- não recarregar pedidos históricos na abertura sem necessidade;
- revisar cache e paginação conforme volume.

## 8. Testes mínimos

- login/sessão/logout;
- sincronização;
- pedido pago elegível;
- pedido cancelado/não pago bloqueado;
- revisão de peso/dimensões/serviço;
- emissão;
- histórico, PDF, rastreio e WhatsApp;
- ausência de token em logs/erros;
- mobile 390px/430px.

## 9. Pendências

- confirmar estado real da correção de armazenamento do token;
- mapear planilha `STORES` e demais abas sem registrar segredos;
- confirmar webhooks ativos;
- confirmar ambiente de produção/homologação.