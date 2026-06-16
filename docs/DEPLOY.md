# DEPLOY

## 1. Objetivo

Este documento registra o fluxo de publicacao do projeto minhaagenciaonline.

## 2. Status atual

O site www.minhaagenciaonline.com.br esta hospedado no Netlify.

Em 2026-06-16, o fluxo de deploy foi migrado de deploy manual para GitHub integrado ao Netlify.

## 3. Fluxo anterior

Antes da migracao:

1. O frontend era preparado localmente.
2. O deploy era feito manualmente no Netlify.
3. O GitHub nao era a fonte viva do codigo.

## 4. Fluxo atual

A partir da migracao:

1. O frontend fica versionado no GitHub.
2. O Netlify esta conectado ao repositorio chelzinha/minhaagenciaonline.
3. A branch de producao e main.
4. A pasta publicada e frontend.
5. Alteracoes enviadas para main podem gerar deploy automatico no Netlify.

## 5. Configuracao Netlify

Branch de producao: main

Publish directory: frontend

Build command: vazio

Arquivo de configuracao: netlify.toml

Conteudo esperado:

[build]
  publish = "frontend"

[dev]
  publish = "frontend"

## 6. Cuidados importantes

1. Nao fazer push direto na main sem revisar as alteracoes.
2. Preservar o frontend que esta funcionando.
3. Validar visualmente o site apos cada deploy.
4. Antes de mudancas maiores, criar branch de trabalho.
5. Nao subir tokens, senhas, chaves ou arquivos .env.
6. Nao substituir a pasta frontend sem backup ou validacao.

## 7. Checklist apos deploy

Verificar:

1. Pagina inicial abre.
2. CSS carrega corretamente.
3. Imagens e logos carregam.
4. Links principais funcionam.
5. Modulos principais abrem.
6. Nao ha pagina branca.
7. Nao ha erro 404 em arquivos principais.
8. Mobile continua utilizavel.

## 8. Registro da migracao inicial

Data: 2026-06-16

Tipo: Migracao de deploy manual para GitHub + Netlify

Repositorio: chelzinha/minhaagenciaonline

Dominio: www.minhaagenciaonline.com.br

Status: Deploy publicado com sucesso pelo Netlify apos inclusao do frontend no GitHub.
