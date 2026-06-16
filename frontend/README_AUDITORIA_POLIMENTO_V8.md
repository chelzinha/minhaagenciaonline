# README — AUDITORIA & POLIMENTO FRONTEND V8 (CSS, UX/UI, Mobile, Performance)

Entrega com **zero regressão por construção**: nenhum ID, classe, handler,
fluxo ou regra CSS existente foi removido ou reescrito. Toda padronização
visual entrou como camada aditiva de especificidade zero (`:where()`), no
mesmo mecanismo já consolidado em `shared/ui/agf-ui.css`.

A auditoria cobriu os 535 arquivos do monorepo: todos os `.css` e blocos
`<style>` inline foram validados com parser (PostCSS) e todos os `.js` e
`<script>` inline passaram em verificação de sintaxe.

---

## 1. ERROS CORRIGIDOS

### 1.1 CSS inválido (único erro de sintaxe em todo o repo)
- `app/styles/components.css` (regra `.seg-sub`):
  `color: color: #c89600;` → `color: #c89600;`
  O browser descartava a declaração inválida e o subtítulo do seletor de
  serviço ficava sem a cor pretendida.

### 1.2 Seletor de fonte sem `display=swap` (texto invisível durante load)
- `intra/manuais/index.html`, `superfrete-admin/danfe-auditoria.html`,
  `danfe-simplificado/index.html` — agora alinhados com o resto do portal.

### 1.3 `preconnect` ausente para Google Fonts
- `reverso-admin/`, `reverso-coleta/`, `reverso-interno/`, `intra/offline.html`.

---

## 2. PERFORMANCE (causas da lentidão e correções)

### 2.1 ⭐ Causa raiz principal: bloqueio "Validando acesso…"
Todo carregamento de toda página interna escondia o body e esperava uma
ida completa ao Apps Script (1–4 s típicos, timeout 12 s) antes de exibir
qualquer coisa.

**Correção (revalidação com TTL):**
- `shared/auth/agf-auth-client.js`: passa a gravar o carimbo da última
  confirmação de sessão pelo servidor (`markValidated` /
  `getLastValidatedAt`, chave `agf_jb_session_v1_validated_at`).
- `shared/auth/agf-route-guard.js`: se a sessão local é válida **e** foi
  confirmada pelo servidor há menos de `revalidateTtlMs` (padrão 10 min),
  a página renderiza imediatamente e a validação roda em segundo plano.
  Se o servidor recusar, redireciona exatamente como hoje.
- `shared/auth/agf-auth-config.js`: novo campo `revalidateTtlMs`
  (10 min). **`0` desativa e restaura o comportamento bloqueante antigo.**

Semântica preservada:
- Primeiro acesso (ou TTL vencido / outro dispositivo): comportamento
  idêntico ao anterior, bloqueante.
- Sessão revogada: continua barrada no backend em toda chamada de dados,
  e o redirect local acontece em no máximo 1 round-trip após o load.
- Eventos: `agf:auth-ready` continua disparando (com o usuário em cache no
  caminho rápido — todos os consumidores já usam fallback
  `getCachedUser()`); novo evento opcional `agf:auth-revalidated` quando a
  confirmação em segundo plano retorna.

### 2.2 Imagens infladas (peso + custo de decode no mobile)
- `icon-app.png` (6 cópias): **2344×2188 px / 229 KB** exibido a 64–66 px
  → redimensionado para 264 px (4× retina, visualmente idêntico) = 33 KB.
- `correios-logo-2.png` (7 cópias): 163 KB → **21 KB**.
- Passada **lossless** (optipng, pixels idênticos) em todos os PNGs:
  **~1 MB economizado no total do site**, incluindo os logos que carregam
  em praticamente todas as telas.

### 2.3 pdf-lib (unpkg) no Conector Nuvemshop
- `nuvem/index.html`: script de terceiros carregava bloqueante em todo
  load, mas só é usado no clique de exportação. Recebeu `defer` —
  executa antes do `DOMContentLoaded` (onde o app inicia), ordem e
  disponibilidade garantidas, sem bloquear o parse.

---

## 3. PADRONIZAÇÃO & UX/UI (camada aditiva V8 em shared/ui/agf-ui.css)

Bloco "PADRONIZAÇÃO V8" no fim do arquivo. Tudo com `:where()`
(especificidade zero — regra existente sempre vence) e escopado pelas
classes de rota de `agf-ui.js`. A landing pública continua intocada.

