# Grupos comerciais (Cadastro de Clientes e CRM)

Versão de 02/10/2026. Motor do CRM `crm-1.3.0`, migração `0107_grupos_comerciais.sql`.

## 1. Objetivo

Vários cadastros do Portal Postal (ou remetentes) podem ser, comercialmente, um único cliente. Exemplo da base real: ASSOCIACAO SHALOM tem 6 cadastros (setores e projetos). Separados, o CRM mostrava faturamento partido, última postagem errada e alertas falsos (Resgatar e Converter para setores de um cliente ativo).

O grupo comercial soma esses cadastros num cliente só, **somente no CRM**.

## 2. Regras

1. Nada muda no cadastro. Nome, ID e postagens de cada cadastro (`cid_*`) continuam iguais. O Visão 360 (`/atende`) não é tocado.
2. Um cadastro só pode estar em um grupo. Garantido pelo banco: `crm_grupo_membros.cliente_id` é chave primária.
3. LOCAL do grupo é independente do LOCAL de cada cadastro: LOCAL com maior percentual de postagens do grupo (todos os cadastros somados). Empate fica com o LOCAL do cadastro principal. Pode ser fixado manualmente no editor do grupo. O LOCAL define só a carteira: quem trata o cliente e em qual curva ele entra.
4. Métricas do grupo somam as postagens de **todos os LOCAIS** (faturamento 30D e 31-60D, valor e objetos totais, última postagem, curva e ação). Exceção à regra geral do CRM, em que o cliente sem grupo usa só as postagens do LOCAL da carteira. Na Curva ABC 12M o grupo aparece só na curva do LOCAL dele, com o total de todos os LOCAIS (não se repete na curva dos outros). Ações da carteira (Raio-X) continua filtrando pelo LOCAL da postagem.
5. No CRM o grupo usa o ID do cadastro principal. Tratativas, agenda, checklists, notas e interações dos outros cadastros passam para o principal. O cadastro manual do CRM (WhatsApp, CNPJ etc.) de cada membro fica intacto; o contato do grupo é o do principal.
6. O nome exibido no CRM é sempre o nome do grupo (vence o nome manual do CRM).
7. Desfazer o grupo devolve cada cadastro ao CRM separado. O que foi registrado no CRM enquanto era grupo fica no cadastro principal.
8. Se a limpeza do Cadastro juntar um membro com outro ID, o ID que ficou herda o lugar no grupo (se já estiver em outro grupo, continua lá). Grupo que ficar com menos de 2 cadastros existentes aparece separado no CRM e com aviso no `/cadastros`.

## 3. Onde aparece

### /cadastros (admin)

- Card "Grupos comerciais" no resumo e visão "Grupos comerciais" ao lado de "Mais de um LOCAL".
- Lista de grupos: números do CRM (Fat. 30D, valor e objetos de todos os LOCAIS, última postagem, Curva 30D e ação), barra de postagens por LOCAL e quebra por cadastro.
- Editor: nome, cadastros (busca com bloqueio de quem já está em outro grupo), principal, LOCAL automático ou fixado, prévia.
- Sugestões de grupo, com "Criar grupo", "Adicionar ao grupo" e "Não são o mesmo" (não volta; dá para desfazer na hora).
- Ficha do cadastro: seção "Grupo comercial" com Abrir grupo, Editar grupo, Tirar deste grupo ou Incluir em grupo.
- Lista de clientes: selo com o nome do grupo.

### /crm

- Cadastro: linha única do grupo com selo `GRUPO · n` e botão para abrir os cadastros somados (Fat. 30D, dias sem postar e contrato de cada um). A busca também acha o grupo pelo nome de qualquer cadastro.
- Curva ABC 12M e Ações da carteira (Raio-X): postagens dos cadastros somadas na linha do grupo.
- Ficha: seção "Grupo comercial" com a participação de cada cadastro.
- Dashboard, Funil e Agenda: o grupo entra como um cliente só.

## 4. Sugestões automáticas

