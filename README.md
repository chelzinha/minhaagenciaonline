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

## Modulo Atende

O backend Apps Script do `/atende` fica em `apps-script/atende/`.

Ele importa JSONs do Correios Atende, cruza atendimentos e objetos captados por codigo de objeto postal e alimenta a aba `Postagens`, que e consumida pelo painel atual.
