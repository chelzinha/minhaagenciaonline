# 12 - Auditoria e Plano de Correções - minhaagenciaonline

Data: 03/07/2026
Status: FASE 1 e FASE 2 CONCLUÍDAS. Pronto para aplicar e deployar.
Pacote: correcoes-auditoria-completo.zip
Excluído por decisão da Rachel: /nuvem e /nuvemshop (nada foi tocado nessas pastas).

## Como retomar em uma nova conversa

Cole isto no novo chat:

```
Retome o documento "12 - Auditoria e Plano de Correções".
As Fases 1 e 2 já estão prontas no ZIP correcoes-auditoria-completo.zip.
O que falta é APLICAR e DEPLOYAR (seção "Roteiro de aplicação").
Não mexa em /nuvem nem /nuvemshop. Foco em não causar regressão.
```

## O que foi entregue (47 arquivos, 0 em /nuvem)

Backend (12 arquivos):
1. apps-script/base-metro/000_AGF_AUTH_GATE.js (NOVO) - gate de sessão.
2. apps-script/base-metro/DASHBOARD_GERENCIAL.js - gate no doGet/doPost raiz.
3. apps-script/base-metro/06_CRM_JORNADA_FASE3.js - filtro de responsável normalizado (agenda + dashboard).
4. apps-script/caixa/00_AGF_AUTH_GATE.js (NOVO).
5. apps-script/caixa/caixa.js - gate no doGet/doPost.
6. apps-script/logistica/00_AuthGate.gs (NOVO).
7. apps-script/logistica/04_Api.gs - gate só nas actions internas.
8. apps-script/etiquetas/02_SHEETS.js - escrita em lote + readSheetTailAsObjects_.
9. apps-script/etiquetas/10_HISTORICO.js - coluna ID_REQUISICAO, dedup, leitura de cauda.
10. apps-script/etiquetas/12_ETIQUETAS.js - bloqueio de emissão duplicada.
11. apps-script/etiquetas/30_SF_CFG.js - remove senha admin fixa.
12. apps-script/etiquetas/31_SF_BOOTSTRAP.js - senha admin aleatória + sfDefinirSenhaAdmin().

Frontend (34 arquivos):
- crm/app.js (data local + token), crm/styles.css (16px mobile), crm/sw.js.
- crm/acoes, intra/dashboard, intra/resumo, intra/manuais, portal (token; portal ganhou login).
- caixa/index.html e intra/caixa/index.html (token).
- reverso-admin, reverso-expedicao, reverso-coleta js/app.js (datas locais).
- shared/auth/agf-route-guard.js (fail-soft, corrige logout aleatório).
- 11 service workers (network-first em /shared/ui/): service-worker.js, crm, agf, atende, balcao, caixa, cep, sla, superfrete, superfrete-admin, intra.
- app/js/screens/etiqueta.js e nova.js (idempotência), app/service-worker.js (remove SVG 352KB).
- 8 index.html com zoom desbloqueado: atende, sla, intra/sla, reverso-expedicao, reverso-coleta, agf, agf/usuarios, agf/icones.

robots.txt (1 arquivo): bloqueia todas as rotas internas.

Script git separado (não é código para colar):
- scripts/f11-higiene-repo.sh - remove lixo/função morta e move previews+READMEs para fora do publish.

## Correções por gravidade (com status)

CRÍTICO
1. APIs abertas -> RESOLVIDO com gate de sessão nos 3 backends (base-metro, caixa, logistica). Fluxo público do /reverso preservado. app e conector já eram protegidos.

ALTO
2. CRM "hoje" errado após 21h -> RESOLVIDO (today() usa data local).
3. Reverso datas -1 dia -> RESOLVIDO (parseLocalDate nos 3 módulos).
4. SuperFrete admin123 -> RESOLVIDO (senha aleatória + função de troca). Ver "Ação manual" abaixo.
5. Logout aleatório mobile -> RESOLVIDO (fail-soft no route guard).

MÉDIO
6. Etiqueta duplicada -> RESOLVIDO (idempotência ponta a ponta: front gera idRequisicao, backend barra repetição).
7. Filtro de responsável some itens -> RESOLVIDO.
8. Lock global de escrita -> DIFERIDO (Supabase).
9. Escrita célula a célula -> RESOLVIDO (updateRowByHeader_ em lote).
10. Histórico lê planilha inteira -> RESOLVIDO (lê só as últimas 3000 linhas).
11. UI compartilhada nunca atualiza -> RESOLVIDO (network-first em /shared/ui/ nos 11 SWs).
12. Webhook Nuvemshop sem HMAC -> EXCLUÍDO (pasta proibida).
13. Boot pesado do CRM -> DIFERIDO (Supabase).

BAIXO
14. Lixo na raiz -> no script f11.
15. Docs/previews públicos -> no script f11 + robots.txt.
16. reversa.js morta -> no script f11.
17. Zoom bloqueado -> RESOLVIDO (8 páginas).
18. Fontes divergentes -> DIFERIDO (QA visual).
19. Selects 12px iOS -> RESOLVIDO (16px em mobile).
20. Dashboards duplicados -> DIFERIDO (estrutural).
21. SVG 352KB no PWA -> RESOLVIDO.
22. Chave Maps hardcoded -> AÇÃO MANUAL: conferir restrição por domínio no console Google (sem código).

