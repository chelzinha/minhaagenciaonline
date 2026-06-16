# Rotina segura de trabalho

## 1. Regra principal

A branch main representa producao.

Nao fazer alteracoes diretas na main sem revisar e testar antes.

## 2. Fluxo recomendado

1. Atualizar a main local.
2. Criar uma branch de trabalho.
3. Fazer a alteracao na branch.
4. Testar localmente quando possivel.
5. Fazer commit.
6. Enviar a branch para o GitHub.
7. Validar preview no Netlify, quando disponivel.
8. So depois levar para producao.

## 3. Comandos base

Atualizar main:
git checkout main
git pull origin main

Criar branch:
git checkout -b tipo/nome-da-tarefa

Ver status:
git status

Adicionar arquivos:
git add .

Criar commit:
git commit -m "tipo: descricao curta da mudanca"

Enviar branch:
git push origin nome-da-branch

## 4. Tipos de commit

feat: nova funcionalidade
fix: correcao de bug
ui: ajuste visual
docs: documentacao
refactor: reorganizacao sem mudar comportamento
perf: melhoria de performance
security: dados, seguranca ou credenciais
chore: ajuste tecnico interno
deploy: publicacao ou configuracao de deploy

## 5. Cuidados antes de producao

1. Site abre normalmente.
2. CSS e imagens carregam.
3. Links principais funcionam.
4. Mobile continua utilizavel.
5. Nao ha pagina branca.
6. Nao ha erro 404 em arquivos principais.
7. CHANGELOG.md foi atualizado quando necessario.
8. Docs relacionados foram atualizados quando necessario.

## 6. Regra para mudancas sensiveis

Quando envolver dados pessoais, tokens, chaves, permissoes, credenciais, logs ou integracoes externas:

1. marcar como atencao sensivel;
2. nao expor segredo;
3. atualizar docs/SEGURANCA_E_DADOS.md;
4. atualizar docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md;
5. usar commit com prefixo security, se aplicavel.

## 7. Status

Documento criado na branch setup/rotina-segura.