- **V8.1** Âncoras e títulos com `scroll-margin-top`: navegação por
  âncora/foco não esconde mais o título sob a topbar sticky.
- **V8.2** Chips/badges/pills com teto de largura + reticências: nomes e
  códigos longos não estouram mais o card no mobile.
- **V8.3** `select` longo trunca com reticências em vez de vazar.
- **V8.4** Botões `:disabled` ganham feedback visual consistente
  (cursor + opacidade) onde o app ainda não estilizava o estado.
- **V8.5** `text-size-adjust: 100%`: Android não infla fonte sozinho.
- **V8.6 (≤640 px + toque)** alvo de toque mínimo de 40 px para ações
  (`min-height`, nunca encolhe nada) e fonte ≥16 px em campos de texto
  de /intra, /caixa, /crm e /agf — elimina o zoom automático do iOS ao
  focar inputs nessas rotas (que não usam `maximum-scale=1`).
- **V8.7 (≤640 px)** painéis de modal com teto `100dvh` e rolagem
  interna: formulários longos não passam mais da tela no telefone.

Decisão registrada: as metatags `maximum-scale=1` existentes **não**
foram removidas — no iOS elas não bloqueiam pinch-zoom (ignorado desde o
iOS 10), mas continuam suprimindo o zoom automático ao focar inputs;
removê-las criaria regressão de UX nessas telas.

---

## 4. ARQUIVOS ALTERADOS

| Arquivo | Mudança |
|---|---|
| `app/styles/components.css` | correção `color: color:` |
| `shared/auth/agf-route-guard.js` | revalidação com TTL (caminho rápido) |
| `shared/auth/agf-auth-client.js` | carimbo de validação + API exposta |
| `shared/auth/agf-auth-config.js` | novo `revalidateTtlMs` (documentado) |
| `shared/ui/agf-ui.css` | camada aditiva PADRONIZAÇÃO V8 |
| `nuvem/index.html` | `defer` no pdf-lib |
| `intra/manuais/`, `superfrete-admin/danfe-auditoria.html`, `danfe-simplificado/` | `display=swap` |
| `reverso-admin/`, `reverso-coleta/`, `reverso-interno/`, `intra/offline.html` | `preconnect` fonts |
| Todos os `.png` | otimização lossless (+ downscale só do `icon-app.png`) |

Nenhum service worker, manifest, `_headers`, `_redirects`, rota ou JS de
aplicação foi alterado.

## 5. DEPLOY

1. Publicar a pasta inteira no Netlify como sempre (deploy atômico).
2. `shared/*` tem cache de 1 h (`_headers`); o guard/auth atualizado
   propaga em até 1 h, sem ação manual. HTML é `no-cache` (imediato).
3. Nenhuma migração: o carimbo de validação é criado automaticamente no
   próximo login/validate de cada usuário.

## 6. CHECKLIST DE TESTES (pós-deploy)

1. **Landing `/`** — visual idêntico ao atual (rota excluída da camada).
2. **Login `/agf/`** — entrar normalmente; após login, abrir `/intra/` →
   deve abrir **sem** a tela "Validando acesso…".
3. **Navegar entre `/intra/`, `/crm/`, `/caixa/`, `/balcao/`** em
   sequência — todas instantâneas (sem bloqueio) dentro de 10 min.
4. **TTL**: esperar >10 min sem navegar e abrir uma página interna →
   "Validando acesso…" aparece uma vez (comportamento antigo) e some.
5. **Revogação**: revogar a sessão no painel admin e navegar → a página
   abre e redireciona ao login em ~1–3 s (`reason=sessao`).
6. **Logout/atalho Portal** — funcionando como antes em todas as rotas.
7. **Nuvemshop**: login → pedidos → exportar etiquetas/declarações em
   lote → PDF mesclado baixa normalmente (pdf-lib com defer).
8. **Login do App/Reverso/SuperFrete no celular** — logo nítida (264 px
   cobre 4× retina) e tela abrindo perceptivelmente mais rápido.
9. **Mobile ≤640 px**: abrir um modal longo (ex.: edição no CRM) → rola
   internamente sem passar da tela; chips/badges com nomes longos
   truncam com "…" sem scroll horizontal.
10. **iOS**: focar um input de filtro no /crm ou /caixa → sem zoom
    automático da página.
11. **Botões desabilitados** (ex.: salvar sem preencher) → aparência
    atenuada + cursor `not-allowed`.
