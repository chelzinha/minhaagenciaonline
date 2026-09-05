# Serviço de Etiquetas

**Module ID:** `etiquetas`  
**Tipo:** técnico compartilhado / postagem  
**Backend:** `apps-script/etiquetas`  
**Frontends consumidores conhecidos:** `/app`, `/balcao`, SuperFrete e integrações relacionadas  
**Dados sensíveis:** SIM

## 1. Finalidade

Concentrar regras de cotação, emissão, histórico, destinatários e integrações de postagem usadas por diferentes experiências da Plataforma AGF.

## 2. Papel arquitetural

Este backend não deve ser confundido com uma única interface. Ele funciona como serviço compartilhado e, portanto, mudanças em action/contrato de resposta podem afetar vários módulos.

## 3. Integrações conhecidas/prováveis

- Correios/CWS;
- CEP;
- NF-e/DANFE;
- SuperFrete;
- Nuvemshop em fluxos específicos.

O vínculo exato por função deve ser confirmado no código antes de alterar.

## 4. Segurança

**Atenção sensível.** Pode envolver contratos/cartões dos Correios, tokens CWS, destinatários, endereços, rastreios, valores e documentos. Segredos devem ficar em `PropertiesService` ou armazenamento equivalente e nunca no frontend.

## 5. Concorrência e consistência

Usar `LockService` e idempotência quando duas requisições puderem:

- gerar IDs;
- emitir/baixar o mesmo objeto;
- alterar estado;
- registrar débito/consumo;
- gravar múltiplas abas relacionadas.

## 6. Performance

- leituras/escritas em lote;
- evitar `openById` repetido;
- Maps para joins;
- histórico paginado;
- cache apenas para dados seguros e pouco mutáveis;
- payloads enxutos.

## 7. Testes mínimos

- cotação;
- emissão normal/direta;
- cancelamento;
- reimpressão;
- histórico;
- rastreio;
- destinatários;
- falha de CWS;
- concorrência/duplicidade;
- erro sem exposição de segredo.

## 8. Pendências

- mapear arquivos/funções/actions do projeto;
- mapear planilhas/abas/cabeçalhos;
- identificar consumidores de cada action;
- documentar estratégia de rollback e idempotência.