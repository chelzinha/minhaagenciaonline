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

## Aplicativo Curva ABC

A rota independente `/curva` apresenta a análise da carteira dos últimos 12 meses. O frontend fica em `frontend/curva/` e a fonte é servida pelo endpoint Apps Script `get_curva_abc_v1`.

O ID da planilha gerencial não faz parte do código. Consulte `docs/APPS_SCRIPT.md` para configurar a fonte por Script Properties.