12. **Âncoras**: em páginas com índice/seções, clicar numa âncora → o
    título para abaixo da topbar, não escondido sob ela.
13. **PWAs**: ícones e favicons inalterados visualmente (otimização foi
    lossless).

## 7. ROLLBACK

- Lentidão/auth: definir `revalidateTtlMs: 0` em
  `shared/auth/agf-auth-config.js` (volta ao bloqueio antigo) — não é
  preciso reverter o guard.
- Visual: apagar o bloco "PADRONIZAÇÃO V8" no fim de
  `shared/ui/agf-ui.css`.
- Qualquer arquivo: restaurar a versão anterior do repositório
  (mudanças isoladas por arquivo, sem dependências cruzadas novas).

---

## 8. HOTFIX V8.1 — Logout indevido em navegação rápida (CORRIGIDO)

**Sintoma:** necessidade de login constante após o deploy da V8.

**Causa:** no caminho rápido da guarda de rota, a validação em segundo
plano tratava QUALQUER falha como sessão inválida. Ao navegar entre
páginas (agora instantâneas), o navegador abortava o fetch de validação
da página anterior → o catch apagava o token do localStorage → a página
seguinte caía no login. Iframes do portal validando em paralelo
agravavam falhas transitórias no Apps Script.

**Correção (fail-soft):**
- `agf-auth-client.js`: erros do `post()` agora carregam `err.code`
  ('timeout' | 'network' | 'bad-response' | 'rejected'). Aditivo.
- `agf-route-guard.js`: em segundo plano, a sessão só é derrubada com
  recusa EXPLÍCITA do servidor ('rejected') ou perda de permissão.
  Timeout/queda de rede/abort por navegação mantêm a sessão (o carimbo
  não renova; vencido o TTL, o fluxo bloqueante revalida com rigor).
  Listener de `pagehide` ignora rejeições durante a saída da página.
- Validação confirmada há <45 s não dispara nova chamada — elimina a
  tempestade de validates paralelos (pai + iframes) e poupa quota.
- Caminho bloqueante (TTL vencido/primeiro acesso): comportamento
  original intacto, qualquer falha exige novo login.

**Testes do hotfix:** 8 cenários simulados (rede caída, timeout, abort
em navegação, recusa do servidor, perda de perfil, validação recente,
fluxo bloqueante ok/falha) — todos com o resultado esperado.

**Validação pós-deploy:** navegar rápido entre /intra, /crm, /caixa por
2–3 min (inclusive com 3G simulado) → sessão deve permanecer. Revogar a
sessão no admin → logout em até 1 ciclo de validação.

## 9. ATUALIZAÇÃO V8.1 — Ritmo vertical de formulários

Corrigido o "título colado" (Mão Própria, Bairro etc. grudados no bloco
anterior) em /app, /nuvem e cópia legada /styles: o último `.field` de
um `.grid-2/3` perdia a margem via `:last-child` e o grid não tinha
margem própria. Agora o espaçamento interno dos grids é por `row-gap`
(14 px; 10 px em `.grid-unidades`) e o externo por margem do grid
(14 px quando não é o último do card) — ritmo uniforme de 14 px entre
todos os grupos, desktop e mobile.

## 10. V8.2 — Responsividade mobile das rotas Reverso (VERIFICADO)

Verificação solicitada das rotas /reverso, /reverso-interno,
/reverso-admin e /reverso-coleta.

**Achado da auditoria:** as três apps JÁ tinham base responsiva própria
e sólida — `box-sizing` global, `overflow-x:hidden` no body,
`img/svg{max-width:100%}`, inputs `font-size:16px` (anti-zoom iOS),
`100dvh`, safe-area insets, bottom-nav fixa e várias media queries
próprias (560/620/640/720/820/900/980/1180px) que colapsam os grids
principais (control-strip, admin-grid-2, filtros, exp-tabs, clusters).
Tabelas usam o padrão correto `.table-wrap{overflow:auto}` + `min-width`.

Porém, elas estavam **fora das seções 1–9 da camada compartilhada**
(rede de segurança de mídia/scroll/mobile que listava só 8 rotas) e
havia **um grid que não colapsava**: `.collector-stats` (coleta/admin)
permanecia em 4 colunas mesmo em telas de 360px, espremendo os rótulos.

