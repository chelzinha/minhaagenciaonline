/* =====================================================
   /simulador - Simulador de Frete (página pública)
   Dados: agf-balcao-api (/api/simulador), mesmo motor D1 do /balcao e do /comparador.
   Fluxo: perfil -> embalagem -> peso -> destino (CEP ou mapa) -> resultado.
   ===================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- CFG
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787/api/simulador'
    : 'https://agf-balcao-api.chelzinha.workers.dev/api/simulador';
  var WHATSAPP = '5585920023386';
  var ORDEM_TIPOS = ['RMF', 'CAPITAL', 'POLO', 'MEDIA', 'CE_POLO', 'DIVISA', 'INTERIOR', 'CE_INT'];
  var ROTULO_CURTO = { RMF: 'Região metropolitana', CAPITAL: 'Capital', POLO: 'Cidade polo', MEDIA: 'Cidade média', CE_POLO: 'Cidade polo', DIVISA: 'Mossoró', INTERIOR: 'Interior', CE_INT: 'Interior' };
  var GRADE = { RR: [2, 0], AP: [4, 0], AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1], AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2], MS: [2, 3], GO: [3, 3], DF: [4, 3], BA: [5, 3], AL: [6, 3], SP: [3, 4], MG: [4, 4], ES: [5, 4], SE: [6, 4], PR: [3, 5], RJ: [4, 5], SC: [3, 6], RS: [3, 7] };
  var IC = {
    envelope: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    roupa: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    pacote: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    caminhao: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    loja: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
    contrato: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    clube: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
    app: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    ok: '<path d="M20 6 9 17l-5-5"/>',
    alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };
  var PERFIS = [
    { k: 'env', nome: 'Envelope', ic: 'envelope', cx: 'MINI', p: 300 },
    { k: 'leve', nome: 'Caixa leve', ic: 'roupa', cx: 'T2', p: 1000 },
    { k: 'media', nome: 'Caixa média', ic: 'pacote', cx: 'T4', p: 5000 },
    { k: 'grande', nome: 'Caixa grande', ic: 'caminhao', cx: 'T5', p: 15000 }
  ];

  // ---------------------------------------------------------------- estado
  var S = { cx: 'T2', p: 1000, uf: 'SP', tipo: 'CAPITAL', serv: 'SEDEX', regra: 'PESO', modo: 'cap', cidade: '' };
  var CFG = null;           // { ufs, caixas, pesos, vigencia }
  var PRECOS = new Map();   // c|l|a|p -> dados
  var atual = null;         // preços da embalagem atual
  var pedido = 0;
  var resultadoVisivel = false; // a barra do celular some quando o resultado já está na tela

  // ---------------------------------------------------------------- helpers
  var $ = function (id) { return document.getElementById(id); };
  function ic(nome, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[nome] + '</svg>'; }
  function brl(v) { return v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function kg(g) { return g < 1000 ? g + ' g' : (g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function caixa(cod) { return CFG.caixas.find(function (c) { return c.codigo === cod; }); }
  function medidasTxt(m) { return m.map(function (v) { return String(v).replace('.', ','); }).join(' x '); }
  function pressionar(grupo, botao) { grupo.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === botao)); }); }

  async function api(caminho) {
    var resp, data;
    try { resp = await fetch(API + caminho, { headers: { Accept: 'application/json' } }); data = await resp.json(); }
    catch (e) { throw new Error('Sem conexão com o simulador. Confira a internet e tente de novo.'); }
    if (!resp.ok || !data || data.ok === false) throw new Error((data && data.erro) || 'Não foi possível simular agora. Tente de novo.');
    return data.data;
  }

  function tipoPadrao(uf, modo) {
    var t = CFG.ufs[uf] || {};
    if (modo === 'cap') return t.RMF ? 'RMF' : 'CAPITAL';
    return t.CE_INT ? 'CE_INT' : (t.INTERIOR ? 'INTERIOR' : Object.keys(t)[0]);
  }

  /** Valores da zona para o serviço e a regra do App escolhidos. */
  function valores(zona) {
    var z = atual && atual.zonas[zona];
    if (!z) return null;
    var base = S.serv === 'MINI' ? 'PAC' : S.serv;
    var app = S.regra === 'PESO' ? z.APP_PESO : z.APP_VOLUME;
    return {
      AVISTA: z.AVISTA[base],
      PLATINUM: z.PLATINUM[S.serv],
      CLUBE: z.CLUBE[S.serv],
      APP: app[base]
    };
  }
  function menor(v) {
    var xs = [v.PLATINUM, v.CLUBE, v.APP].filter(function (x) { return x != null; });
    return xs.length ? Math.min.apply(null, xs) : null;
  }

  // ---------------------------------------------------------------- render: entrada
  function caixaSvg(m) {
    var c = m[0], l = m[1], a = m[2], k = 1.05, w = c * k, d = l * k * .5, h = a * k, W = 62, H = 50;
    var ox = (W - (w + d)) / 2, oy = H - (H - (h + d * .6)) / 2;
    function p(x, y) { return (ox + x).toFixed(1) + ',' + (oy - y).toFixed(1); }
    var frente = [p(0, 0), p(w, 0), p(w, h), p(0, h)].join(' ');
    var topo = [p(0, h), p(w, h), p(w + d, h + d * .6), p(d, h + d * .6)].join(' ');
    var lado = [p(w, 0), p(w + d, d * .6), p(w + d, h + d * .6), p(w, h)].join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polygon class="cx-lado" points="' + lado + '"/><polygon class="cx-topo" points="' + topo + '"/>' +
      '<polygon class="cx-corpo" points="' + frente + '"/><line class="cx-fita" x1="' + (ox + w * .5).toFixed(1) + '" y1="' + (oy - h).toFixed(1) + '" x2="' + (ox + w * .5 + d).toFixed(1) + '" y2="' + (oy - h - d * .6).toFixed(1) + '"/></svg>';
  }
  function renderPerfis() {
    $('perfil').innerHTML = PERFIS.map(function (f) {
      var on = S.cx === f.cx && S.p === f.p;
      return '<button type="button" class="sm-op" data-k="' + f.k + '" aria-pressed="' + on + '">' + ic(f.ic) + '<b>' + f.nome + '</b></button>';
    }).join('');
  }
  function renderCaixas() {
    $('caixas').innerHTML = CFG.caixas.map(function (c) {
      return '<button type="button" class="sm-op' + (c.destaque ? ' sm-mini' : '') + '" data-cx="' + c.codigo + '" aria-pressed="' + (S.cx === c.codigo) + '" aria-label="' + esc(c.nome) + ', ' + medidasTxt(c.medidas) + ' cm">' +
        (c.destaque ? '<span class="sm-selo">Mini Envios</span>' : '') + caixaSvg(c.medidas) +
        '<b>' + (c.destaque ? 'Envelope' : esc(c.nome)) + '</b><small>' + medidasTxt(c.medidas) + '</small></button>';
    }).join('');
  }
  function renderPesos() {
    var cx = caixa(S.cx);
    $('pesos').innerHTML = CFG.pesos.map(function (p) {
      var bloqueado = cx.pesoMaxG && p > cx.pesoMaxG;
      return '<button type="button" class="sm-op num" data-p="' + p + '" aria-pressed="' + (S.p === p) + '"' + (bloqueado ? ' disabled' : '') + '>' + kg(p) + '</button>';
    }).join('');
  }
  function renderMapa() {
    var vals = Object.keys(GRADE).map(function (uf) { var v = valores((CFG.ufs[uf][tipoPadrao(uf, S.modo)] || {}).zona); return v ? menor(v) : null; });
    var ord = vals.filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
    var q = [.2, .4, .6, .8].map(function (f) { return ord[Math.floor(f * (ord.length - 1))]; });
    function classe(v) { return v == null ? 0 : v <= q[0] ? 1 : v <= q[1] ? 2 : v <= q[2] ? 3 : v <= q[3] ? 4 : 5; }
    $('mapa').innerHTML = Object.keys(GRADE).map(function (uf, i) {
      var g = GRADE[uf], v = vals[i];
      return '<button type="button" class="sm-uf c' + classe(v) + (uf === 'CE' ? ' origem' : '') + '" data-uf="' + uf + '" aria-pressed="' + (S.uf === uf) + '"' +
        ' style="grid-column:' + (g[0] + 1) + ';grid-row:' + (g[1] + 1) + '" aria-label="' + uf + ', a partir de ' + brl(v) + '"><b>' + uf + '</b><small class="num">' + (v == null ? '' : Math.round(v)) + '</small></button>';
    }).join('');
  }
  function renderTipos() {
    var t = CFG.ufs[S.uf] || {};
    $('tipos').innerHTML = ORDEM_TIPOS.filter(function (k) { return t[k]; }).map(function (k) {
      var g = t[k];
      var ex = g.ex.length ? g.ex.join(', ') + (g.n > g.ex.length ? ' e mais ' + (g.n - g.ex.length) : '') : 'Demais cidades do estado';
      return '<button type="button" class="sm-op" data-t="' + k + '" aria-pressed="' + (S.tipo === k) + '"><b>' + esc(g.nome) + '</b><small>' + esc(ex) + '</small></button>';
    }).join('');
  }
  function renderServico() {
    var mini = S.cx === 'MINI';
    $('servico').querySelectorAll('button').forEach(function (b) {
      if (b.dataset.v === 'MINI') b.disabled = !mini;
      b.setAttribute('aria-pressed', String(b.dataset.v === S.serv));
    });
  }

  // ---------------------------------------------------------------- render: resultado
  function renderResultado() {
    var g = (CFG.ufs[S.uf] || {})[S.tipo];
    var cx = caixa(S.cx);
    $('destNome').textContent = S.cidade || (g ? ROTULO_CURTO[S.tipo] : '-');
    var rotulo = ROTULO_CURTO[S.tipo];
    if (S.tipo === 'CAPITAL' && S.cidade && g && g.ex[0] && g.ex[0].toLowerCase() !== S.cidade.toLowerCase()) rotulo = 'Região metropolitana';
    $('destUf').textContent = S.cidade ? S.uf + ' · ' + rotulo : S.uf;
    $('meta').textContent = (S.serv === 'MINI' ? 'Mini Envios' : S.serv) + ' · ' + (cx.destaque ? 'Envelope Mini Envios' : cx.nome) + ' (' + medidasTxt(cx.medidas) + ' cm) · ' + kg(S.p);
    if (!atual || !g) return;
    var v = valores(g.zona);
    var m = menor(v);
    var ops = [
      { k: 'AVISTA', nome: 'Balcão à vista', ic: 'loja', ref: true },
      { k: 'PLATINUM', nome: 'Platinum', ic: 'contrato' },
      { k: 'CLUBE', nome: 'Clube Correios', ic: 'clube' },
      { k: 'APP', nome: 'Correios App', ic: 'app' }
    ];
    $('opcoes').innerHTML = ops.map(function (o) {
      var val = v[o.k];
      var melhor = !o.ref && val != null && val === m;
      var pct = !o.ref && val != null && v.AVISTA ? Math.round((1 - val / v.AVISTA) * 100) : null;
      var chips = (o.ref ? '<span class="sm-chip ref">Referência</span>' : '') + (melhor ? '<span class="sm-chip melhor">Mais barato</span>' : '') +
        (S.serv === 'MINI' && (o.k === 'PLATINUM' || o.k === 'CLUBE') && val != null ? '<span class="sm-chip mini">Mini Envios</span>' : '');
      var preco = val == null
        ? '<b>Indisponível</b>'
        : '<b class="num">' + brl(val) + '</b>' + (pct == null ? '' : '<span class="num' + (pct < 0 ? ' mais' : '') + '">' + (pct >= 0 ? '-' + pct : '+' + Math.abs(pct)) + '%</span>');
      return '<div class="sm-opc' + (o.ref ? ' ref' : '') + (melhor ? ' melhor' : '') + (val == null ? ' indisp' : '') + '" data-k="' + o.k + '">' +
        '<span class="sm-opc-ic">' + ic(o.ic) + '</span><div class="sm-opc-nome">' + o.nome + chips + '</div><div class="sm-opc-val">' + preco + '</div></div>';
    }).join('');

    var box = $('economia');
    if (m != null && v.AVISTA) {
      var nomes = [];
      if (v.PLATINUM === m) nomes.push('Platinum');
      if (v.CLUBE === m) nomes.push('Clube Correios');
      if (v.APP === m) nomes.push('Correios App');
      var eco = v.AVISTA - m;
      box.innerHTML = '<span class="pct num">' + Math.round((1 - m / v.AVISTA) * 100) + '%</span><p>Com <b>' + nomes.join(' ou ') + '</b>: <b class="num">' + brl(eco) + '</b> a menos por envio. Em 100 envios por mês, <b class="num">' + brl(eco * 100) + '</b>.</p>';
      box.hidden = false;
      $('barra').innerHTML = '<span>' + esc(nomes[0]) + '<br><b class="num">' + brl(m) + '</b></span><em class="num">-' + Math.round((1 - m / v.AVISTA) * 100) + '%</em>';
      $('barra').hidden = resultadoVisivel;
      var txt = 'Olá! Fiz uma simulação de frete no site: ' + (S.serv === 'MINI' ? 'Mini Envios' : S.serv) + ', ' + (cx.destaque ? 'envelope Mini Envios' : 'caixa ' + cx.nome) + ', ' + kg(S.p) +
        ', de Fortaleza para ' + (S.cidade ? S.cidade + '/' : '') + S.uf + ' (' + ROTULO_CURTO[S.tipo] + '). Quero conhecer as condições do ' + nomes[0] + '.';
      $('cta').href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(txt);
    } else {
      box.hidden = true;
      $('barra').hidden = true;
    }
  }

  function carregandoResultado() {
    $('opcoes').innerHTML = '<div class="sm-carregando" aria-label="Calculando"><i></i><i></i><i></i><i></i></div>';
  }
  function erroResultado(msg) {
    $('economia').hidden = true; $('barra').hidden = true;
    $('opcoes').innerHTML = '<div class="sm-aviso" role="alert">' + ic('alerta') + '<span>' + esc(msg) + '</span><button type="button" id="tentar">Tentar de novo</button></div>';
  }

  function renderTudo() {
    renderPerfis(); renderCaixas(); renderPesos(); renderServico(); renderTipos();
    if (atual) renderMapa();
    renderResultado();
  }

  // ---------------------------------------------------------------- dados
  async function atualizarPrecos() {
    var cx = caixa(S.cx), m = cx.medidas;
    var chave = m.join('|') + '|' + S.p;
    var meu = ++pedido;
    if (PRECOS.has(chave)) { atual = PRECOS.get(chave); renderTudo(); return; }
    renderTudo(); carregandoResultado();
    try {
      var d = await api('/precos?c=' + m[0] + '&l=' + m[1] + '&a=' + m[2] + '&p=' + S.p);
      PRECOS.set(chave, d);
      if (meu !== pedido) return;
      atual = d; renderTudo();
    } catch (e) {
      if (meu === pedido) erroResultado(e.message);
    }
  }

  async function buscarCep(ev) {
    ev.preventDefault();
    var cep = $('cep').value.replace(/\D/g, '');
    var msg = $('cepMsg');
    if (cep.length !== 8) { msg.className = 'sm-cep-msg erro'; msg.innerHTML = ic('alerta') + 'Digite os 8 números do CEP.'; msg.hidden = false; return; }
    $('cepBtn').disabled = true; $('cepBtn').textContent = 'Buscando';
    try {
      var r = await api('/cep?cep=' + cep);
      S.uf = r.uf; S.tipo = r.tipo; S.cidade = r.cidade;
      msg.className = 'sm-cep-msg ok'; msg.innerHTML = ic('ok') + esc(r.cidade + ' / ' + r.uf); msg.hidden = false;
      renderTudo();
    } catch (e) {
      msg.className = 'sm-cep-msg erro'; msg.innerHTML = ic('alerta') + esc(e.message); msg.hidden = false;
    } finally {
      $('cepBtn').disabled = false; $('cepBtn').textContent = 'Buscar';
    }
  }

  // ---------------------------------------------------------------- eventos
  function limparCep() { S.cidade = ''; $('cep').value = ''; $('cepMsg').hidden = true; }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'recarregar') { location.reload(); return; }
    if (!CFG) return;
    if (b.id === 'tentar') { atualizarPrecos(); return; }
    if (b.id === 'barra') { $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var grupo = b.parentNode;
    if (grupo.id === 'perfil') {
      var f = PERFIS.find(function (x) { return x.k === b.dataset.k; });
      S.cx = f.cx; S.p = f.p; S.serv = f.cx === 'MINI' ? 'MINI' : (S.serv === 'MINI' ? 'PAC' : S.serv);
      atualizarPrecos();
    } else if (grupo.id === 'caixas') {
      S.cx = b.dataset.cx;
      var cx = caixa(S.cx);
      if (cx.pesoMaxG && S.p > cx.pesoMaxG) S.p = CFG.pesos[0];
      if (S.cx === 'MINI') S.serv = 'MINI'; else if (S.serv === 'MINI') S.serv = 'PAC';
      atualizarPrecos();
    } else if (grupo.id === 'pesos') {
      S.p = Number(b.dataset.p); atualizarPrecos();
    } else if (grupo.id === 'mapa') {
      S.uf = b.dataset.uf; S.tipo = tipoPadrao(S.uf, S.modo); limparCep(); renderTudo();
    } else if (grupo.id === 'tipos') {
      S.tipo = b.dataset.t; S.cidade = ''; renderTudo();
    } else if (grupo.id === 'servico') {
      if (b.disabled) return;
      S.serv = b.dataset.v; renderTudo();
    } else if (grupo.id === 'regra') {
      S.regra = b.dataset.v; pressionar(grupo, b); renderTudo();
    } else if (grupo.id === 'mapModo') {
      S.modo = b.dataset.v; pressionar(grupo, b); S.tipo = tipoPadrao(S.uf, S.modo); limparCep(); renderTudo();
    }
  });
  $('cep').addEventListener('input', function (e) {
    var v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
  });
  $('cepForm').addEventListener('submit', buscarCep);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) {
      resultadoVisivel = ents[0].isIntersecting;
      if (resultadoVisivel) $('barra').hidden = true; else if (!$('economia').hidden) $('barra').hidden = false;
    }, { threshold: 0.15 }).observe($('resultado'));
  }

  // ---------------------------------------------------------------- início
  async function iniciar() {
    carregandoResultado();
    try {
      CFG = await api('/config');
      if (!CFG.ufs[S.uf]) S.uf = Object.keys(CFG.ufs)[0];
      S.tipo = tipoPadrao(S.uf, 'cap');
      await atualizarPrecos();
    } catch (e) {
      $('opcoes').innerHTML = '<div class="sm-aviso" role="alert">' + ic('alerta') + '<span>' + esc(e.message) + '</span><button type="button" id="recarregar">Tentar de novo</button></div>';
    }
  }
  iniciar();
})();
