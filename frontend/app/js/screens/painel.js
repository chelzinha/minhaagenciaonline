/* =====================================================
   APP ETIQUETAS — Screen: painel (aba Entregas)
   =====================================================
   Mostra o panorama de entrega dos objetos do cliente logado,
   cruzando o histórico de postagens com o rastreio já sincronizado
   pelo backend (aba RASTREIO_OBJETOS).

   REGRA DE ATRASO
     Contada em DIAS ÚTEIS DE ENTREGA do serviço, nunca em dias corridos.
       SEDEX entrega de segunda a sábado.
       PAC entrega apenas de segunda a sexta.
       Feriados nacionais, do Ceará e de Fortaleza não contam para nenhum.
     Conta-se quantos dias de entrega foram perdidos entre a previsão e a
     entrega (ou a data de hoje, se o objeto ainda estiver a caminho).
     Ex.: previsão terça, entrega quinta -> só a quarta foi perdida -> 1 dia.

   OS QUATRO ESTADOS SÃO EXCLUSIVOS
     Cada objeto está em um e apenas um deles, e a soma é sempre igual ao
     total de objetos do período.

   Sem dependência externa: o donut é SVG e as barras são CSS.
   ===================================================== */

Screens.painel = (function () {

  const PERIODOS = [30, 60, 90, 0];
  const PERIODO_PADRAO = 60;

  let _dados = null;      // resposta crua do backend
  let _linhas = [];       // linhas já calculadas
  let _dias = PERIODO_PADRAO;
  let _grupoAberto = -1;

  function $(id) { return document.getElementById(id); }
  const esc = s => (UI && UI.escapeHtml) ? UI.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);

  // ==========================================================
  // CALENDÁRIO DE ENTREGA
  // ==========================================================
  const DIA_MS = 86400000;
  const SABADO_ENTREGA = { SEDEX: true, PAC: false };
  let _feriados = null;

  function pascoa_(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
  }
  const isoDia_ = dt => dt.toISOString().slice(0, 10);

  function feriados_(anos) {
    const s = {};
    anos.forEach(function (y) {
      const p = pascoa_(y);
      [[0,1],[3,21],[4,1],[8,7],[9,12],[10,2],[10,15],[10,20],[11,25],[2,25],[7,15]]
        .forEach(function (md) { s[isoDia_(new Date(Date.UTC(y, md[0], md[1])))] = 1; });
      [-48, -47, -2, 60].forEach(function (off) { s[isoDia_(new Date(p.getTime() + off * DIA_MS))] = 1; });
    });
    return s;
  }
  function ehDiaEntrega_(dt, servico) {
    const wd = dt.getUTCDay();
    if (wd === 0) return false;
    if (wd === 6 && !SABADO_ENTREGA[servico]) return false;
    return !_feriados[isoDia_(dt)];
  }
  /** Dias de entrega perdidos estritamente entre prazo e fim. */
  function atrasoUtil_(prazo, fim, servico) {
    if (prazo == null || fim == null || fim <= prazo) return 0;
    let n = 0;
    for (let d = prazo + DIA_MS; d < fim; d += DIA_MS) if (ehDiaEntrega_(new Date(d), servico)) n++;
    return n;
  }

  /** Aceita 'dd/MM/yyyy HH:mm', 'dd/MM/yyyy' e ISO. Devolve ms UTC do dia, ou null. */
  function parseData_(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (br) return Date.UTC(+br[3], +br[2] - 1, +br[1]);
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function fmtData_(ms) {
    if (ms == null) return '';
    const d = new Date(ms);
    const p = x => String(x).padStart(2, '0');
    return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }
  function parseValor_(v) {
    let s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // ==========================================================
  // CLASSIFICAÇÃO
  // ==========================================================
  const EST = [
    { k: 'ent',   t: 'Entregues',          cor: 'var(--ok)',   ico: 'check_circle' },
    { k: 'prazo', t: 'Dentro da previsão', cor: 'var(--nv)',   ico: 'local_shipping' },
    { k: 'alem',  t: 'Além da previsão',   cor: 'var(--warn)', ico: 'schedule' },
    { k: 'acao',  t: 'Exigem ação',        cor: 'var(--err)',  ico: 'warning' }
  ];

  const GRUPOS = [
    { t: 'Entregues',           cor: '#15803D', ico: 'check_circle' },
    { t: 'Em trânsito',         cor: '#0891B2', ico: 'local_shipping' },
    { t: 'Saiu para entrega',   cor: '#00416B', ico: 'send' },
    { t: 'Aguardando retirada', cor: '#B45309', ico: 'inbox' },
    { t: 'Ocorrências atuais',  cor: '#B91C1C', ico: 'warning' }
  ];

  const FAMS = [
    { k: 'ret', t: 'Retirada pendente',     sub: 'Depende do destinatário',            ico: 'inbox' },
    { k: 'ten', t: 'Tentativa sem sucesso', sub: 'Depende de nova saída do carteiro',  ico: 'door_front' },
    { k: 'end', t: 'Problema de endereço',  sub: 'Depende de correção no cadastro',    ico: 'wrong_location' }
  ];

  const FAIXAS = [
    { t: '1 dia útil',           d: 1, cor: '#D97706' },
    { t: '2 dias úteis',         d: 2, cor: '#C2410C' },
    { t: '3 dias úteis',         d: 3, cor: '#B91C1C' },
    { t: '4 dias úteis ou mais', d: 4, cor: '#7F1D1D' }
  ];

  const ehEntregue_ = s => /entregue ao destinat|caixa de correios/i.test(s);
  const ehAcao_ = s => /n[ãa]o entregue|inconsist|tentativa|cancelada|retirada/i.test(s);

  function familia_(s) {
    if (/retirada/i.test(s)) return 0;
    if (/carteiro n[ãa]o atendido|tentativa|cancelada/i.test(s)) return 1;
    return 2;
  }
  function grupo_(s) {
    if (ehEntregue_(s)) return 0;
    if (/retirada/i.test(s)) return 3;
    if (/saiu para entrega/i.test(s)) return 2;
    if (/n[ãa]o entregue|inconsist|tentativa|cancelada/i.test(s)) return 4;
    return 1;
  }

  /** Transforma a resposta do backend em linhas prontas para o painel. */
  function calcular_(resp) {
    const linhas = (resp && resp.linhas) || [];
    const anos = {};
    linhas.forEach(function (l) {
      const p = parseData_(l.postagem);
      if (p) anos[new Date(p).getUTCFullYear()] = 1;
      const z = parseData_(l.previsao);
      if (z) anos[new Date(z).getUTCFullYear()] = 1;
    });
    const lista = [];
    Object.keys(anos).forEach(function (y) { lista.push(+y - 1, +y, +y + 1); });
    if (!lista.length) lista.push(new Date().getFullYear());
    _feriados = feriados_(lista.filter(function (v, i, a) { return a.indexOf(v) === i; }));

    const hoje = (function () { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); })();

    return linhas.map(function (l) {
      const serv = String(l.servico || '').toUpperCase();
      const sit = String(l.situacao || '');
      const post = parseData_(l.postagem);
      const prev = parseData_(l.previsao);
      const dSit = parseData_(l.dataSituacao);
      const entregue = ehEntregue_(sit);
      const acao = !entregue && ehAcao_(sit);

      const fim = entregue ? (dSit || hoje) : hoje;
      const atraso = prev == null ? 0 : atrasoUtil_(prev, fim, serv);
      const parado = entregue ? 0 : (dSit ? atrasoUtil_(dSit, hoje, serv) : 0);

      // rel: -3 sem referência | -2 antes | -1 na data ou dia útil seguinte | >=1 atraso
      let rel = -3;
      if (entregue && prev != null && dSit != null) {
        rel = dSit < prev ? -2 : (dSit === prev ? -1 : (atraso === 0 ? -1 : atraso));
      }

      let estado;
      if (entregue) estado = 0;
      else if (acao) estado = 3;
      else if (prev != null && atraso >= 1) estado = 2;
      else estado = 1;

      return {
        objeto: l.objeto, servico: serv, cidade: l.cidade, uf: l.uf,
        valor: parseValor_(l.valor),
        postagem: post, previsao: prev, dataSituacao: dSit,
        situacao: sit || 'Sem informação de rastreio',
        semRastreio: !sit,
        estado: estado, atraso: atraso, parado: parado, rel: rel,
        grupo: sit ? grupo_(sit) : 1,
        familia: acao ? familia_(sit) : -1
      };
    });
  }

  // ==========================================================
  // RENDER
  // ==========================================================
  const nInt = n => Number(n || 0).toLocaleString('pt-BR');
  const nPct = (a, b) => b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '0,0%';
  const nBrl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ico = (n, cls) => '<span class="material-symbols-rounded' + (cls ? ' ' + cls : '') + '">' + n + '</span>';

  function render_() {
    const box = $('painelConteudo');
    if (!box) return;

    if (!_linhas.length) {
      box.innerHTML =
        '<div class="pnl-vazio">' + ico('inbox', 'pnl-vazio-ico') +
        '<div><b>Nenhuma postagem no período.</b>' +
        'Troque o período acima ou gere uma etiqueta para começar.</div></div>';
      return;
    }

    box.innerHTML =
      blocoKpis_() +
      blocoAndamento_() +
      blocoEntregas_() +
      blocoAtraso_() +
      blocoAcao_() +
      blocoCidades_() +
      blocoNota_();

    box.querySelectorAll('[data-grupo]').forEach(function (el) {
      el.addEventListener('click', function () {
        const i = Number(el.getAttribute('data-grupo'));
        _grupoAberto = (_grupoAberto === i) ? -1 : i;
        render_();
      });
    });
  }

  function contarEstados_() {
    const e = [0, 0, 0, 0];
    _linhas.forEach(function (l) { e[l.estado]++; });
    return e;
  }

  function blocoKpis_() {
    const e = contarEstados_();
    const n = _linhas.length;
    const valor = _linhas.reduce(function (s, l) { return s + l.valor; }, 0);

    const cards = EST.map(function (E, i) {
      return '<div class="pnl-kpi pnl-kpi-' + E.k + '">' +
        '<div class="pnl-kpi-ico">' + ico(E.ico) + '</div>' +
        '<div class="pnl-kpi-body"><div class="pnl-kpi-lab">' + E.t + '</div>' +
        '<div class="pnl-kpi-val">' + nInt(e[i]) + '</div>' +
        '<div class="pnl-kpi-sub">' + nPct(e[i], n) + ' do total</div></div></div>';
    }).join('');

    const mix = EST.map(function (E, i) {
      return e[i] ? '<span style="width:' + (e[i] / n * 100) + '%;background:' + E.cor + '"></span>' : '';
    }).join('');

    return '<section class="card pnl-card">' +
      '<div class="pnl-total"><div><div class="pnl-total-lab">Objetos no período</div>' +
      '<div class="pnl-total-val">' + nInt(n) + '</div></div>' +
      '<div class="pnl-total-valor"><div class="pnl-total-lab">Valor postado</div>' +
      '<div class="pnl-total-brl">' + nBrl(valor) + '</div></div></div>' +
      '<div class="pnl-mix">' + mix + '</div>' +
      '<div class="pnl-kpis">' + cards + '</div>' +
      '</section>';
  }

  function blocoAndamento_() {
    const g = GRUPOS.map(function () { return { n: 0, sub: {} }; });
    _linhas.forEach(function (l) {
      const k = l.grupo;
      g[k].n++;
      g[k].sub[l.situacao] = (g[k].sub[l.situacao] || 0) + 1;
    });
    const tot = _linhas.length;
    const maxN = Math.max.apply(null, g.map(function (x) { return x.n; }).concat([1]));

    // Donut em SVG: cada fatia é um arco desenhado com stroke-dasharray.
    const R = 54, C = 2 * Math.PI * R;
    let off = 0;
    const arcos = GRUPOS.map(function (G, i) {
      if (!g[i].n) return '';
      const frac = g[i].n / tot;
      const seg = '<circle class="pnl-arc" cx="70" cy="70" r="' + R + '" fill="none" stroke="' + G.cor +
        '" stroke-width="18" stroke-dasharray="' + (frac * C) + ' ' + C +
        '" stroke-dashoffset="' + (-off * C) + '" transform="rotate(-90 70 70)"></circle>';
      off += frac;
      return seg;
    }).join('');

    const linhas = GRUPOS.map(function (G, i) {
      const aberto = _grupoAberto === i;
      const det = aberto
        ? '<div class="pnl-sub">' + Object.keys(g[i].sub).sort(function (a, b) { return g[i].sub[b] - g[i].sub[a]; })
            .map(function (s) { return '<div><span>' + esc(s) + '</span><span>' + nInt(g[i].sub[s]) + '</span></div>'; })
            .join('') + '</div>'
        : '';
      return '<button type="button" class="pnl-linha' + (aberto ? ' is-open' : '') + '" data-grupo="' + i + '">' +
        '<span class="pnl-linha-nome">' + ico(G.ico) + '<span>' + esc(G.t) + '</span></span>' +
        '<span class="pnl-linha-bar"><i style="width:' + Math.max(4, g[i].n / maxN * 100) + '%;background:' + G.cor + '"></i></span>' +
        '<span class="pnl-linha-num">' + nInt(g[i].n) + ' <em>' + nPct(g[i].n, tot) + '</em></span>' +
        '</button>' + det;
    }).join('');

    return '<section class="card pnl-card">' +
      '<div class="card-head"><h2>Andamento</h2>' +
      '<span class="badge badge-ok">' + nPct(g[0].n, tot) + ' concluído</span></div>' +
      '<div class="pnl-donut-wrap">' +
      '<div class="pnl-donut"><svg viewBox="0 0 140 140" aria-hidden="true">' +
      '<circle cx="70" cy="70" r="54" fill="none" stroke="var(--line)" stroke-width="18"></circle>' + arcos +
      '</svg><div class="pnl-donut-c"><b>' + Math.round(g[0].n / tot * 100) + '%</b><span>entregues</span></div></div>' +
      '<div class="pnl-linhas">' + linhas + '</div></div></section>';
  }

  function blocoEntregas_() {
    const B = [
      { t: 'Antes da data prevista', cor: '#166534', prazo: true },
      { t: 'Na data prevista',       cor: '#15803D', prazo: true },
      { t: '1 dia útil de atraso',   cor: '#D97706', prazo: false },
      { t: '2 dias úteis de atraso', cor: '#C2410C', prazo: false },
      { t: '3 dias úteis ou mais',   cor: '#B91C1C', prazo: false }
    ];
    const c = [0, 0, 0, 0, 0];
    let tot = 0, noPrazo = 0, semRef = 0;
    _linhas.forEach(function (l) {
      if (l.estado !== 0) return;
      if (l.rel === -3) { semRef++; return; }
      const k = l.rel === -2 ? 0 : (l.rel <= 0 ? 1 : (l.rel === 1 ? 2 : (l.rel === 2 ? 3 : 4)));
      c[k]++; tot++;
      if (B[k].prazo) noPrazo++;
    });
    if (!tot) {
      return '<section class="card pnl-card"><div class="card-head"><h2>Entregas x previsão</h2></div>' +
        '<p class="pnl-desc">Nenhuma entrega concluída com previsão de referência neste período.</p></section>';
    }
    const max = Math.max.apply(null, c);
    const barras = B.map(function (b, i) {
      return '<div class="pnl-faixa">' +
        '<span class="pnl-faixa-lab">' + b.t + '</span>' +
        '<span class="pnl-faixa-bar"><i style="width:' + (c[i] / max * 100) + '%;background:' + b.cor + '"></i></span>' +
        '<span class="pnl-faixa-n" style="color:' + (c[i] ? b.cor : 'var(--muted-2)') + '">' + nInt(c[i]) + '</span></div>';
    }).join('');

    const pct = noPrazo / tot;
    return '<section class="card pnl-card">' +
      '<div class="card-head"><h2>Entregas x previsão</h2>' +
      '<span class="badge ' + (pct >= 0.9 ? 'badge-ok' : pct >= 0.75 ? 'badge-warn' : 'badge-err') + '">' +
      nPct(noPrazo, tot) + ' no prazo</span></div>' +
      '<p class="pnl-desc">Somente objetos já entregues. O atraso é contado em dias úteis de entrega do serviço.' +
      (semRef ? ' ' + nInt(semRef) + ' sem previsão de referência.' : '') + '</p>' +
      '<div class="pnl-faixas">' + barras + '</div></section>';
  }

  function blocoAtraso_() {
    const f = FAIXAS.map(function () { return { total: 0, acao: 0 }; });
    let tot = 0;
    _linhas.forEach(function (l) {
      if (l.estado === 0 || l.atraso < 1) return;
      const k = l.atraso === 1 ? 0 : l.atraso === 2 ? 1 : l.atraso === 3 ? 2 : 3;
      f[k].total++; if (l.estado === 3) f[k].acao++;
      tot++;
    });
    if (!tot) {
      return '<section class="card pnl-card"><div class="card-head"><h2>Atraso a caminho</h2>' +
        '<span class="badge badge-ok">nenhum atraso</span></div>' +
        '<p class="pnl-desc">Nenhum objeto a caminho perdeu um dia útil de entrega.</p></section>';
    }
    const max = Math.max.apply(null, f.map(function (x) { return x.total; }));
    const grave = f[3].total;
    const barras = FAIXAS.map(function (F, i) {
      const x = f[i], w = x.total / max * 100, p = x.total ? (x.total - x.acao) / x.total : 0;
      return '<div class="pnl-faixa">' +
        '<span class="pnl-faixa-lab">' + F.t + '</span>' +
        '<span class="pnl-faixa-bar">' +
        (x.total ? '<i style="width:' + (w * p) + '%;background:' + F.cor + '"></i>' +
                   '<i style="width:' + (w * (1 - p)) + '%;background:' + F.cor + ';opacity:.45"></i>' : '') +
        '</span>' +
        '<span class="pnl-faixa-n" style="color:' + (x.total ? F.cor : 'var(--muted-2)') + '">' + nInt(x.total) + '</span></div>';
    }).join('');

    return '<section class="card pnl-card">' +
      '<div class="card-head"><h2>Atraso a caminho</h2>' +
      '<span class="badge ' + (grave ? 'badge-err' : 'badge-warn') + '">' + nInt(tot) + ' com atraso</span></div>' +
      '<p class="pnl-desc">Dias úteis de entrega perdidos desde a data prevista. Tom claro: também exige ação.</p>' +
      '<div class="pnl-faixas">' + barras + '</div>' +
      '<div class="pnl-alerta ' + (grave ? 'is-err' : 'is-warn') + '">' + ico(grave ? 'warning' : 'schedule') +
      '<span>' + (grave
        ? '<b>' + nInt(grave) + '</b> objeto(s) com quatro dias úteis ou mais. Vale abrir reclamação nos Correios.'
        : '<b>' + nInt(tot) + '</b> objeto(s) com atraso, nenhum passando de três dias úteis.') +
      '</span></div></section>';
  }

  function blocoAcao_() {
    const porFam = [0, 0, 0], porSit = {};
    let tot = 0, parados = 0;
    _linhas.forEach(function (l) {
      if (l.estado !== 3) return;
      porFam[l.familia]++;
      (porSit[l.situacao] = porSit[l.situacao] || { n: 0, par: [0, 0, 0, 0], fam: l.familia });
      porSit[l.situacao].n++;
      const pb = l.parado <= 0 ? 0 : l.parado === 1 ? 1 : l.parado === 2 ? 2 : 3;
      porSit[l.situacao].par[pb]++;
      if (l.parado >= 1) parados++;
      tot++;
    });
    if (!tot) {
      return '<section class="card pnl-card"><div class="card-head"><h2>Exigem ação</h2>' +
        '<span class="badge badge-ok">nenhum</span></div>' +
        '<p class="pnl-desc">Nenhum objeto travado. Tudo em movimento.</p></section>';
    }
    const fams = FAMS.map(function (F, i) {
      return '<div class="pnl-fam pnl-fam-' + F.k + '">' + ico(F.ico) +
        '<div><b>' + nInt(porFam[i]) + '</b><span>' + F.t + '</span></div></div>';
    }).join('');

    const PAR = ['sem dia parado', 'há 1 dia útil', 'há 2 dias úteis', 'há 3 dias ou mais'];
    const cards = Object.keys(porSit).sort(function (a, b) { return porSit[b].n - porSit[a].n; })
      .map(function (s) {
        const x = porSit[s];
        const tags = x.par.map(function (v, i) {
          return v ? '<span class="pnl-tag pnl-tag-' + i + '"><b>' + nInt(v) + '</b> ' + PAR[i] + '</span>' : '';
        }).join('');
        return '<div class="pnl-ac pnl-ac-' + FAMS[x.fam].k + '">' +
          '<div class="pnl-ac-n">' + nInt(x.n) + '</div>' +
          '<div class="pnl-ac-t">' + esc(s) + '</div>' +
          '<div class="pnl-ac-tags"><span class="pnl-ac-lab">Tempo parado</span>' + tags + '</div></div>';
      }).join('');

    return '<section class="card pnl-card">' +
      '<div class="card-head"><h2>Exigem ação</h2>' +
      '<span class="badge badge-warn">' + nInt(tot) + ' parados</span></div>' +
      '<p class="pnl-desc">Não se resolvem sozinhos. ' + nInt(parados) + ' sem mover há 1 dia útil ou mais.</p>' +
      '<div class="pnl-fams">' + fams + '</div>' +
      '<div class="pnl-acs">' + cards + '</div></section>';
  }

  function blocoCidades_() {
    const m = {};
    _linhas.forEach(function (l) {
      const k = l.cidade + '|' + l.uf;
      (m[k] = m[k] || { nome: l.cidade, uf: l.uf, obj: 0, ent: 0, alem: 0, acao: 0 });
      const a = m[k]; a.obj++;
      if (l.estado === 0) a.ent++;
      else if (l.estado === 2) a.alem++;
      else if (l.estado === 3) a.acao++;
    });
    const lista = Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.obj - a.obj; }).slice(0, 15);

    const linhas = lista.map(function (a) {
      const p = Math.round(a.ent / a.obj * 100);
      const cor = p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--warn)' : 'var(--err)';
      return '<div class="pnl-cid">' +
        '<div class="pnl-cid-nome">' + esc(a.nome) + '<span>' + esc(a.uf) + '</span></div>' +
        '<div class="pnl-cid-bar"><i style="width:' + p + '%;background:' + cor + '"></i></div>' +
        '<div class="pnl-cid-n">' + p + '%<em>' + nInt(a.ent) + '/' + nInt(a.obj) + '</em></div>' +
        '</div>';
    }).join('');

    const total = Object.keys(m).length;
    return '<section class="card pnl-card">' +
      '<div class="card-head"><h2>Taxa de entrega por cidade</h2></div>' +
      '<p class="pnl-desc">' + (total > 15 ? '15 cidades de maior volume, de ' + nInt(total) + ' no total.' : nInt(total) + ' cidade(s).') + '</p>' +
      '<div class="pnl-cids">' + linhas + '</div></section>';
  }

  function blocoNota_() {
    const sem = _linhas.filter(function (l) { return l.semRastreio; }).length;
    const quando = _dados && _dados.atualizadoEm ? new Date(_dados.atualizadoEm) : null;
    const q = quando && !isNaN(quando.getTime())
      ? quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '';
    return '<div class="pnl-rodape">' +
      (sem ? '<p>' + ico('sync') + nInt(sem) + ' objeto(s) ainda sem informação de rastreio. Eles entram no total, mas ficam fora do cálculo de prazo.</p>' : '') +
      '<p><b>Como o atraso é contado:</b> em dias úteis de entrega, nunca em dias corridos. SEDEX entrega de segunda a sábado, PAC só de segunda a sexta. Feriados não contam.</p>' +
      (q ? '<p class="pnl-rodape-ts">Rastreio atualizado em ' + q + '</p>' : '') +
      '</div>';
  }

  // ==========================================================
  // CARGA
  // ==========================================================
  async function carregar_() {
    const box = $('painelConteudo');
    if (box) box.innerHTML = '<div class="pnl-load">' + ico('progress_activity', 'pnl-spin') + 'Carregando suas entregas...</div>';
    try {
      _dados = await Api.call('painelCliente', { dias: _dias });
      _linhas = calcular_(_dados);
      render_();
    } catch (e) {
      if (box) {
        box.innerHTML = '<div class="pnl-erro">' + ico('error') +
          '<div><b>Não foi possível carregar.</b>' + esc(e && e.message ? e.message : e) +
          '<button class="btn btn-ghost btn-sm" type="button" id="painelRetry">Tentar novamente</button></div></div>';
        const r = $('painelRetry');
        if (r) r.addEventListener('click', carregar_);
      }
    }
  }

  function montarSeletor_() {
    const seg = $('painelPeriodo');
    if (!seg) return;
    seg.innerHTML = PERIODOS.map(function (d) {
      const lab = d === 0 ? 'Tudo' : d + ' dias';
      return '<button type="button" class="seg-item' + (d === _dias ? ' is-active' : '') + '" data-dias="' + d + '">' + lab + '</button>';
    }).join('');
    seg.querySelectorAll('[data-dias]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = Number(b.getAttribute('data-dias'));
        if (d === _dias) return;
        _dias = d; _grupoAberto = -1;
        montarSeletor_();
        carregar_();
      });
    });
  }

  function mount() {
    _grupoAberto = -1;
    montarSeletor_();
    carregar_();
  }

  return { mount: mount };

})();