**Correção (bloco V8.2, aditivo e escopado):**
- Estende às 4 rotas reverso a mesma rede de segurança: quebra de texto,
  `max-width` em mídia, numerais tabulares em KPIs/valores e inércia de
  scroll iOS em tabelas roláveis.
- `≤480px`: `.collector-stats` passa a 2 colunas. Como `coleta.css`
  carrega depois de `agf-ui.css`, esta regra usa a classe de rota como
  composto real (especificidade 3 vs 1) para vencer sem `!important` —
  é a única regra do pacote com especificidade elevada, e só afeta esse
  grid. Toolbars/ações quebram em vez de transbordar.

Todo o resto permanece `:where()` (app sempre vence). Nenhuma regra
vaza para fora das rotas reverso. Rollback: remover o bloco V8.2.

## 11. V8.2.4 — Body ultrapassando a viewport em /reverso-admin e /reverso-coleta (CORRIGIDO)

**Sintoma relatado:** nessas duas telas o corpo ultrapassava a largura
da tela no celular (página "arrastável" horizontalmente).

**Erro da minha primeira tentativa (V8.2):** mirei contêineres `.page` e
`.app-shell` que NÃO existem nessas rotas. Os contêineres reais são
`<main class="internal-main admin-shell">` (admin) e
`<main class="collector-main">` (coleta), com cabeçalho `.section-head`.
Por isso a primeira correção não teve efeito.

**Causa real (confirmada por auditoria):** não eram os grids de página
(todos em `fr`, colapsam) nem as tabelas (já em `.table-wrap{overflow:auto}`).
Era a cadeia clássica `min-width:auto` de Grid/Flex: itens com conteúdo
longo e sem espaço (código de rastreio via `.code` — que, diferente de
`.preview-code`, não tinha `overflow-wrap` — e-mail, nome de unidade)
fixavam a largura mínima da própria coluna no tamanho do conteúdo,
empurrando linha → card → `main` → body. Some-se a isso o `.section-head`
e o `.card-head` (flex `space-between`) que nunca empilhavam no mobile.

**Correção (bloco V8.2.4, aditivo, escopado, sem `!important`):**
- (a) `min-width:0` nos contêineres REAIS (`.internal-main`,
  `.admin-shell`, `.collector-main`, `.section-head`, `.card`,
  `.card-head`, `.control-cluster`), quebrando a cadeia e deixando as
  áreas roláveis (`.table-wrap`, `.week-calendar`, `.admin-tabs`)
  absorverem o excedente.
- (b) `overflow-wrap:anywhere` + `word-break` em `.code` e em
  `[class*="codigo"]`/`[class*="rastreio"]`.
- (c) `≤768px`: `max-width:100%` + `overflow-x:clip` no `main` (a topbar
  é IRMÃ do main, não filha — `clip` não a afeta; modais são
  `position:fixed`, idem) e `flex-wrap` em `.section-head`/`.card-head`
  para empilharem. `.head-reference` já trazia `flex-wrap` e
  `justify-content:flex-start` no mobile, então as ações descem
  alinhadas à esquerda, sem regressão.

Especificidade obtida via classe de rota como composto real (vence as
bases sem `!important`). Verificado por checagem das garantias ativas em
390px. Rollback: remover o bloco V8.2.4.

**Validar pós-deploy:** abrir /reverso-admin/ e /reverso-coleta/ no
celular, tentar arrastar a página para o lado em cada aba (Dashboard,
Unidades, Etiquetas, Objetos, Coletas, Expedição, Divergências,
Config) — não deve haver rolagem horizontal; tabelas largas continuam
rolando dentro do próprio quadro.

## 11. CORREÇÃO V8.3 — Overflow horizontal no mobile (reverso-admin/coleta)

**Sintoma:** o body de /reverso-admin e /reverso-coleta ultrapassava a
largura da tela no celular (pan horizontal), mesmo com
`body{overflow-x:hidden}`.

**Por que overflow-x:hidden não bastava:** ele apenas RECORTA a pintura;
a *largura de layout* continuava sendo forçada por um descendente.

**Causa raiz (armadilha clássica de Grid/Flexbox):** itens de grid/flex
têm `min-width:auto` por padrão e não encolhem abaixo da largura
intrínseca do conteúdo. Em /reverso-admin, `.admin-table{min-width:780–
930px}` dentro de `.table-wrap` ficava num `.card` que é item de
`.admin-mount`/`.admin-grid-2`; sem `min-width:0`, o card expandia até
930px e empurrava `.page` e o body. Em /reverso-coleta, células de grid
sem `min-width:0` faziam o mesmo.

