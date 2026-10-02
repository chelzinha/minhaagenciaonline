# CRM integrado - Clientes, Agenda e Curva ABC

Publicado a partir do protótipo aprovado pela Rachel em 29/09/2026.

## 1. O que muda para quem usa

1. Clientes tem 5 abas: Dashboard, Funil, Cadastro, Ações e Curva ABC.
2. LOCAL é o filtro pai (bloco escuro no topo). Admin vê AGF, BALCÃO e METRÔ; os demais só os LOCAIS liberados no cadastro de usuários (`crm.locais`). Quem tem um LOCAL só vê o cadeado. Dá para marcar 1, 2 ou todos ao mesmo tempo (ver seção 8).
3. Responsável é o filtro filho. Quem só vê a própria agenda fica travado em si mesmo.
4. Funil: a coluna Sinalizado mostra sozinha os clientes com prioridade crítica ou alta do motor. Nada é gravado. A tratativa nasce quando alguém clica em Agendar ou Assumir e o card vai para "Em tratativa".
5. Dashboard: carteira do LOCAL, fila do motor, sinais do Visão 360 (voltou a postar, contrato detectado, queda relevante), funil, agenda de hoje e resumo da Curva ABC.
6. Curva ABC 12M: por LOCAL da carteira (desde 02/10/2026). O cliente entra só na curva do LOCAL que trata ele, com as postagens de todos os LOCAIS. A até 80% do acumulado, B até 95% ou a partir de R$ 5.000 na janela, C o resto. NOVO = primeira postagem (qualquer LOCAL) a partir de 01/07/2026 (provisório, até a base do Visão 360 completar 12 meses). Não substitui a "Curva 30D" do motor.
7. Agenda: diária (com a próxima atividade, vencidas e fila sem agenda), semanal e mensal no estilo Google. WhatsApp Web em toda atividade com número. Atividade sem vínculo (reunião interna, treinamento). Só dias úteis.
8. Tabelas no padrão do /atende: ordenar, filtrar por coluna, arrastar colunas e ajustar a largura (clique duplo volta ao padrão). A preferência fica salva no navegador de cada pessoa.

## 2. Como foi montado (sem regressão)

- `frontend/crm/app.js` continua dono dos dados, do boot e dos modais antigos (tratativa com checklist, atividade com conclusão, cadastro). Ele expõe `window.CRM_CORE`.
- `frontend/crm/crm-integrado.js` desenha Clientes e Agenda em cima do `CRM_CORE`. Os blocos antigos continuam no HTML (o app.js usa os ids), só ficam ocultos.
- Home e Prospects não mudaram.
- Gráficos: Apache ECharts 5.5.0 em `frontend/shared/vendor/echarts/` (licença Apache 2.0, arquivos LICENSE e NOTICE juntos). Carrega só quando uma aba com gráfico abre.

## 3. Voltar ao visual antigo

1. Só para você, na hora: abrir `/crm/?classico=1`.
2. Para todos: `crmIntegrado: false` em `frontend/crm/config.js` e publicar. O Worker novo continua compatível com o front antigo.
3. Worker: `npx wrangler rollback` na pasta `cloudflare/cadastros-api` volta a versão anterior. A migração 0105 é só aditiva e pode ficar.

## 4. API nova (`/api/crm`)

| Ação | Tipo | O que faz |
| --- | --- | --- |
| `get_carteira_v1` | GET `local` | Resumo da carteira do LOCAL, fila crítica e alta (com tratativa aberta, se houver) e sinais do Visão 360 |
| `get_curva_abc_v1` | GET `local` | Curva ABC 12M do LOCAL: meses, resumo por classe, totais por mês e linhas por cliente. Cache de 10 min por LOCAL |
| `assumir_cliente_v1` | POST `clienteId` | Cria ou reaproveita a tratativa e coloca em "Em tratativa" com o responsável da sessão |
| `save_atividade` | POST | Aceita `avulsa: true` com `titulo` e `local` (sem cliente, prospect ou tratativa) |
| `get_crm_agenda_v3` e `get_crm_jornada_data` | GET | Aceitam `local` opcional. A agenda devolve `whatsapp`, `acao`, `prioridadeFila`, `diasSemPostar`, `titulo`, `avulsa` e `duracaoMin` |

Regras de escopo no servidor: LOCAL não liberado é recusado em todas as rotas acima. Concluir, cancelar e excluir atividade conferem LOCAL e responsável (admin, gestor e quem vê a equipe passam).

## 5. Implantação (ordem segura)

1. Branch `feat/crm-integrado` a partir da `main` atualizada.
2. Testes: `npm test` e `npm run test:crm` em `cloudflare/cadastros-api`.
3. Commit e push da branch: o Cloudflare Pages gera a prévia `https://feat-crm-integrado.minhaagenciaonline.pages.dev`.
4. Migração no D1: `npx wrangler d1 migrations apply agf-cadastros --remote` (aditiva; o código atual continua funcionando).
5. Worker: `npx wrangler deploy` (compatível com o front antigo e com o novo; já libera a prévia no CORS).
6. Homologar na prévia com o checklist abaixo.
7. Merge na `main`: publica em produção.
8. Depois do merge: tirar a prévia de `ALLOWED_ORIGINS` no `wrangler.jsonc` e publicar o Worker de novo.

