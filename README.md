# Minha Agencia Online

Projeto tecnico da Plataforma Digital AGF Jose Bonifacio.

Dominio principal:
www.minhaagenciaonline.com.br

Hospedagem oficial do frontend:
Cloudflare

Regra de deploy:
consultar `docs/DEPLOY.md`. Netlify nao e o destino de producao do frontend principal.

## Objetivo

Organizar os modulos digitais da AGF, incluindo frontends, Apps Script, documentacao tecnica, previews e releases.

## Estrutura principal

- frontend/
- apps-script/
- docs/
- previews/
- releases/
- cloudflare/cadastros-api/ — base D1 de identidade de clientes

O Cadastro de Clientes (`/cadastros/`) está no PR #68. O Worker e o cron estão ativos; a primeira importação do Atende foi concluída e conferida; falta validar o uso administrativo antes do merge. A tela está no preview da branch, sem publicação na `main`. Ver `docs/modulos/cadastros/README.md`.

O módulo `/cadastros/` padroniza identidades recebidas do Atende. Regras, estado de publicação e API: `docs/modulos/cadastros/README.md`.

## Regra de trabalho

Este repositorio e a fonte viva do codigo tecnico.

Toda alteracao relevante deve atualizar documentacao, changelog e gerar commit.