| Motivo | Regra | Confiança |
|---|---|---|
| Mesmo nome-base | Clientes do Portal com o mesmo nome antes de " (" ou " - " (sem LTDA, ME, SA) | 85 |
| Mesmo contrato e nome parecido | Contrato usado por 2 a 4 cadastros, 90% ou mais por um cliente do Portal, e os outros com uma palavra do nome em comum | 75 |
| Mesmo início de nome | Clientes do Portal com as 2 primeiras palavras iguais (ignora DE, DA, letras soltas) | 60, "conferir" |

Contrato sozinho não vira sugestão. Na base real de 02/10/2026 ele juntaria clientes diferentes (COMPANHIA ENERGETICA DO ESTADO DO CEARA com escritório de advocacia; VIVARA com pessoas físicas).

## 5. API (Worker agf-cadastros-api, somente admin)

| Rota | Uso |
|---|---|
| `GET /api/v2/grupos?q=&local=` | Lista com membros e números do CRM (`crm.emDia` indica se o CRM já está com a versão atual do grupo) |
| `POST /api/v2/grupos/salvar` | `{ id?, nome, membros: [ids], principalId, localModo: AUTO/AGF/BALCAO/METRO }`. Erros 409 com `codigo`: `JA_EM_GRUPO`, `CADASTRO_SUMIU` |
| `POST /api/v2/grupos/desfazer` | `{ id }` |
| `GET /api/v2/grupos/sugestoes` | Sugestões calculadas na hora (até 200) |
| `POST /api/v2/grupos/sugestoes/rejeitar` e `/restaurar` | `{ chave }` |

Salvar e desfazer recalculam o CRM na hora (cerca de 4 s). Se o recálculo falhar, o grupo fica gravado e o cron de 10 min recalcula (`crm_pendente`). Toda alteração gera evento em `crm_eventos` (`ENTIDADE_TIPO = 'GRUPO'`).

`GET /api/v2/clientes/:id` passa a trazer `grupo`; `GET /api/v2/busca` traz `grupo_id`, `grupo_nome`, LOCAIS e valor; `GET /api/v2/resumo` traz `grupos`.

No CRM (`get_cadastro_v5`), o cliente traz `grupoId`, `grupoNome`, `grupoMembros`, `grupoLocalModo`, `grupoLocalPct`. Em `crm_metricas.dados`: `GRUPO_ID`, `GRUPO_NOME`, `GRUPO_MEMBROS`, `GRUPO_LOCAL_MODO`, `GRUPO_LOCAL_PCT`, `GRUPO_POSTAGENS_POR_LOCAL`, `GRUPO_SOMA_LOCAIS = 'SIM'`, `POSTAGENS_DO_LOCAL = 'TODOS'` e `POSTAGENS_OUTROS_LOCAIS` (objetos de outros LOCAIS somados). Em `GRUPO_MEMBROS`, `postagensFora` = objetos do cadastro em outro LOCAL (somados).

## 6. Código

- `cloudflare/cadastros-api/src/grupos.js`: regras, motor, API e sugestões.
- `src/crm_persistencia.js`: aplica os grupos antes do motor do CRM.
- `src/crm/fundir.js`: `statementsMoverCrm` (grupos) e grupo acompanhando a junção de IDs.
- `src/crm/carteira.js` e `src/crm/acoes.js`: Curva ABC e Raio-X somam por grupo.
- `frontend/cadastros/cadastros-grupos.js` (+ `cadastros.css`, `index.html`, ponte `window.AGF_CAD` em `cadastros.js`).
- `frontend/crm/crm-integrado.js` e `.css` (cache v=8).
- Testes: `test/grupos_d1.test.mjs` (SQLite com as migrações reais), dentro de `npm run test:crm`.

## 7. Voltar atrás

- Um grupo: "Desfazer grupo" no `/cadastros`.
- Tudo: `npx wrangler rollback` no Worker e reverter o merge no front. As tabelas novas podem ficar: o código antigo não lê.
