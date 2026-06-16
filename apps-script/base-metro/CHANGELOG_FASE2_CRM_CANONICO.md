# Changelog — Fase 2 CRM Canônico

## Arquivos adicionados

- `05_CRM_CANONICO_FASE2.js`
- `README_FASE2_CRM_CANONICO.md`
- `CHANGELOG_FASE2_CRM_CANONICO.md`

## Arquivos alterados

### `00_CLIENTES_MASTER_FINAL.js`

- adiciona nomes das novas abas ao `OP_CFG`;
- amplia campos manuais preservados;
- protege rebuild de `CLIENTES_MASTER` com `LockService`;
- permite overlay cadastral opcional;
- permite incluir clientes cadastrados ainda sem histórico de postagem após ativação do overlay.

### `10_OPERACAO_EXECUCAO_API.js`

- adiciona endpoint `get_crm_config_v2`;
- sincroniza edições manuais do CRM para `CLIENTES_CADASTRO` em modo compatível;
- amplia leitura de blocos da agenda com parâmetros adicionais.

### `15_LIFECYCLE_ENGINE.js`

- impede que `NAO_ENCONTRADO` e `REAGENDADO` gravem novamente `VISITAR` como recomendação;
- ignora referências legadas `VISITAR` durante leitura das transições.

## Estruturas criadas

- `CLIENTES_CADASTRO`
- `CLIENTES_ACESSOS_APP`
- `CLIENTES_CREDENCIAIS_CWS`
- `CRM_TRATATIVAS`
- `CRM_FUNIS`
- `CRM_FUNIL_ETAPAS`
- `CRM_TIPOS_ATIVIDADE`
- `CRM_RESULTADOS_ATIVIDADE`
- `CRM_RESPONSAVEIS`
- `CRM_EVENTOS`
- `CRM_MIGRACAO_RELATORIO`

## Estruturas ampliadas sem remoção

- `AGENDA_EXECUCAO`
- `AGENDA_BLOCOS`
- `PROSPECTS`
- `CRM_VISITA_CHECKLIST`
- `CRM_INTERACOES`

## Fora do escopo desta fase

- frontend `/crm/`;
- remoção física de COLETAS;
- arquivamento da planilha `APP CRM Metrô`;
- troca definitiva da autenticação legada de Etiquetas;
- instalação de trigger de sincronização externa.
