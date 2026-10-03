# agf-mural-api

Worker do Portal Interno vivo (rota `/agf`): mural de recados, aniversários da equipe, elogios e agenda da agência. Também fornece os feriados usados no contador de dias úteis do topo e é a fonte única da foto de cada usuário (v1.1.0).

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
| Editar foto e aniversário de qualquer usuário (em Usuários internos) | Administrador |
| Trocar a própria foto (menu do avatar no topo) | O próprio usuário |

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
| PUT | `/api/mural/aniversarios` | Lista antiga por nome. Sem tela desde a v1.1.0, mantida por compatibilidade |
| GET | `/api/mural/avatares?u=a,b` | Fotos por login, com versão, para o cache do Portal |
| GET, PUT | `/api/mural/eu/avatar` | Foto do próprio usuário (topo padrão) |
| GET | `/api/mural/perfis` | Admin: todos os perfis com foto e aniversário |
| POST | `/api/mural/perfis/sincronizar` | Admin: `{ usuarios: [{ username, nome, ativo }] }`, chamado por Usuários internos a cada carga |
| PUT | `/api/mural/perfis/:username` | Admin: `{ nome, ativo, dia, mes, avatar? }`. Sem `avatar` mantém a foto; `avatar: ''` remove |
| POST | `/api/mural/agenda` | `{ data, titulo, descricao, tipo, diaUtil }` |
| POST | `/api/mural/agenda/:id/excluir` | Exclusão lógica |

## Perfil da equipe (v1.1.0)

1. Tabela `equipe_perfis` (migração `0002`): um registro por login, com nome, situação, aniversário (dia e mês) e foto.
2. Cadastro em Usuários internos, seção Perfil na equipe (`frontend/agf/usuarios/perfil-equipe.js`).
3. Foto: data URL JPEG 128px, até 60 mil caracteres. O topo padrão (v1.2.1) lê daqui e mantém cópia no Apps Script. Foto que só existe no Apps Script é copiada para cá no primeiro acesso da pessoa.
4. Aniversários do Portal: perfis ativos com data. A lista antiga por nome continua aparecendo só para quem ainda não tem perfil com data.

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
