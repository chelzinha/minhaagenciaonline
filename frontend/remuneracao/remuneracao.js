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
    },
    G2: {
      nome: 'Encomenda',
      desc: 'R2 Grupo II · PAC e SEDEX',
      padrao: [651041.84, 700000],
      faixas: [
        [1, 0, 247000, 0.2900, 0],
        [2, 247001, 319000, 0.2236, 16401],
        [3, 319001, 376000, 0.1995, 24089],
        [4, 376001, 437000, 0.1809, 31083],
        [5, 437001, 493000, 0.1698, 35934],
        [6, 493001, 558000, 0.1554, 43033],
        [7, 558001, 680000, 0.1355, 54137],
        [8, 680001, 828000, 0.1239, 62025],
        [9, 828001, null, 0.0881, 91667]
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
  var estado = {
    ppcc: PPCC_PADRAO,
    valores: { G1: FAIXAS.G1.padrao.slice(), G2: FAIXAS.G2.padrao.slice() },
    grupoTabela: 'G1'
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  // ---------------------------------------------------
  // Render dos grupos e cenários
  // ---------------------------------------------------
  function montarGrupos() {
    var wrap = $('#grupos');
    wrap.innerHTML = '';
    ['G1', 'G2'].forEach(function (g) {
      var cfg = FAIXAS[g];
      var el = document.createElement('div');
      el.className = 'dg-group';
      el.innerHTML =
        '<div class="dg-group-head">' +
          '<span class="dg-group-name">' + cfg.nome + '</span>' +
          '<span class="dg-group-tag">' + cfg.desc + '</span>' +
        '</div>' +
        '<div class="dg-cenarios">' +
          cenarioHTML(g, 0, 'Cenário A') +
          cenarioHTML(g, 1, 'Cenário B') +
        '</div>' +
        '<div class="dg-diff" id="diff-' + g + '"></div>';
      wrap.appendChild(el);
    });

    $$('.dg-cen-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var g = inp.dataset.grupo, i = Number(inp.dataset.idx);
        estado.valores[g][i] = parseNum(inp.value);
        recalcular();
      });
      inp.addEventListener('blur', function () {
        var g = inp.dataset.grupo, i = Number(inp.dataset.idx);
        inp.value = fmtBRL.format(estado.valores[g][i]);
      });
      inp.addEventListener('focus', function () { inp.select(); });
    });
  }

  function cenarioHTML(g, idx, rotulo) {
    var id = 'in-' + g + '-' + idx;
    return '' +
      '<div class="dg-cen">' +
        '<div class="dg-cen-label">' + rotulo + '</div>' +
        '<label class="dg-field" for="' + id + '">' +
          '<span class="dg-field-label">Faturamento do mês</span>' +
          '<div class="dg-input-wrap">' +
            '<span class="dg-prefix">R$</span>' +
            '<input id="' + id + '" class="dg-input dg-cen-input" type="text" inputmode="decimal" ' +
              'data-grupo="' + g + '" data-idx="' + idx + '" ' +
              'value="' + fmtBRL.format(estado.valores[g][idx]) + '" />' +
          '</div>' +
        '</label>' +
        '<div class="dg-metrics" id="m-' + g + '-' + idx + '"></div>' +
        '<div class="dg-rem">' +
          '<div class="dg-rem-label">Remuneração</div>' +
          '<div class="dg-rem-value" id="r-' + g + '-' + idx + '">—</div>' +
        '</div>' +
      '</div>';
  }

  function pintarCenario(g, idx, c) {
    $('#m-' + g + '-' + idx).innerHTML =
      '<div class="dg-metric"><span>Em PPCC</span><span>' + num(c.emPpcc) + '</span></div>' +
      '<div class="dg-metric"><span>Degrau</span><span class="dg-badge">' + c.degrau + '</span></div>' +
      '<div class="dg-metric"><span>Fator</span><span>' + pct(c.fator) + '</span></div>' +
      '<div class="dg-metric"><span>Ajuste</span><span>' + brl(c.ajuste) + '</span></div>' +
      '<div class="dg-metric"><span>Teto do degrau</span><span>' + (c.teto === null ? 'sem teto' : brl(c.teto)) + '</span></div>' +
      '<div class="dg-metric"><span>% efetivo</span><span>' + pct(c.efetivo) + '</span></div>';
    $('#r-' + g + '-' + idx).textContent = brl(c.remuneracao);
  }

  function pintarDiferenca(g, a, b) {
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
    $('#diff-' + g).innerHTML =
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
    var base = estado.valores.G1[0];
    var ref = calcular('G1', base, estado.ppcc);
    var tb = $('#tblMais tbody');
    tb.innerHTML = DELTAS.map(function (d) {
      var c = calcular('G1', base + d, estado.ppcc);
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
    var g = estado.grupoTabela;
    var lista = FAIXAS[g].faixas;
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
    var g = estado.grupoTabela;
    var ppcc = estado.ppcc;
    var lista = FAIXAS[g].faixas;
    var atual = estado.valores[g][0];
    var maxPpcc = lista[lista.length - 1][1] * 1.15;
    var maxFat = Math.max(maxPpcc * ppcc, atual * 1.3);
    var W = 900, H = 320, ML = 78, MR = 16, MT = 16, MB = 44;
    var iw = W - ML - MR, ih = H - MT - MB;

    var pts = [];
    var N = 120;
    for (var i = 0; i <= N; i++) {
      var f = maxFat * i / N;
      pts.push([f, calcular(g, f, ppcc).remuneracao]);
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

    var cAtual = calcular(g, atual, ppcc);
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
  // Tabela de faixas
  // ---------------------------------------------------
  function pintarFaixas() {
    var g = estado.grupoTabela, ppcc = estado.ppcc;
    var atual = calcular(g, estado.valores[g][0], ppcc);
    $('#tblFaixas tbody').innerHTML = FAIXAS[g].faixas.map(function (f) {
      var marca = f[0] === atual.degrau ? ' class="is-ref"' : '';
      return '<tr' + marca + '>' +
        '<td class="ctr"><strong>' + f[0] + '</strong></td>' +
        '<td class="num">' + brl(f[1] * ppcc) + '</td>' +
        '<td class="num">' + (f[2] === null ? 'sem teto' : brl(f[2] * ppcc)) + '</td>' +
        '<td class="num"><strong>' + pct(f[3]) + '</strong></td>' +
        '<td class="num">' + brl(f[4] * ppcc) + '</td>' +
      '</tr>';
    }).join('');
  }

  // ---------------------------------------------------
  // Recalcular tudo
  // ---------------------------------------------------
  function recalcular() {
    ['G1', 'G2'].forEach(function (g) {
      var a = calcular(g, estado.valores[g][0], estado.ppcc);
      var b = calcular(g, estado.valores[g][1], estado.ppcc);
      pintarCenario(g, 0, a);
      pintarCenario(g, 1, b);
      pintarDiferenca(g, a, b);
    });
    pintarMais();
    pintarContinuidade();
    pintarCurva();
    pintarFaixas();
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

    $$('.dg-seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.dg-seg-btn').forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        estado.grupoTabela = btn.dataset.grupo;
        pintarContinuidade();
        pintarCurva();
        pintarFaixas();
      });
    });

    $('#btnReset').addEventListener('click', function () {
      estado.ppcc = PPCC_PADRAO;
      estado.valores.G1 = FAIXAS.G1.padrao.slice();
      estado.valores.G2 = FAIXAS.G2.padrao.slice();
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
