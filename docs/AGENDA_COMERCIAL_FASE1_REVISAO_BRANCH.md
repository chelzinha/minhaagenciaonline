# Agenda Comercial — Fase 1 — Gate de revisão da branch

**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Base:** `main`  
**Data:** 2026-08-29

## Estado antes do PR

- Branch à frente de `main` e sem commits pendentes de `main` no momento da revisão.
- Alterações restritas à Agenda Comercial, documentação relacionada e carregamento dos módulos da Fase 1 em `frontend/crm/config.js`.
- Nenhum deploy de frontend executado.
- Nenhum Apps Script publicado.
- Nenhum schema aplicado na planilha viva.
- Nenhum valor `APLICA_AVULSA` configurado na planilha viva.

## Arquivo legado de maior risco

`apps-script/base-metro/06_CRM_JORNADA_FASE3.js`

O diff contém alterações funcionais necessárias para AVULSA e remoção de comentários inline causada pela regravação do arquivo. O gate de regressão confirmou a permanência das funções críticas de Cliente/Prospect, mas este arquivo deve receber atenção prioritária na revisão do PR.

## Novos módulos isolados

- `apps-script/base-metro/17_CRM_AGENDA_AVULSA_FASE1.js`
- `frontend/crm/agenda-avulsa-fase1.js`
- `frontend/crm/agenda-dias-uteis-fase1.js`
- `frontend/crm/agenda-filtros-vencidas-fase1.js`

## Pendências antes de merge

1. Revisar o patch completo do PR.
2. Validar sintaxe/execução dos módulos em ambiente integrado.
3. Aplicar schema somente em etapa controlada de homologação.
4. Definir explicitamente quais tipos terão `APLICA_AVULSA=SIM` para a homologação funcional.
5. Testar atividades vinculadas para confirmar ausência de regressão.
6. Testar AVULSA desktop e 390px.
7. Confirmar que nenhuma operação AVULSA cria ou altera Tratativa, CRM_INTERACOES, CRM_EVENTOS, Cliente ou Prospect.
8. Consolidar documentação técnica geral antes do merge.

## Rollback

Enquanto não houver AVULSA real, a branch pode ser descartada sem migração de dados. Depois de existirem AVULSAS, rollback deve desabilitar criação (`APLICA_AVULSA=NAO`) mantendo backend/schema compatíveis para leitura dos registros existentes.
