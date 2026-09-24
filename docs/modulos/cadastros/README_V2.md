# Cadastro de Clientes v2 - ponte Atende para CRM

Refeito do zero. Nenhum código da v1 (PR #68) foi aproveitado. As tabelas da v1 ficam intactas no D1 até a aprovação da v2.

## Regra de identidade

1. CLIENTE PORTAL = BALCÃO, GAS SHOPPING METRO ou GAS SHOPPING CENTRO FASHION: a identidade vem do NOME REMETENTE limpo.
2. Qualquer outro CLIENTE PORTAL: a identidade é o próprio CLIENTE PORTAL, com o nome do Portal.
3. Dois clientes do Portal nunca viram um só.
4. Decisão humana vence o motor. "Não é o mesmo" vira restrição permanente.
5. LOCAL fica por postagem (regra do Atende). O cliente é único e os resultados saem separados por LOCAL.

## Limpeza automática (sem clique)

| Regra | Exemplo |
|---|---|
| Mesmo nome do Portal | remetente `DILOHAN COMERCIO ATACADISTA DE ROUPAS LTDA` vira o cliente do Portal |
| Nome cortado pelo sistema | `DILOHAN COMERCIO ATACADISTA DE` e `DONA LUIZA ... CALCADO` vão para o nome mais completo |
| Sem espaço ou pontuação | `KARINEPINHEIRO` = `Karine Pinheiro` |
| Mesmo CNPJ raiz no início | `53620099 TIAGO MALHAS DE FREIT` = `53620099 TIAGO MALHAS DE FREITAS ARAUJO` |
| Mesmas palavras | `ROBERTO PAULINO DE MEDEIROS` = `ROBERTO PAULINO MEDEIROS` |
| Erro de digitação mínimo (95%+, 3+ palavras) | `COMERCIAL MARIMAR DE AVIMENTOS` = `... AVIAMENTOS` |
| Decisão manual da planilha CADASTRO_MESTRE_CLIENTES | 1.400 grafias com VALIDACAO_LEGADO = MANUAL |

Normalização: maiúsculas, sem acento, codificação quebrada corrigida (`Ã_x0083_`, `ANTO¿NIO`), sufixo de caixa removido (`C19`), LTDA/ME/EPP/S.A ignorados na comparação, repetição removida (`KAIKAI PRESENTES KAIKAI PRESENTES`).

Nome final: Portal > nome corrigido à mão > planilha > mais palavras, nome inteiro vence o cortado, depois o mais usado.

## Sugestões (decisão humana)

Nome contido no outro (`AGNESRISTAU` para `AGNES PONTES RISTAU`), grafia parecida e casos com FILHO/JUNIOR/NETO. Travas: o primeiro nome tem que bater, iniciais soltas diferentes bloqueiam (`F & A` x `F W`). Grupos em estrela: um nome âncora com os parecidos, sem correntes que juntem pessoas diferentes.

## Arquitetura

- `cid_postagens`: 1 linha por postagem do Atende (somente leitura no Atende).
- `cid_grafias` -> `cid_nos` -> `cid_clientes`: a postagem aponta para a grafia, a grafia para o nó do motor, o nó para o cliente. Agrupar muda poucas linhas, nunca as 94 mil postagens.
- `cid_decisoes`: UNIR, SEPARAR e NOME, nunca apagadas.
- `cid_ids_fundidos`: ID antigo para ID novo, para o CRM remapear tratativas e agenda.
- `cid_resumo`: totais por cliente e aba, reconstruídos a cada execução.
- IDs estáveis: cliente do Portal tem ID derivado do nome do Portal; demais mantêm o ID do grupo com mais postagens.
- Cron a cada 10 min: sincroniza o Atende e roda a limpeza quando algo mudou.

## Arquivos

```
cloudflare/cadastros-api/
  wrangler.jsonc
  migrations/0100_identidade_v2.sql
  _entregas/cadastros-v2/planilha_legado.sql (fora do Git: contém nomes de clientes)
  src/index.js  src/motor.js  src/persistencia.js  src/sincronizacao.js
  test/motor.test.mjs
frontend/cadastros/
  index.html  cadastros.css  cadastros.js  config.js
```

## Testes feitos (dados reais do D1, ambiente local)

- 13 testes do motor passando (`node test/motor.test.mjs`).
- Sincronização completa: 94.647 postagens em 24 chamadas.
- Limpeza: 4.895 clientes (301 do Portal), 646 sugestões, 1.709 postagens sem remetente e 467 sem Cliente Portal fora do cadastro. 1 a 2 s por execução.
- Segunda execução sem mudança: 0 gravações (idempotente).
- Agrupar, "Não é o mesmo", tirar grafia e corrigir nome testados pela API.

## Publicação (depende de autorização)

1. `npx wrangler d1 migrations apply agf-cadastros --remote` (só cria tabelas `cid_*`).
2. `npx wrangler d1 execute agf-cadastros --remote --file _entregas/cadastros-v2/planilha_legado.sql (fora do Git: contém nomes de clientes)`.
3. `npx wrangler deploy` (substitui o código da v1 no Worker `agf-cadastros-api`).
4. `POST /api/v2/sincronizar` até `fimDaPassagem: true`, depois `POST /api/v2/motor`.
5. Publicar `frontend/cadastros` com o endereço correto em `config.js`.

## Validação

1. A aba GAS SHOPPING METRO mostra DILOHAN como cliente do Portal, com 2 grafias.
2. DONA LUIZA aparece uma vez só, com o nome terminado em CALCADOS LTDA.
3. AGNES PONTES RISTAU tem sugestão de AGNES RISTAU; Agrupar junta os dois.
4. "Não são o mesmo" some com a sugestão e ela não volta após Rodar limpeza.
5. A soma das abas (sem repetir clientes) mais "Fora do cadastro" fecha com o total de postagens.

## Como reverter

`npx wrangler rollback` volta o Worker para a v1. As tabelas `cid_*` podem ficar; a v1 não as usa.

## CRM - aba CLIENTES (etapa 1: motor no Worker)

O cálculo que o Apps Script fazia na planilha `CLIENTES_MASTER` agora roda no Worker, sobre as postagens do Visão 360 já ligadas ao cliente deste cadastro.

- Código: `src/crm_motor.js` (regras, porte fiel de `apps-script/base-metro/00_CLIENTES_MASTER_FINAL.js`) e `src/crm_persistencia.js` (leitura e gravação no D1).
- Tabela: `crm_metricas` (1 linha por cliente, com todas as colunas do antigo CLIENTES_MASTER em `dados`). Migração `0102`.
- Paridade: `test/crm_motor.test.mjs` roda o original do Apps Script e o portado com os mesmos dados. Resultado: 0 diferenças em 1.706 clientes simulados (curva, ação, subação, prioridade, score, perfil, alerta, mídia e ordem da fila).

### O que mudou em relação ao Apps Script (decidido)

1. Fonte: Visão 360 (`/atende`), não a BASE_TOTAL.
2. Curva, share do LOCAL e ação são calculados dentro de cada LOCAL da carteira (AGF, BALCAO, METRO). Nunca todos juntos. Cliente sem LOCAL (empate exato) fica em `SEM_LOCAL`, com curva própria.
3. Tipo de negócio pelas colunas do Atende: INTERMEDIADOR `VR` = VR; `INTERMEDIADOR` = plataforma (todas as plataformas do Atende contam como marketplace, não só as 5 da lista antiga); `PORTAL POSTAL` ou `CONTRATO ECT` = contrato; sem contrato = balcão.
4. Estorno soma o valor (negativo) mas não conta objeto nem dia ativo.
5. Reverso = serviço com subgrupo `Reverso` na classificação de serviços do Atende.
6. As métricas usam todas as postagens do cliente (inclusive em outro LOCAL); a comparação da curva é só com os clientes do mesmo LOCAL.

### Quando recalcula

- Sozinho, no cron de 10 min, depois da limpeza, quando houve mudança (postagens novas, agrupamento, LOCAL definido pelo admin).
- Na primeira sincronização com o código novo, o Worker recomeça a passagem para preencher as colunas INTERMEDIADOR, TIPO, subgrupo e estorno. O CRM só calcula depois dessa passagem (cerca de 1h30).
- Manual (admin): `POST /api/v2/crm/recalcular`.

### Rotas

- `GET /api/v2/crm/resumo?local=` - contagem por LOCAL, ação e curva, último cálculo.
- `GET /api/v2/crm/clientes?local=&acao=&curva=&q=&pagina=&por=` - fila paginada na ordem do CRM (prioridade, score, share, nome).
- Admin vê os 3 LOCAIS. Responsável vê só os LOCAIS vinculados a ele (etapa 2: vínculo no cadastro de usuários).
