/* =====================================================
   SIMULADOR DE REMUNERAÇÃO — AGF José Bonifácio
   Tabela R2 do Anexo 3 do contrato, vigência 17/11/2025.
   Vanilla JS, sem dependências.
   ===================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------
  // Faixas do contrato: [degrau, limInfPPCC, limSupPPCC, fator, ajustePPCC]
  // limSup null = sem teto
  // ---------------------------------------------------
  var FAIXAS = {
    G1: {
      nome: 'Mensageria',
      desc: 'R2 Grupo I · carta, impresso, telegrama',
      padrao: [419474.13, 440000],
      faixas: [
        [1, 0, 30000, 0.3700, 0],
        [2, 30001, 60000, 0.2400, 3900],
        [3, 60001, 72000, 0.2000, 6300],
        [4, 72001, 82000, 0.1724, 8287],
        [5, 82001, 96000, 0.1524, 9927],
        [6, 96001, 112000, 0.1356, 11540],
        [7, 112001, 126000, 0.1244, 12794],
        [8, 126001, 164000, 0.1040, 15364],
        [9, 164001, 216000, 0.0881, 17972],
        [10, 216001, 282000, 0.0769, 20391],
        [11, 282001, 374000, 0.0681, 22873],
        [12, 374001, null, 0.0602, 25828]
      ]
    }
  };

  var PPCC_PADRAO = 3.85;
  var DELTAS = [0, 1000, 5000, 10000, 15000, 25000, 50000, 100000, 200000];

  // ---------------------------------------------------
  // Formatação e parsing pt-BR
  // ---------------------------------------------------
  var fmtBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  function brl(v) { return 'R$ ' + fmtBRL.format(v || 0); }
  function num(v) { return fmtInt.format(Math.round(v || 0)); }
  function pct(v, casas) {
    var d = (casas === undefined) ? 2 : casas;
    return (v * 100).toFixed(d).replace('.', ',') + '%';
  }
  function parseNum(txt) {
    if (typeof txt === 'number') return txt;
    var s = String(txt || '').trim().replace(/[R$\s\u00A0]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // ---------------------------------------------------
  // Núcleo do cálculo — espelha a fórmula do contrato:
  //   remuneração = ROUND(faturamento x fator, 2) + ajuste em reais
  // ---------------------------------------------------
  function acharFaixa(grupo, fatMensal, ppcc) {
    var lista = FAIXAS[grupo].faixas;
    var emPpcc = ppcc > 0 ? fatMensal / ppcc : 0;
    var achada = lista[0];
    for (var i = 0; i < lista.length; i++) {
      if (emPpcc >= lista[i][1]) achada = lista[i];
    }
    return achada;
  }

  function calcular(grupo, fatMensal, ppcc) {
    var f = acharFaixa(grupo, fatMensal, ppcc);
    var ajusteReais = f[4] * ppcc;
    var variavel = Math.round(fatMensal * f[3] * 100) / 100;
    var rem = variavel + ajusteReais;
    return {
      faturamento: fatMensal,
      emPpcc: ppcc > 0 ? fatMensal / ppcc : 0,
      degrau: f[0],
      fator: f[3],
      ajustePpcc: f[4],
      ajuste: ajusteReais,
      variavel: variavel,
      remuneracao: rem,
      efetivo: fatMensal > 0 ? rem / fatMensal : 0,
      teto: f[2] === null ? null : f[2] * ppcc,
      piso: f[1] * ppcc
    };
  }

  // ---------------------------------------------------
  // Estado
  // ---------------------------------------------------
  var GRUPO = 'G1';
  var estado = {
    ppcc: PPCC_PADRAO,
    valores: FAIXAS.G1.padrao.slice()
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  // ---------------------------------------------------
  // Render dos grupos e cenários
  // ---------------------------------------------------
  function montarGrupos() {
    var wrap = $('#grupos');
    var cfg = FAIXAS[GRUPO];
    wrap.innerHTML =
      '<div class="dg-group">' +
        '<div class="dg-group-head">' +
          '<span class="dg-group-name">' + cfg.nome + '</span>' +
          '<span class="dg-group-tag">' + cfg.desc + '</span>' +
        '</div>' +
        '<div class="dg-cenarios">' +
          cenarioHTML(0, 'Cenário A') +
          cenarioHTML(1, 'Cenário B') +
        '</div>' +
        '<div class="dg-diff" id="diff"></div>' +
      '</div>';

    $$('.dg-cen-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        estado.valores[Number(inp.dataset.idx)] = parseNum(inp.value);
        recalcular();
      });
      inp.addEventListener('blur', function () {
        inp.value = fmtBRL.format(estado.valores[Number(inp.dataset.idx)]);
      });
      inp.addEventListener('focus', function () { inp.select(); });
    });
  }

  function cenarioHTML(idx, rotulo) {
    var id = 'in-' + idx;
    return '' +
      '<div class="dg-cen">' +
        '<div class="dg-cen-label">' + rotulo + '</div>' +
        '<label class="dg-field" for="' + id + '">' +
          '<span class="dg-field-label">Faturamento do mês</span>' +
          '<div class="dg-input-wrap">' +
            '<span class="dg-prefix">R$</span>' +
            '<input id="' + id + '" class="dg-input dg-cen-input" type="text" inputmode="decimal" ' +
              'data-idx="' + idx + '" ' +
              'value="' + fmtBRL.format(estado.valores[idx]) + '" />' +
          '</div>' +
        '</label>' +
        '<div class="dg-metrics" id="m-' + idx + '"></div>' +
        '<div class="dg-rem">' +
          '<div class="dg-rem-label">Remuneração</div>' +
          '<div class="dg-rem-value" id="r-' + idx + '">—</div>' +
        '</div>' +
      '</div>';
  }

  function pintarCenario(idx, c) {
    $('#m-' + idx).innerHTML =
      '<div class="dg-metric"><span>Em PPCC</span><span>' + num(c.emPpcc) + '</span></div>' +
      '<div class="dg-metric"><span>Degrau</span><span class="dg-badge">' + c.degrau + '</span></div>' +
      '<div class="dg-metric"><span>Fator</span><span>' + pct(c.fator) + '</span></div>' +
      '<div class="dg-metric"><span>Ajuste</span><span>' + brl(c.ajuste) + '</span></div>' +
      '<div class="dg-metric"><span>Teto do degrau</span><span>' + (c.teto === null ? 'sem teto' : brl(c.teto)) + '</span></div>' +
      '<div class="dg-metric"><span>% efetivo</span><span>' + pct(c.efetivo) + '</span></div>';
    $('#r-' + idx).textContent = brl(c.remuneracao);
  }

  function pintarDiferenca(a, b) {
    var dFat = b.faturamento - a.faturamento;
    var dRem = b.remuneracao - a.remuneracao;
    var dDeg = b.degrau - a.degrau;
    var retorno = dFat !== 0 ? dRem / dFat : 0;
    var cls = dRem > 0.005 ? 'pos' : (dRem < -0.005 ? 'neg' : '');
    var nota;
    if (Math.abs(dFat) < 0.01) {
      nota = 'Os dois cenários são iguais. Altere um dos valores para comparar.';
    } else if (dDeg !== 0) {
      nota = 'O cenário B muda de degrau (' + a.degrau + ' para ' + b.degrau + '). O fator ' +
             (b.fator < a.fator ? 'cai' : 'sobe') + ' ' + pct(Math.abs(b.fator - a.fator)) +
             ' e o ajuste ' + (b.ajuste > a.ajuste ? 'sobe' : 'cai') + ' ' + brl(Math.abs(b.ajuste - a.ajuste)) +
             '. O resultado ' + (dRem >= 0 ? 'ainda assim aumenta' : 'DIMINUI, o que indicaria erro na tabela') + '.';
    } else {
      nota = 'Os dois cenários ficam no mesmo degrau, então o retorno do valor adicional é igual ao fator da faixa.';
    }
    $('#diff').innerHTML =
      '<div class="dg-diff-item"><span class="dg-diff-k">Diferença de faturamento</span>' +
        '<span class="dg-diff-v">' + (dFat >= 0 ? '+ ' : '− ') + brl(Math.abs(dFat)) + '</span></div>' +
      '<div class="dg-diff-item"><span class="dg-diff-k">Diferença de remuneração</span>' +
        '<span class="dg-diff-v ' + cls + '">' + (dRem >= 0 ? '+ ' : '− ') + brl(Math.abs(dRem)) + '</span></div>' +
      '<div class="dg-diff-item"><span class="dg-diff-k">Rende por real adicional</span>' +
        '<span class="dg-diff-v ' + cls + '">' + (dFat !== 0 ? pct(retorno) : '—') + '</span></div>' +
      '<p class="dg-diff-note">' + nota + '</p>';
  }

  // ---------------------------------------------------
  // Seção 3 — e se faturar mais
  // ---------------------------------------------------
  function pintarMais() {
    var base = estado.valores[0];
    var ref = calcular(GRUPO, base, estado.ppcc);
    var tb = $('#tblMais tbody');
    tb.innerHTML = DELTAS.map(function (d) {
      var c = calcular(GRUPO, base + d, estado.ppcc);
      var ganho = c.remuneracao - ref.remuneracao;
      var classe = d === 0 ? ' class="is-ref"' : (c.degrau !== ref.degrau ? ' class="is-cross"' : '');
      var rotulo = d === 0 ? 'cenário A' : '+ ' + brl(d).replace('R$ ', 'R$ ');
      return '<tr' + classe + '>' +
        '<td>' + rotulo + '</td>' +
        '<td class="num">' + brl(c.faturamento) + '</td>' +
        '<td class="ctr">' + c.degrau + '</td>' +
        '<td class="num">' + pct(c.fator) + '</td>' +
        '<td class="num"><strong>' + brl(c.remuneracao) + '</strong></td>' +
        '<td class="num" style="color:' + (ganho < -0.01 ? '#B91C1C' : '#15803D') + ';font-weight:800">' +
          (d === 0 ? '—' : brl(ganho)) + '</td>' +
      '</tr>';
    }).join('');
  }

  // ---------------------------------------------------
  // Seção 4 — continuidade
  // ---------------------------------------------------
  function pintarContinuidade() {
    var lista = FAIXAS[GRUPO].faixas;
    var ppcc = estado.ppcc;
    var linhas = [];
    var maiorQueda = 0;
    for (var i = 0; i < lista.length - 1; i++) {
      var a = lista[i], b = lista[i + 1];
      var teto = a[2] * ppcc;
      var rA = teto * a[3] + a[4] * ppcc;
      var rB = teto * b[3] + b[4] * ppcc;
      var dif = rB - rA;
      if (dif < maiorQueda) maiorQueda = dif;
      var ok = Math.abs(dif) < 2;
      linhas.push('<tr>' +
        '<td>degrau ' + a[0] + ' para ' + b[0] + '</td>' +
        '<td class="num">' + brl(teto) + '</td>' +
        '<td class="num">' + brl(rA) + '</td>' +
        '<td class="num">' + brl(rB) + '</td>' +
        '<td class="num">' + brl(dif) + '</td>' +
        '<td class="ctr"><span class="dg-chip ' + (ok ? 'ok' : 'bad') + '">' +
          (ok ? 'sem degrau' : 'VERIFICAR') + '</span></td>' +
      '</tr>');
    }
    $('#tblCont tbody').innerHTML = linhas.join('');
    $('#contResumo').innerHTML =
      '<strong>' + (lista.length - 1) + ' viradas testadas.</strong> Maior variação encontrada: ' +
      brl(Math.abs(maiorQueda)) + '. Qualquer valor acima de R$ 2,00 seria degrau real e apareceria como VERIFICAR.';
  }

  // ---------------------------------------------------
  // Seção 5 — curva em SVG
  // ---------------------------------------------------
  function pintarCurva() {
    var ppcc = estado.ppcc;
    var lista = FAIXAS[GRUPO].faixas;
    var atual = estado.valores[0];
    var maxPpcc = lista[lista.length - 1][1] * 1.15;
    var maxFat = Math.max(maxPpcc * ppcc, atual * 1.3);
    var W = 900, H = 320, ML = 78, MR = 16, MT = 16, MB = 44;
    var iw = W - ML - MR, ih = H - MT - MB;

    var pts = [];
    var N = 120;
    for (var i = 0; i <= N; i++) {
      var f = maxFat * i / N;
      pts.push([f, calcular(GRUPO, f, ppcc).remuneracao]);
    }
    var maxRem = pts[pts.length - 1][1];
    var x = function (f) { return ML + (f / maxFat) * iw; };
    var y = function (r) { return MT + ih - (r / maxRem) * ih; };

    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); }).join(' ');

    // linhas verticais das viradas
    var viradas = '';
    lista.forEach(function (f) {
      if (f[2] === null) return;
      var fx = f[2] * ppcc;
      if (fx > maxFat) return;
      viradas += '<line x1="' + x(fx).toFixed(1) + '" y1="' + MT + '" x2="' + x(fx).toFixed(1) + '" y2="' + (MT + ih) +
                 '" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3"/>';
    });

    // grade horizontal
    var grade = '', rotulosY = '';
    for (var k = 0; k <= 4; k++) {
      var rv = maxRem * k / 4, yy = y(rv);
      grade += '<line x1="' + ML + '" y1="' + yy.toFixed(1) + '" x2="' + (ML + iw) + '" y2="' + yy.toFixed(1) +
               '" stroke="#EDF1F5" stroke-width="1"/>';
      rotulosY += '<text x="' + (ML - 8) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#60788d">' +
                  num(rv / 1000) + 'k</text>';
    }
    var rotulosX = '';
    for (var j = 0; j <= 4; j++) {
      var fv = maxFat * j / 4;
      rotulosX += '<text x="' + x(fv).toFixed(1) + '" y="' + (MT + ih + 20) + '" text-anchor="middle" font-size="11" fill="#60788d">' +
                  num(fv / 1000) + 'k</text>';
    }

    var cAtual = calcular(GRUPO, atual, ppcc);
    var marcador = (atual > 0 && atual <= maxFat)
      ? '<circle cx="' + x(atual).toFixed(1) + '" cy="' + y(cAtual.remuneracao).toFixed(1) + '" r="6" fill="#0077b6" stroke="#fff" stroke-width="2.5"/>' +
        '<text x="' + Math.min(x(atual) + 12, W - MR - 120).toFixed(1) + '" y="' + Math.max(y(cAtual.remuneracao) - 10, MT + 12).toFixed(1) +
        '" font-size="12" font-weight="700" fill="#00416b">' + brl(cAtual.remuneracao) + '</text>'
      : '';

    $('#chart').innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
        grade + viradas +
        '<path d="' + d + '" fill="none" stroke="#00416b" stroke-width="2.5" stroke-linejoin="round"/>' +
        marcador + rotulosY + rotulosX +
        '<text x="' + (ML + iw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#60788d">' +
          'Faturamento do mês (R$)</text>' +
      '</svg>';
  }

  // ---------------------------------------------------
  // Lembrete das faixas, ao lado do simulador
  // ---------------------------------------------------
  function pintarFaixas(degA, degB) {
    var ppcc = estado.ppcc;
    var lista = FAIXAS[GRUPO].faixas;
    var fmax = 0;
    lista.forEach(function (f) { if (f[3] > fmax) fmax = f[3]; });
    $('#faixasLista').innerHTML = lista.map(function (f) {
      var marcas = '';
      if (f[0] === degA) marcas += '<i class="dg-dot dg-dot-a" title="cenário A"></i>';
      if (f[0] === degB) marcas += '<i class="dg-dot dg-dot-b" title="cenário B"></i>';
      var ativo = (f[0] === degA || f[0] === degB) ? ' is-on' : '';
      var faixa = f[2] === null
        ? 'acima de ' + num(f[1] * ppcc)
        : num(f[1] * ppcc) + ' a ' + num(f[2] * ppcc);
      return '<div class="dg-faixa' + ativo + '">' +
        '<span class="dg-faixa-n">' + f[0] + '</span>' +
        '<span class="dg-faixa-r">' + faixa + '</span>' +
        '<span class="dg-faixa-p">' + pct(f[3]) + '</span>' +
        '<span class="dg-faixa-bar"><i style="width:' + (f[3] / fmax * 100).toFixed(0) + '%"></i></span>' +
        '<span class="dg-faixa-m">' + marcas + '</span>' +
      '</div>';
    }).join('');
  }

  // ---------------------------------------------------
  // Recalcular tudo
  // ---------------------------------------------------
  function recalcular() {
    var a = calcular(GRUPO, estado.valores[0], estado.ppcc);
    var b = calcular(GRUPO, estado.valores[1], estado.ppcc);
    pintarCenario(0, a);
    pintarCenario(1, b);
    pintarDiferenca(a, b);
    pintarFaixas(a.degrau, b.degrau);
    pintarMais();
    pintarContinuidade();
    pintarCurva();
  }

  // ---------------------------------------------------
  // Eventos
  // ---------------------------------------------------
  function ligar() {
    var ppccEl = $('#ppcc');
    ppccEl.addEventListener('input', function () {
      var v = parseNum(ppccEl.value);
      if (v > 0) { estado.ppcc = v; recalcular(); }
    });
    ppccEl.addEventListener('blur', function () {
      ppccEl.value = fmtBRL.format(estado.ppcc);
    });

    $('#btnReset').addEventListener('click', function () {
      estado.ppcc = PPCC_PADRAO;
      estado.valores = FAIXAS.G1.padrao.slice();
      $('#ppcc').value = fmtBRL.format(PPCC_PADRAO);
      montarGrupos();
      recalcular();
    });

    window.addEventListener('resize', function () {
      clearTimeout(window.__dgRz);
      window.__dgRz = setTimeout(pintarCurva, 180);
    });
  }

  function iniciar() {
    montarGrupos();
    ligar();
    recalcular();
  }

  // Ponto de verificação: permite conferir o cálculo contra a planilha
  // sem depender da interface. Uso: __REMUNERACAO__.calcular('G1', 419474.13, 3.85)
  window.__REMUNERACAO__ = { calcular: calcular, faixas: FAIXAS, versao: '1.0.0' };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