DIFERIDOS (registrados, fora desta entrega): 8, 12, 13, 18, 20 e o hash das senhas SENHA_APP (feito junto da rodada do conector, pois a mesma coluna é lida pelo backend Nuvemshop).

## Roteiro de aplicação e deploy (fazer nesta ordem)

Passo 1 - Extrair
Extraia o ZIP na raiz do repo local. Ele sobrescreve os 47 arquivos e adiciona scripts/f11-higiene-repo.sh.

Passo 2 - Script Properties (ANTES dos deploys) - crítico
Em cada projeto Apps Script (base-metro, caixa, logistica), em Extensões > Propriedades do script:
a) Crie AGF_AUTH_JWT_SECRET com o MESMO valor que já existe no projeto AGF_AUTH.
   (Copie do projeto AGF_AUTH; não invente, não gere outro.)
b) NÃO crie AGF_API_AUTH_MODE ainda. Sem ela, o gate entra em 'monitor' (não bloqueia).

Passo 3 - Deploy dos backends
Em base-metro, caixa, logistica e etiquetas:
   clasp push
   clasp deploy -i [ID do projeto]   (reusa o ID para manter a URL)

Passo 4 - Frontend
   git add -A && git commit && git push   -> Netlify publica sozinho.
   (Ou aplique o ZIP e faça o commit.)

Passo 5 - Testar em modo monitor
Nada bloqueia ainda. Use o app normalmente e confira o checklist abaixo.
Nos logs do Apps Script (Execuções), procure "[AGF_GATE][monitor]": mostra chamadas que chegaram SEM token. O esperado é que, com o frontend novo, praticamente não apareçam.

Passo 6 - Ligar o enforce
Depois de 1-2 dias limpos: em cada backend, crie a Script Property
   AGF_API_AUTH_MODE = enforce
A partir daí, chamada sem sessão válida é bloqueada.

Passo 7 - Teste de fogo
Abra a URL /exec do base-metro em aba anônima com ?action=get_crm_data.
   monitor -> responde (e loga)
   enforce -> retorna {"ok":false,"code":"AUTH_REQUIRED"}

Rollback do gate a qualquer momento: AGF_API_AUTH_MODE = off.

Passo 8 - Higiene do repo (opcional, quando quiser)
   bash scripts/f11-higiene-repo.sh
   git status   (revise)
   git commit -m "chore: higiene do repo"

## Ações manuais (fora do código)

1. SuperFrete: se o bootstrap antigo já rodou com admin123, troque a senha.
   No editor do Apps Script do projeto etiquetas, rode:
   sfDefinirSenhaAdmin('suaSenhaForteAqui')
2. Google Maps: no console Google Cloud, confirme que a chave usada em
   reverso-admin e reverso-expedicao está restrita ao domínio minhaagenciaonline.com.br.

## Checklist de teste (mobile primeiro)

- [ ] CRM abre no celular; dashboards, funil e agenda carregam.
- [ ] CRM às 21h ou mais: agenda destaca o dia certo.
- [ ] Filtro por responsável na agenda mostra os itens de cada pessoa.
- [ ] Selects de filtro do CRM no iPhone: focar NÃO dá zoom.
- [ ] Reverso-admin: datas iguais às da planilha (sem -1 dia).
- [ ] Reverso público (/reverso): dropoff e histórico funcionam SEM login AGF.
- [ ] Coletor e expedição operam logados.
- [ ] Caixa abre e salva.
- [ ] App: emitir etiqueta; tentar reenviar a mesma -> mensagem de duplicidade.
- [ ] Portal exige login.
- [ ] Páginas antes travadas (agf, atende, sla, reverso-coleta/expedicao): pinça dá zoom.
- [ ] Aba anônima em /exec: monitor passa, enforce bloqueia.

## Notas de arquitetura (para não refazer no futuro)

- Token de sessão = JWT HS256 emitido pelo projeto AGF_AUTH. O gate valida por HMAC local, sem chamada de rede, usando AGF_AUTH_JWT_SECRET. O front já guarda esse token (AgfAuth.getToken()); o gate só passou a exigi-lo.
- base-metro tem 2 roteadores: doGet/doPost raiz em DASHBOARD_GERENCIAL.js delega para op_doGet/op_doPost. O gate ficou no raiz (cobre tudo).
- Token viaja como parâmetro 'st' (GET query ou POST). No reverso, o front já mandava 'auth_token' - o gate aceita os dois.
- Logística: gate só nas actions internas (lista REVERSA_INTERNAL_ACTIONS). Público do /reverso intacto.
- parseLocalDate trata só 'aaaa-mm-dd' como data local; qualquer outro formato segue new Date padrão (sem regressão).
- SWs: /shared/ui/ agora é network-first com fallback ao cache (atualiza na hora, funciona offline). Versões bumpadas para forçar troca.
- Idempotência: front gera idRequisicao por tentativa, mantém no retry, renova após sucesso; backend guarda na coluna ID_REQUISICAO e barra repetição não-falha.
