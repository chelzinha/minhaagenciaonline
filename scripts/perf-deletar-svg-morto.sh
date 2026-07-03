#!/usr/bin/env bash
# AGF - remove o SVG morto de 351KB do /app (nao e referenciado em lugar nenhum)
# Rodar na RAIZ do repo. Reversivel com git antes do commit.
set -u
if [ ! -d ".git" ]; then echo "ERRO: rode na raiz do repo."; exit 1; fi
if git ls-files --error-unmatch frontend/app/assets/icon-app.svg >/dev/null 2>&1; then
  git rm --quiet frontend/app/assets/icon-app.svg && echo "removido: frontend/app/assets/icon-app.svg (351KB)"
else
  echo "(icon-app.svg ja ausente)"
fi
