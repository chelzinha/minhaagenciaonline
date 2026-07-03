#!/usr/bin/env bash
#
# AGF - Higiene do repositorio (F11 da auditoria)
# ------------------------------------------------------------
# O QUE ESTE SCRIPT FAZ (tudo via git, reversivel com git restore/git reset):
#   1. Remove um arquivo-lixo da raiz (saida de 'git branch' commitada por engano).
#   2. Remove a Netlify Function morta 'reversa.js' e o netlify.toml que so ela usava.
#      (O deploy real usa o netlify.toml da RAIZ, com publish="frontend"; o
#       frontend/netlify.toml e ignorado pelo Netlify, entao a function nunca sobe.)
#   3. Move os 9 previews do CRM para /previews/crm/ (fora da pasta publicada).
#   4. Move os READMEs/LEIA-ME do frontend para /docs/legado-frontend/
#      (mantem historico, tira do site publico).
#
# COMO USAR:
#   1. Abra um terminal na RAIZ do repositorio.
#   2. Rode:  bash scripts/f11-higiene-repo.sh
#   3. Revise com:  git status   e   git diff --staged --stat
#   4. Se aprovar, faca o commit sugerido no fim.
#   5. Para desfazer ANTES do commit:  git reset && git restore --staged . && git checkout -- .
#
# Seguro: cada acao verifica se o alvo existe antes de agir. Nada e apagado
# de forma definitiva - git guarda tudo ate o commit e depois no historico.

set -u

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script na RAIZ do repositorio (onde fica a pasta .git)."
  exit 1
fi

echo "== 1. Removendo arquivo-lixo da raiz =="
# O nome contem um caractere Unicode invisivel; localizamos pelo inicio do nome
# e removemos pelo caminho literal (git rm com o nome exato).
LIXO="$(python3 - <<'PY'
import os
for f in os.listdir('.'):
    if f.startswith('ca do funil na mesma linha'):
        print(f)
        break
PY
)"
if [ -n "$LIXO" ]; then
  git rm --quiet -- "$LIXO" && echo "  removido: (arquivo-lixo da raiz)"
else
  echo "  (nada a remover - arquivo ja ausente)"
fi

echo "== 2. Removendo Netlify Function morta =="
if git ls-files --error-unmatch frontend/netlify/functions/reversa.js >/dev/null 2>&1; then
  git rm --quiet frontend/netlify/functions/reversa.js && echo "  removido: frontend/netlify/functions/reversa.js"
else
  echo "  (reversa.js ja ausente)"
fi
if git ls-files --error-unmatch frontend/netlify.toml >/dev/null 2>&1; then
  git rm --quiet frontend/netlify.toml && echo "  removido: frontend/netlify.toml (config orfa da function morta)"
else
  echo "  (frontend/netlify.toml ja ausente)"
fi

echo "== 3. Movendo previews do CRM para /previews/crm/ =="
mkdir -p previews/crm
MOVED=0
for f in $(git ls-files 'frontend/crm/preview-*.html'); do
  base="$(basename "$f")"
  git mv "$f" "previews/crm/$base" && MOVED=$((MOVED+1))
done
echo "  previews movidos: $MOVED"

echo "== 4. Movendo READMEs/LEIA-ME do frontend para /docs/legado-frontend/ =="
mkdir -p docs/legado-frontend
DOCS=0
for f in $(git ls-files 'frontend/**' | grep -iE '/(readme|leia-me)[^/]*\.(md|txt)$'); do
  # achata o caminho para evitar colisao: frontend/app/README.md -> app__README.md
  flat="$(echo "$f" | sed 's#^frontend/##; s#/#__#g')"
  git mv "$f" "docs/legado-frontend/$flat" && DOCS=$((DOCS+1))
done
echo "  documentos movidos: $DOCS"

echo ""
echo "== RESUMO =="
git status --short | sed 's/^/  /'
echo ""
echo "Se aprovar, faca o commit:"
echo "  git commit -m \"chore: higiene do repo (lixo, function morta, previews e docs fora do publish)\""
echo ""
echo "Para DESFAZER antes do commit:"
echo "  git reset && git restore --staged . && git checkout -- ."