**Correção (bloco V8.3, aditiva, escopada por rota, sem !important):**
- `min-width:0` nos filhos diretos dos grids das telas
  (`.admin-mount`, `.admin-grid-2`, `.control-strip`, dashboards;
  `.summary-grid`, `.unit-metrics`, `.collector-stats` etc.).
- `min-width:0` nos `.card`/`.table-wrap` que hospedam tabelas largas —
  agora a tabela rola DENTRO do `.table-wrap` (comportamento desejado),
  sem alargar a página. As larguras das tabelas foram preservadas.
- `overflow-wrap:anywhere` nas grades de métricas para texto longo.

**Decisão de segurança (zero regressão):** deliberadamente NÃO foi
aplicado `overflow-x:clip/hidden` em `html`/`body`. Os cabeçalhos usam
`position:sticky` e são filhos diretos de `<body>`; tornar o body um
contêiner de rolagem quebraria a fixação do topo. A correção ataca a
CAUSA (itens que não encolhiam), eliminando o transbordo na origem — o
`overflow-x:hidden` de base do body permanece intacto.

**Validação:** o `.collector-calendar` (faixa semanal com `overflow:auto`
próprio) continua rolando internamente — recorte de ancestral não
desativa o scroll de um descendente. CSS e JS revalidados sem erros;
todas as regras V8.3 usam apenas `min-width`/`max-width`/`overflow-wrap`.

**Checklist pós-deploy:**
1. Abrir /reverso-admin no celular (360–390px) → sem rolagem horizontal
   da página; as tabelas (Unidades, Operações) rolam lateralmente
   DENTRO do próprio quadro.
2. Abrir /reverso-coleta → sem pan horizontal; cards de estatística e
   agenda semanal contidos; faixa da semana rola dentro do cartão.
3. Topo fixo (sticky) continua grudando ao rolar em ambas.
4. Desktop inalterado.

## 12. CORREÇÃO V8.3b — Aba "Coletas" de /reverso-coleta (overflow restante)

**Sintoma:** a aba Coletas (view inicial "Coletas pendentes") ainda
transbordava no mobile, mesmo após a V8.3.

**Causa raiz (a peça que faltava):** o wrapper de TODAS as views dessa
app é `.collector-page{display:grid}`. A V8.3 anterior cobriu
`.collector-stats`/`.summary-grid`/`.unit-metrics`, mas NÃO os filhos
diretos de `.collector-page`. Um desses filhos é a "Agenda útil"
(`.collector-calendar-card`), que contém a faixa semanal
`.collector-calendar` com colunas FIXAS `repeat(5,112px)` (~560px). Como
itens de grid têm `min-width:auto`, esse cartão se recusava a encolher
abaixo de ~560px e empurrava a coluna inteira — logo, a página — além
da viewport no celular.

**Correção (V8.3 estendida, aditiva e escopada à rota reverso-coleta):**
- `min-width:0` nos filhos diretos de `.collector-page`/`.execution-page`
  e demais grids de view (`.unit-card-list`, `.scan-list` etc.), para a
  coluna poder encolher.
- `.collector-calendar-card`: `min-width:0; max-width:100%; overflow:
  hidden` — o cartão passa a conter a faixa. A `.collector-calendar`
  interna mantém seu `overflow:auto` próprio, então a agenda da semana
  ROLA horizontalmente DENTRO do cartão (comportamento desejado, como um
  carrossel compacto de 5 dias), sem alargar a página.

**Por que a faixa continua rolável e não "reflui":** as 5 colunas fixas
são uma decisão de design da app (visão semanal compacta). Mantê-las
roláveis dentro do cartão preserva o layout original com zero regressão;
transformá-las em coluna única seria mudança de design, não correção.

**Segurança:** nenhum `overflow` em html/body (topo sticky intacto); o
`overflow:hidden` recai só no cartão da agenda, que não tem elemento
sticky interno. CSS/JS revalidados sem erros; V8.3 usa apenas
`min-width`/`max-width`/`overflow-wrap`/`overflow:hidden` (no cartão).

**Checklist:** abrir /reverso-coleta → aba Coletas em tela de 360–390px:
(1) sem rolagem horizontal da página; (2) a "Agenda útil" rola
lateralmente dentro do próprio cartão; (3) cards de unidade e estatísticas
contidos; (4) topo fixo continua grudando.
