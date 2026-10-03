# agf-mural-api

Worker do Portal Interno vivo (rota `/agf`): mural de recados, aniversários da equipe, elogios e agenda da agência. Também fornece os feriados usados no contador de dias úteis do topo.

## Recursos

| Item | Valor |
|---|---|
| Worker | `agf-mural-api` em `https://agf-mural-api.chelzinha.workers.dev` |
| Banco D1 | `agf-mural`, id `cb3d3ece-6198-4b0e-97cf-ca77307c617f` |
| Sessão | Validada no Apps Script de autenticação, com cache de 5 minutos |
| Front | `frontend/agf/index.html`, `portal.css`, `mural.js`, `mural-config.js` |

## Permissões

| Ação | Quem pode |
|---|---|
| Ler o painel, publicar recado, responder, curtir, elogiar | Qualquer usuário logado |
| Apagar recado, resposta ou elogio | Autor ou administrador |
| Fixar e desafixar recado | Administrador e gestor |
| Adicionar e remover itens da agenda | Administrador e gestor |
| Editar a lista de aniversários | Administrador |

Exclusão é sempre lógica (`excluido_em`). Toda escrita relevante fica em `mural_log`.

## Rotas

| Método | Caminho | Uso |
|---|---|---|
| GET | `/health` | Verificação sem login |
| GET | `/api/mural/painel` | Tudo que a página precisa em uma chamada |
| POST | `/api/mural/recados` | `{ texto, categoria, fixado }` |
| POST | `/api/mural/recados/:id/curtir` | Alterna a curtida |
| POST | `/api/mural/recados/:id/respostas` | `{ texto }` |
| POST | `/api/mural/recados/:id/fixar` | `{ fixado }` |
| POST | `/api/mural/recados/:id/excluir` | Exclusão lógica |
| POST | `/api/mural/respostas/:id/excluir` | Exclusão lógica |
| POST | `/api/mural/elogios` | `{ para, texto }` |
| POST | `/api/mural/elogios/:id/excluir` | Exclusão lógica |
| PUT | `/api/mural/aniversarios` | `{ lista: [{ nome, dia, mes }] }`, substitui a lista inteira |
| POST | `/api/mural/agenda` | `{ data, titulo, descricao, tipo, diaUtil }` |
| POST | `/api/mural/agenda/:id/excluir` | Exclusão lógica |

## Dia útil do topo

Conta segunda a sexta do mês atual, menos os itens da agenda com `tipo = feriado` e `dia_util = 0`. Ponto facultativo entra como feriado com `dia_util = 1` e continua contando. Feriados de 2026 e 2027 (nacionais, Ceará e Fortaleza) vêm na migração `0001`. Para 2028 em diante, cadastrar pela tela (Adicionar evento, tipo Feriado) ou por nova migração.

## Comandos

```powershell
cd C:\AGF-Codex\minhaagenciaonline\cloudflare\mural-api
```

```powershell
npm test
```

```powershell
npx wrangler deploy
```

## Reversão

1. Front: `git revert` do commit `feat(agf): Portal Interno vivo` na main. O Worker pode continuar no ar sem efeito.
2. Worker: `npx wrangler delete agf-mural-api` somente se o front já tiver sido revertido.
3. Banco: os dados ficam no D1 `agf-mural`. Não apagar sem exportar antes.
