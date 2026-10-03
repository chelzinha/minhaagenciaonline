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
  var ORDEM_TIPOS = ['RMF', 'CAPITAL', 'POLO', 'MEDIA', 'CE_POLO', 'DIVISA', 'INTERIOR', 'CE_INT'];
  var ROTULO_CURTO = { RMF: 'Região metropolitana', CAPITAL: 'Capital', POLO: 'Cidade polo', MEDIA: 'Cidade média', CE_POLO: 'Cidade polo', DIVISA: 'Mossoró', INTERIOR: 'Interior', CE_INT: 'Interior' };
  var NOMES_UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
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
    lapis: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    grade: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    alerta: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };
  // Limites dos Correios para SEDEX e PAC (contrato, Clube, balcão e App) e para o Mini Envios
  var LIM = {
    ladoMax: 100, somaMax: 200, pesoMax: 30000, minimo: [11, 6, 0.4],
    mini: [24, 16, 4], miniPesoTabela: 300, miniPesoMax: 1000,
    manuseio: 70
  };
  var PERFIS = [
    { k: 'env', nome: 'Envelope', ic: 'envelope', cx: 'MINI', p: 300 },
    { k: 'leve', nome: 'Caixa leve', ic: 'roupa', cx: 'T2', p: 1000 },
    { k: 'media', nome: 'Caixa média', ic: 'pacote', cx: 'T4', p: 5000 },
    { k: 'grande', nome: 'Caixa grande', ic: 'caminhao', cx: 'T5', p: 15000 }
  ];

  // ---------------------------------------------------------------- estado
  var S = { cx: 'T2', p: 1000, uf: 'SP', tipo: 'CAPITAL', serv: 'SEDEX', regra: 'PESO', modo: 'cap', cidade: '',
    medLivre: false, med: [27, 18, 9], pesoLivre: false, unidade: 'kg' };
  var CHAVE_SESSAO = 'agf_simulador_v1';
  try { var salvo = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null'); if (salvo && salvo.cx) Object.assign(S, salvo); } catch (e) { /* sem sessão */ }
  function guardar() { try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(S)); } catch (e) { /* sem sessão */ } }
  var CFG = null;           // { ufs, caixas, pesos, vigencia }
  var PRECOS = new Map();   // c|l|a|p -> dados
  var atual = null;         // preços da embalagem atual
  var pedido = 0;
  var resultadoVisivel = false; // a barra do celular some quando o resultado já está na tela

  // ---------------------------------------------------------------- helpers
  var $ = function (id) { return document.getElementById(id); };
  function ic(nome, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[nome] + '</svg>'; }
  function brl(v) { return v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function kg(g) { return g < 1000 ? Math.round(g) + ' g' : (g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + ' kg'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function caixa(cod) { return CFG.caixas.find(function (c) { return c.codigo === cod; }); }
  /** Embalagem em uso: uma das caixas padrão ou as medidas digitadas. */
  function caixaAtual() {
    if (S.medLivre) return { codigo: 'LIVRE', nome: 'Sua caixa', medidas: S.med };
    return caixa(S.cx) || caixa('T2');
  }
  function numBR(v) { var n = Number(String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : NaN; }
  function numTxt(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
  function ordenadas(m) { return m.slice().sort(function (a, b) { return b - a; }); }
  function cabeMini(m) { var o = ordenadas(m); return o[0] <= LIM.mini[0] && o[1] <= LIM.mini[1] && o[2] <= LIM.mini[2]; }
  function miniPossivel() { return cabeMini(caixaAtual().medidas) && S.p <= LIM.miniPesoMax; }

  /** Confere medidas e peso contra os limites de cada tipo de envio. erros bloqueiam a simulação; avisos não. */
  function conferirLimites() {
    var m = caixaAtual().medidas, o = ordenadas(m), soma = m[0] + m[1] + m[2];
    var med = { erros: [], avisos: [] }, peso = { erros: [], avisos: [] };
    if (m.some(function (v) { return !(v > 0); })) med.erros.push('Informe comprimento, largura e altura em centímetros.');
    else {
      if (o[0] > LIM.ladoMax) med.erros.push('Lado de ' + numTxt(o[0]) + ' cm: SEDEX e PAC aceitam até ' + LIM.ladoMax + ' cm em cada lado.');
      if (soma > LIM.somaMax) med.erros.push('Soma das medidas de ' + numTxt(soma) + ' cm: SEDEX e PAC aceitam até ' + LIM.somaMax + ' cm (C + L + A).');
      if (o[0] < LIM.minimo[0] || o[1] < LIM.minimo[1] || o[2] < LIM.minimo[2]) med.erros.push('Menor que o mínimo aceito para caixa: 11 x 6 x 0,4 cm.');
      if (!med.erros.length) {
        // Peso cúbico acima de 30 kg é aceito: os Correios cobram o kg adicional (conferido em postagens reais).
        if (o[0] > LIM.manuseio) med.avisos.push('Lado acima de ' + LIM.manuseio + ' cm: soma a taxa de manuseio especial.');
        if (S.medLivre && !cabeMini(m) && o[0] <= 30 && o[2] <= 8) med.avisos.push('Não cabe no Mini Envios: máximo de 24 x 16 x 4 cm.');
      }
    }
    if (!(S.p > 0)) peso.erros.push('Informe o peso.');
    else if (S.p > LIM.pesoMax) peso.erros.push('Peso de ' + kg(S.p) + ': SEDEX e PAC aceitam até 30 kg.');
    else if (caixaAtual().codigo === 'MINI' && S.p > LIM.miniPesoMax) peso.erros.push('A caixa Mini Envios aceita até 1 kg. Escolha outra embalagem.');
    return { med: med, peso: peso, ok: !med.erros.length && !peso.erros.length };
  }
  function vol(c) { return c.medidas[0] * c.medidas[1] * c.medidas[2]; }
  function nomeCaixa(c) { return c.destaque ? 'Caixa' : c.nome; }
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
      APP: S.serv === 'MINI' ? null : app[base] // Mini Envios: só contrato (Platinum e Clube)
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
      var on = !S.medLivre && S.cx === f.cx && S.p === f.p;
      return '<button type="button" class="sm-op" data-k="' + f.k + '" aria-pressed="' + on + '">' + ic(f.ic) + '<b>' + f.nome + '</b></button>';
    }).join('');
  }
  function renderCaixas() {
    var porTamanho = CFG.caixas.slice().sort(function (x, y) { return vol(x) - vol(y); });
    $('caixas').innerHTML = porTamanho.map(function (c) {
      return '<button type="button" class="sm-op' + (c.destaque ? ' sm-mini' : '') + '" data-cx="' + c.codigo + '" aria-pressed="' + (S.cx === c.codigo) + '" aria-label="' + esc(c.nome) + ', ' + medidasTxt(c.medidas) + ' cm">' +
        (c.destaque ? '<span class="sm-selo">Mini Envios</span>' : '') + caixaSvg(c.medidas) +
        '<b>' + esc(nomeCaixa(c)) + '</b><small>' + medidasTxt(c.medidas) + '</small></button>';
    }).join('');
  }
  function renderPesos() {
    var cx = caixaAtual();
    $('pesos').innerHTML = CFG.pesos.map(function (p) {
      var bloqueado = cx.pesoMaxG && p > cx.pesoMaxG;
      return '<button type="button" class="sm-op num" data-p="' + p + '" aria-pressed="' + (!S.pesoLivre && S.p === p) + '"' + (bloqueado ? ' disabled' : '') + '>' + kg(p) + '</button>';
    }).join('');
  }
  /** Mostra caixas ou campos de medida, pesos ou campo de peso, e os alertas de limite. */
  function renderLivres(lim) {
    $('caixas').hidden = S.medLivre; $('medidas').hidden = !S.medLivre;
    $('pesos').hidden = S.pesoLivre; $('pesoLivre').hidden = !S.pesoLivre;
    var bm = $('digitarMed'), bp = $('digitarPeso');
    bm.setAttribute('aria-pressed', String(S.medLivre));
    bm.innerHTML = S.medLivre ? ic('grade') + 'Caixas padrão' : ic('lapis') + 'Digitar medidas';
    bp.setAttribute('aria-pressed', String(S.pesoLivre));
    bp.innerHTML = S.pesoLivre ? ic('grade') + 'Pesos padrão' : ic('lapis') + 'Digitar peso';
    if (S.medLivre) {
      var o = S.med;
      $('medPrevia').innerHTML = o.every(function (v) { return v > 0; }) ? caixaSvg(escalaPrevia(o)) : '';
    }
    $('pesoUnTxt').textContent = S.unidade === 'g' ? 'g' : 'kg';
    $('pesoUn').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === S.unidade)); });
    mostrarAlertas($('medMsg'), lim.med);
    mostrarAlertas($('pesoMsg'), lim.peso);
    ['medC', 'medL', 'medA'].forEach(function (id, i) {
      $(id).parentNode.classList.toggle('erro', S.medLivre && lim.med.erros.length > 0 && (!(S.med[i] > 0) || S.med[i] > LIM.ladoMax || lim.med.erros.some(function (t) { return /Soma|mínimo/.test(t); })));
    });
    $('pesoV').parentNode.classList.toggle('erro', S.pesoLivre && lim.peso.erros.length > 0);
  }
  function mostrarAlertas(el, a) {
    var linhas = a.erros.map(function (t) { return '<span class="erro">' + ic('alerta') + esc(t) + '</span>'; })
      .concat(a.avisos.map(function (t) { return '<span class="aviso">' + ic('alerta') + esc(t) + '</span>'; }));
    el.innerHTML = linhas.join('');
    el.hidden = !linhas.length;
  }
  /** Reduz a caixa digitada para caber no desenho (até 100 cm de lado). */
  function escalaPrevia(m) {
    var f = Math.min(1, 50 / (m[0] + m[1] * 0.5), 34 / (m[2] + m[1] * 0.3));
    return m.map(function (v) { return v * f; });
  }
  function preencherCampos() {
    $('medC').value = numTxt(S.med[0]); $('medL').value = numTxt(S.med[1]); $('medA').value = numTxt(S.med[2]);
    $('pesoV').value = S.unidade === 'g' ? String(Math.round(S.p)) : numTxt3(S.p / 1000);
  }
  function numTxt3(n) { return String(Math.round(n * 1000) / 1000).replace('.', ','); }
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
    $('tipos').innerHTML = '<p class="sm-tipos-uf">Destino em ' + esc(NOMES_UF[S.uf] || S.uf) + '</p>' + ORDEM_TIPOS.filter(function (k) { return t[k]; }).map(function (k) {
      var g = t[k];
      var ex = g.ex.length ? g.ex.join(', ') + (g.n > g.ex.length ? ' e mais ' + (g.n - g.ex.length) : '') : 'Demais cidades do estado';
      return '<button type="button" class="sm-op" data-t="' + k + '" aria-pressed="' + (S.tipo === k) + '"><b>' + esc(g.nome) + '</b><small>' + esc(ex) + '</small></button>';
    }).join('');
  }
  function renderServico() {
    var mini = miniPossivel();
    $('servico').querySelectorAll('button').forEach(function (b) {
      if (b.dataset.v === 'MINI') b.disabled = !mini;
      b.setAttribute('aria-pressed', String(b.dataset.v === S.serv));
    });
  }

  // ---------------------------------------------------------------- render: resultado
  function renderResultado() {
    var g = (CFG.ufs[S.uf] || {})[S.tipo];
    var cx = caixaAtual();
    $('destNome').textContent = S.cidade || (g ? ROTULO_CURTO[S.tipo] : '-');
    var rotulo = ROTULO_CURTO[S.tipo];
    if (S.tipo === 'CAPITAL' && S.cidade && g && g.ex[0] && g.ex[0].toLowerCase() !== S.cidade.toLowerCase()) rotulo = 'Região metropolitana';
    $('destUf').textContent = S.cidade ? S.uf + ' · ' + rotulo : S.uf;
    $('meta').textContent = (S.serv === 'MINI' ? 'Mini Envios' : S.serv) + ' · ' + (cx.destaque ? 'Caixa Mini Envios' : cx.nome) + ' (' + medidasTxt(cx.medidas.map(function (v) { return Math.round(v * 10) / 10; })) + ' cm) · ' + kg(S.p);
    if (!atual || !g) return;
    var v = valores(g.zona);
    var m = menor(v);
    var ops = [
      { k: 'AVISTA', nome: 'Balcão à vista', ic: 'loja', ref: true },
      { k: 'PLATINUM', nome: 'Platinum', ic: 'contrato', pessoa: 'PJ' },
      { k: 'CLUBE', nome: 'Clube Correios', ic: 'clube', pessoa: 'PJ' },
      { k: 'APP', nome: 'Correios App', ic: 'app', pessoa: 'PF' }
    ];
    var soContrato = S.serv === 'MINI';
    $('opcoes').innerHTML = ops.map(function (o) {
      var bloqueado = soContrato && (o.k === 'AVISTA' || o.k === 'APP');
      var val = bloqueado ? null : v[o.k];
      var melhor = !o.ref && val != null && val === m;
      var pct = !o.ref && val != null && v.AVISTA ? Math.round((1 - val / v.AVISTA) * 100) : null;
      var chips = (o.pessoa ? '<span class="sm-chip pessoa ' + o.pessoa.toLowerCase() + '" title="' + (o.pessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física') + '">' + o.pessoa + '</span>' : '') +
        (o.ref && !bloqueado ? '<span class="sm-chip ref">Referência</span>' : '') + (melhor ? '<span class="sm-chip melhor">Mais barato</span>' : '');
      var preco = bloqueado
        ? '<em class="sm-bloq">Opção disponível somente para clientes com contrato</em>'
        : val == null
        ? '<b>Indisponível</b>'
        : '<b class="num">' + brl(val) + '</b>' + (pct == null ? '' : '<span class="num' + (pct < 0 ? ' mais' : '') + '">' + (pct >= 0 ? '-' + pct : '+' + Math.abs(pct)) + '%</span>');

      return '<div class="sm-card' + (o.ref ? ' ref' : '') + (melhor ? ' melhor' : '') + (bloqueado ? ' bloq' : (val == null ? ' indisp' : '')) + '" data-k="' + o.k + '">' +
        '<span class="sm-card-ic">' + ic(o.ic) + '</span><span class="sm-card-nome">' + o.nome + '</span>' +
        '<div class="sm-card-val">' + preco + '</div>' + (chips ? '<div class="sm-chips">' + chips + '</div>' : '') + '</div>';
    }).join('');

    var box = $('economia');
    if (m != null && v.AVISTA) {
      var nomes = [];
      if (v.PLATINUM === m) nomes.push('Platinum');
      if (v.CLUBE === m) nomes.push('Clube Correios');
      if (v.APP === m) nomes.push('Correios App');
      var eco = v.AVISTA - m;
      box.innerHTML = '<span class="pct num">' + Math.round((1 - m / v.AVISTA) * 100) + '%</span><p><b class="num">' + brl(eco) + '</b> ' + (soContrato ? 'a menos que o PAC no balcão' : 'a menos por envio') + '<small class="num">' + brl(eco * 100) + ' em 100 envios</small></p>';
      box.hidden = false;
      $('barra').innerHTML = '<span>' + esc(nomes[0]) + '<br><b class="num">' + brl(m) + '</b></span><em class="num">-' + Math.round((1 - m / v.AVISTA) * 100) + '%</em>';
      $('barra').hidden = resultadoVisivel;
      var melhorK = v.PLATINUM === m ? 'platinum' : (v.CLUBE === m ? 'clube' : 'app');
      $('cta').href = '/simulador/opcoes/#' + melhorK;
    } else {
      box.hidden = true;
      $('barra').hidden = true;
    }
  }

  function foraDoLimite() {
    $('economia').hidden = true; $('barra').hidden = true;
    $('opcoes').innerHTML = '<div class="sm-aviso" role="alert">' + ic('alerta') + '<span>Ajuste as medidas ou o peso para simular. Veja o alerta acima.</span></div>';
  }
  function carregandoResultado() {
    $('opcoes').innerHTML = '<div class="sm-carregando" aria-label="Calculando"><i></i><i></i><i></i><i></i></div>';
  }
  function erroResultado(msg) {
    $('economia').hidden = true; $('barra').hidden = true;
    $('opcoes').innerHTML = '<div class="sm-aviso" role="alert">' + ic('alerta') + '<span>' + esc(msg) + '</span><button type="button" id="tentar">Tentar de novo</button></div>';
  }

  function renderTudo() {
    if (S.serv === 'MINI' && !miniPossivel()) S.serv = 'PAC';
    guardar();
    var lim = conferirLimites();
    renderPerfis(); renderCaixas(); renderPesos(); renderLivres(lim); renderServico(); renderTipos();
    if (atual) renderMapa();
    renderResultado();
    return lim;
  }

  // ---------------------------------------------------------------- dados
  async function atualizarPrecos() {
    var m = caixaAtual().medidas;
    var chave = m.join('|') + '|' + S.p;
    var meu = ++pedido;
    if (!conferirLimites().ok) { atual = null; renderTudo(); foraDoLimite(); return; }
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
      S.cx = f.cx; S.p = f.p; S.medLivre = false; S.pesoLivre = false; S.serv = f.cx === 'MINI' ? 'MINI' : (S.serv === 'MINI' ? 'PAC' : S.serv);
      atualizarPrecos();
    } else if (grupo.id === 'caixas') {
      S.cx = b.dataset.cx;
      var cx = caixa(S.cx);
      if (cx.pesoMaxG && S.p > cx.pesoMaxG) S.p = CFG.pesos[0];
      if (S.cx === 'MINI') S.serv = 'MINI'; else if (S.serv === 'MINI') S.serv = 'PAC';
      atualizarPrecos();
    } else if (grupo.id === 'pesos') {
      S.p = Number(b.dataset.p); atualizarPrecos();
    } else if (b.id === 'digitarMed') {
      if (S.medLivre) { S.medLivre = false; if (!caixa(S.cx)) S.cx = 'T2'; }
      else { S.med = caixaAtual().medidas.slice(); S.medLivre = true; preencherCampos(); setTimeout(function () { $('medC').focus(); $('medC').select(); }, 0); }
      atualizarPrecos();
    } else if (b.id === 'digitarPeso') {
      if (S.pesoLivre) { S.pesoLivre = false; if (CFG.pesos.indexOf(S.p) < 0) S.p = CFG.pesos.reduce(function (a, x) { return Math.abs(x - S.p) < Math.abs(a - S.p) ? x : a; }, CFG.pesos[0]); }
      else { S.pesoLivre = true; preencherCampos(); setTimeout(function () { $('pesoV').focus(); $('pesoV').select(); }, 0); }
      atualizarPrecos();
    } else if (grupo.id === 'pesoUn') {
      S.unidade = b.dataset.v; preencherCampos(); renderTudo();
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

  // medidas e peso digitados: recalcula 450 ms depois da última tecla
  var espera = null;
  function aoDigitar() { clearTimeout(espera); espera = setTimeout(atualizarPrecos, 450); }
  ['medC', 'medL', 'medA'].forEach(function (id, i) {
    $(id).addEventListener('input', function (e) {
      e.target.value = e.target.value.replace(/[^0-9,\.]/g, '');
      S.med[i] = numBR(e.target.value); if (!isFinite(S.med[i])) S.med[i] = 0;
      renderTudo(); aoDigitar();
    });
  });
  $('pesoV').addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/[^0-9,\.]/g, '');
    var n = numBR(e.target.value);
    S.p = isFinite(n) && n > 0 ? Math.ceil(S.unidade === 'g' ? n : n * 1000) : 0;
    renderTudo(); aoDigitar();
  });

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
      if (!CFG.ufs[S.uf]) { S.uf = Object.keys(CFG.ufs)[0]; S.tipo = ''; }
      if (!CFG.ufs[S.uf][S.tipo]) { S.tipo = tipoPadrao(S.uf, 'cap'); S.cidade = ''; }
      if (!caixa(S.cx)) S.cx = 'T2';
      if (!Array.isArray(S.med) || S.med.length !== 3) { S.med = [27, 18, 9]; S.medLivre = false; }
      if (!S.pesoLivre && CFG.pesos.indexOf(S.p) < 0) S.p = 1000;
      if (S.unidade !== 'g') S.unidade = 'kg';
      preencherCampos();
      pressionar($('regra'), $('regra').querySelector('[data-v="' + S.regra + '"]') || $('regra').querySelector('button'));
      pressionar($('mapModo'), $('mapModo').querySelector('[data-v="' + S.modo + '"]') || $('mapModo').querySelector('button'));
      if (S.cidade) { $('cepMsg').className = 'sm-cep-msg ok'; $('cepMsg').innerHTML = ic('ok') + esc(S.cidade + ' / ' + S.uf); $('cepMsg').hidden = false; }
      await atualizarPrecos();
    } catch (e) {
      $('opcoes').innerHTML = '<div class="sm-aviso" role="alert">' + ic('alerta') + '<span>' + esc(e.message) + '</span><button type="button" id="recarregar">Tentar de novo</button></div>';
    }
  }
  iniciar();
})();
