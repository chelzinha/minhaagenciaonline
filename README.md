# Minha Agencia Online

Projeto tecnico da Plataforma Digital AGF Jose Bonifacio.

Dominio principal:
www.minhaagenciaonline.com.br

## Objetivo

Organizar os modulos digitais da AGF, incluindo frontends, Apps Script, documentacao tecnica, previews e releases.

## Estrutura principal

- frontend/
- apps-script/
- docs/
- previews/
- releases/

## Regra de trabalho

Este repositorio e a fonte viva do codigo tecnico.

Toda alteracao relevante deve atualizar documentacao, changelog e gerar commit.

## CENTRAL AGF

A arquitetura de dados postais e o Motor V1 ficam documentados em `docs/CENTRAL_AGF_DADOS.md` e `apps-script/central-agf/README.md`.

Estado atual da branch `feat/central-agf-motor-v1`: Motor V1 `v0.8.0`, com historico mensal auditado, diagnostico/previa de identidade, lote seguro homologado com zero conflitos residuais no baseline atual e proposta idempotente de `CLIENTE_ID` ainda somente leitura.

A branch permanece em homologacao e nao substitui o processamento atual. A v0.8.0 nao escreve em `01_CLIENTES_MASTER`, nao define Local principal automaticamente e nao altera os fatos mensais.