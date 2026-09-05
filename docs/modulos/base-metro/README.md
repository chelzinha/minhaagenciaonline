# Base Metro

**Module ID:** `base-metro`  
**Tipo:** técnico compartilhado / dados e regras comerciais  
**Backend:** `apps-script/base-metro`  
**Consumidores conhecidos:** CRM e visões internas relacionadas  
**Dados sensíveis:** SIM

## 1. Finalidade

Concentrar parte relevante das regras, consultas e operações de dados usadas pelo CRM e por módulos internos ligados à carteira/comercial.

## 2. Evidências conhecidas

O backend contém rotinas de CRM, incluindo configuração de locais e boot otimizado. A documentação de performance registra `base-metro` como área crítica para eliminar leituras célula a célula.

## 3. Papel arquitetural

Por atender mais de uma tela, deve ser tratado como serviço compartilhado e não como “código interno do CRM” sem contrato.

## 4. Performance

Obrigatório revisar:

- `getValue/setValue` em loops;
- leituras/escritas em lote;
- `openById` repetido;
- Maps para joins;
- endpoints de boot/resumo;
- cache seguro;
- histórico sob demanda.

## 5. Segurança

**Atenção sensível.** Pode manipular dados de clientes/prospects, contatos, agenda e informações comerciais. Logs devem evitar PII e payloads brutos.

## 6. Testes mínimos

- boot do CRM v4/v3/fallback;
- configuração de locais;
- CRUDs usados pelo CRM;
- permissões;
- grande volume;
- ausência de regressão em cabeçalhos/índices;
- logs sanitizados.

## 7. Pendências

- inventariar arquivos/funções e quais continuam ativos;
- mapear planilhas/abas/cabeçalhos;
- separar contratos por consumidor;
- registrar funções legadas e candidatas a desativação sem removê-las prematuramente.