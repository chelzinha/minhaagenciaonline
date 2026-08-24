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

## CENTRAL AGF

A arquitetura de dados postais em homologacao fica documentada em `docs/CENTRAL_AGF_DADOS.md` e implementada em `apps-script/central-agf`.

Versao atual do Motor V1 na branch `feat/central-agf-motor-v1`: `v0.7.0`.

O fluxo atual audita o historico mensal, diagnostica identidades, gera previa/revisao assistida e consolida um lote seguro de candidatos antes de qualquer escrita em `CADASTRO_MESTRE_CLIENTES!01_CLIENTES_MASTER`.

A v0.7.0 ainda nao cria `CLIENTE_ID`, nao altera fatos mensais e nao substitui o processamento atual Atende + Consolidador.

## Regra de trabalho

Este repositorio e a fonte viva do codigo tecnico.

Toda alteracao relevante deve atualizar documentacao, changelog e gerar commit.