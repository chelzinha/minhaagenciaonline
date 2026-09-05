# Base Cliente Etiquetas

**Module ID:** `base-cliente-etiquetas`  
**Tipo:** técnico compartilhado / dados de clientes e etiquetas  
**Backend:** `apps-script/base-cliente-etiquetas`  
**Consumidores:** NÃO MAPEADOS integralmente nesta baseline  
**Dados sensíveis:** SIM

## 1. Finalidade

Servir como camada de apoio para relacionamento entre clientes, configurações e fluxos de etiquetas.

## 2. Situação documental

A pasta existe na `main`, mas o mapa antigo não detalhava consumidores, planilhas ou actions. Portanto, esta baseline registra apenas o que é seguro afirmar e mantém os vínculos como não confirmados.

## 3. Segurança

**Atenção sensível.** Pode conter dados cadastrais, contratos, configurações de postagem e vínculos operacionais. Não documentar IDs privados, tokens ou dados reais.

## 4. Performance

Como serviço de base, deve priorizar:

- leitura em lote;
- índices/Maps por chave;
- respostas específicas por consumidor;
- cache somente para configuração pouco mutável;
- evitar carregar toda a base para consultas pontuais.

## 5. Testes mínimos

- consulta por chave;
- cliente inexistente;
- cabeçalhos fora de ordem;
- dados vazios/null;
- grande volume;
- permissão/isolamento quando aplicável.

## 6. Pendências

- mapear funções/actions;
- identificar planilhas e abas;
- identificar consumidores reais;
- definir chave primária e contratos de saída;
- decidir se permanece serviço independente ou parte formal do módulo Etiquetas.