## 6. Checklist de teste

1. Admin: LOCAL mostra AGF, BALCÃO e METRÔ. Usuário de um LOCAL: só o dele, com cadeado.
2. Dashboard AGF: carteira 258, ativos 200, esfriando 31, inativos 27 (números de 29/09; mudam com o Visão 360).
3. Funil: Sinalizado mostra os críticos e altos. Assumir leva para "Em tratativa". Agendar também.
4. Card real abre a tratativa antiga (checklist e histórico). Arrastar card muda a etapa.
5. Cadastro: ABC 12M, Curva 30D, etapa e próxima atividade por cliente. Ordenar, filtrar, arrastar e redimensionar coluna. Recarregar mantém a largura.
6. Ações: clicar numa barra de "Carteira por ação" filtra a tabela.
7. Curva ABC AGF: A 19 clientes, B 53, C 192, total R$ 4,46 mi (conferido no D1 em 29/09). Clique no gráfico mensal ordena a tabela pelo mês. Exportar CSV abre no Excel com acentos.
8. Agenda diária: próxima atividade, vencidas, sugestões da fila. Botão WhatsApp abre o WhatsApp Web no número do cadastro. Sem número: botão apagado leva à ficha.
9. Nova atividade sem vínculo: só aparecem Reunião interna, Reunião on-line e Treinamento. Sábado e domingo são recusados.
10. Concluir atividade pelo modal antigo: some de "A fazer" e vai para "Feitas".
11. Usuário comum não conclui atividade de outro responsável.
12. `/crm/?classico=1` mostra o CRM antigo funcionando.
13. Home e Prospects iguais a antes.

## 7. Regra de contrato (motor 1.1.0, 30/09/2026)

1. Contrato próprio = postagem nos últimos 60 dias com PORTAL POSTAL, CONTRATO ECT ou número de contrato. Não contam VR (Clube Correios, contrato coletivo 9912653619) nem INTERMEDIADOR (SuperFrete e similares).
2. Quem tem contrato próprio aparece com contrato e com o número dele, mesmo que o canal que mais pesa seja VR ou balcão. O canal que mais pesa fica em `CANAL_PREDOMINANTE`.
3. Com contrato próprio nunca é Converter nem Cancelar. Se 30% ou mais do valor em 60 dias foi fora do contrato, vira Fidelizar ("migrar o volume para o contrato"); prioridade alta quando mais da metade vai por fora e o cliente é relevante.
4. Só VR: segue a regra VR do motor (Cancelar, a não ser que o faturamento justifique Converter) e não mostra o número do Clube Correios.
5. A paridade com o Apps Script antigo continua testada com a regra AGF desligada (`regrasAgf: false`); a regra AGF tem testes próprios em `test/crm_integrado.test.mjs`.

## 8. Vários LOCAIS ao mesmo tempo (30/09/2026)

1. Clique num LOCAL soma ou tira; "Todos" marca os três; o último marcado não sai. Salvo no navegador em `crm_cix_locais`.
2. O servidor continua respondendo um LOCAL por vez (`get_carteira_v1` e `get_curva_abc_v1` com `local`). A tela pede cada LOCAL marcado e soma. Nenhuma rota nova, nenhuma permissão nova: LOCAL não liberado continua recusado no servidor.
3. Carteira, fila, ações e sinais: somados. Fila crítica e alta ordenada por prioridade e depois por faturamento 30 dias.
4. Curva ABC: cada linha é cliente + LOCAL e mantém a classe do próprio LOCAL. Não existe "curva somada". Cliente que posta em dois LOCAIS aparece em duas linhas; "Clientes na janela" conta uma vez. Na ficha e no Cadastro vale a linha do LOCAL da carteira do cliente.
5. Coluna LOCAL aparece em Cadastro, Ações e Curva ABC só com mais de um LOCAL. Com um LOCAL a tela fica igual antes.
6. Nova atividade: com cliente ou prospect usa o LOCAL do cadastro; sem vínculo, escolhe entre os LOCAIS marcados.

## 9. Pendências conhecidas

- `crm_midias` está vazia: a mídia sugerida aparece só com o código, sem link. Precisa do conteúdo dos materiais.
- WhatsApp vem do cadastro manual (`crm_cadastro`), que ainda está vazio: no começo quase todos mostram "Sem número" até o cadastro ser completado.
- NOVO na Curva ABC é provisório (a base do Visão 360 começa em 04/05/2026).
- 2.226 postagens (2,3%) sem cliente_id ficam fora do CRM e da Curva.
