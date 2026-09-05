# Backend Logística

**Module ID:** `logistica`  
**Tipo:** técnico compartilhado / logística reversa  
**Backend:** `apps-script/logistica`  
**Consumidores conhecidos:** `/reverso`, `/reverso-admin`, `/reverso-coleta`, `/reverso-expedicao`  
**Dados sensíveis:** SIM

## 1. Finalidade

Centralizar regras e persistência da família de Logística Reversa.

## 2. Distinção arquitetural

Não confundir este backend com o módulo visual `/intra/logistica`, que apresenta capacidade por janela e rotas. Qualquer vínculo entre os dois precisa ser confirmado antes de compartilhar código ou dados.

## 3. Regras críticas

- transições de estado devem validar estado atual;
- leituras repetidas não devem gerar duplicidade;
- ações de coleta/expedição precisam de idempotência quando aplicável;
- escritas concorrentes devem avaliar `LockService`;
- permissões devem considerar perfil, módulo e unidade/ownership.

## 4. Segurança

**Atenção sensível.** Pode envolver CPF, telefone, endereços, etiquetas, rastreios e histórico operacional. Logs devem ser sanitizados.

## 5. Performance

- leitura/escrita em lote;
- listas paginadas/filtradas;
- não carregar histórico completo para operação móvel;
- cache apenas de configuração segura;
- respostas específicas por submódulo.

## 6. Testes mínimos

- criação/consulta de devolução;
- transições válidas/inválidas;
- leitura duplicada;
- concorrência;
- permissão por perfil/unidade;
- histórico;
- falha de integração;
- logs sem PII desnecessária.

## 7. Pendências

- mapear arquivos, actions e planilhas;
- documentar máquina de estados;
- registrar chaves primárias;
- identificar triggers/webhooks;
- documentar estratégia de rollback.