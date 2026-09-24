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

O Cadastro de Clientes (`/cadastros/`) está em PR de implementação. Seu Worker foi enviado à Cloudflare, mas o endereço público e a rotina de importação ainda não foram ativados; o D1 está vazio. A tela de preview não exibe dados reais até essa ativação. Ver `docs/modulos/cadastros/README.md`.

O módulo `/cadastros/` padroniza identidades recebidas do Atende. Regras, estado de publicação e API: `docs/modulos/cadastros/README.md`.

## Regra de trabalho

Este repositorio e a fonte viva do codigo tecnico.

Toda alteracao relevante deve atualizar documentacao, changelog e gerar commit.
