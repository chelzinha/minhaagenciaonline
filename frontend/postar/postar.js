/* =====================================================
   /postar - cliente gera a própria etiqueta no balcão (QR Code)
   Fluxo: local -> cotação -> remetente -> destinatário -> conferir -> código
   Visual: componentes do app Minhas Postagens (card, field-input, seg, opcao-card).
   O servidor revalida e recalcula tudo; aqui a validação é para ajudar na hora.
   ===================================================== */
(function () {
  'use strict';
  var V = window.AgfValidacao;
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787/api/balcao/publico'
    : 'https://agf-balcao-api.chelzinha.workers.dev/api/balcao/publico';
  var LOCAIS = { AGF: 'AGF José Bonifácio', METRO: 'Shopping Metrô' };
  var RASCUNHO = 'agf_postar_rascunho_v1';
  var ICONE_SERVICO = { '04014': 'bolt', '04510': 'inventory_2' };

  var $ = function (id) { return document.getElementById(id); };
  var estado = { local: '', cotacao: null, opcoes: [], servico: null, remetente: {}, destinatario: {} };

  // ---------------------------------------------------------------- utilidades
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(n) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','); }
  function prazoTexto(d) { return d ? d + (Number(d) === 1 ? ' dia útil' : ' dias úteis') : 'Prazo confirmado no guichê'; }
  var toastT = null;
  function toast(msg, tipo) {
    var t = $('toast'); t.textContent = msg;
    t.className = 'toast show' + (tipo === 'erro' ? ' toast-error' : tipo === 'ok' ? ' toast-success' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'toast'; }, 4200);
  }
  function carregando(on, texto) { $('loadingText').textContent = texto || 'Carregando...'; $('loading').classList.toggle('show', !!on); }
  function salvarRascunho() {
    try { sessionStorage.setItem(RASCUNHO, JSON.stringify({ local: estado.local, remetente: estado.remetente })); } catch (e) { /* sem armazenamento */ }
  }
  function lerRascunho() { try { return JSON.parse(sessionStorage.getItem(RASCUNHO) || 'null'); } catch (e) { return null; } }
  function limparRascunho() { try { sessionStorage.removeItem(RASCUNHO); } catch (e) { /* ok */ } }

  async function api(caminho, corpo) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 30000);
    var resp, json = null;
    try {
      resp = await fetch(API + caminho, {
        method: corpo ? 'POST' : 'GET', signal: ctrl.signal,
        headers: corpo ? { 'Content-Type': 'application/json' } : {},
        body: corpo ? JSON.stringify(corpo) : undefined
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Demorou demais. Tente de novo.' : 'Sem internet. Confira a conexão.');
    } finally { clearTimeout(t); }
    try { json = await resp.json(); } catch (e) { /* vazio */ }
    if (!resp.ok || !json || json.ok === false) {
      var err = new Error((json && json.erro) || 'Erro ' + resp.status + '. Tente de novo.');
      err.campos = json && json.campos; err.campo = json && json.campo;
      throw err;
    }
    return json.data;
  }

  // ---------------------------------------------------------------- telas
  function irPara(n) {
    document.querySelectorAll('.pt-tela').forEach(function (s) { s.hidden = Number(s.dataset.tela) !== n; });
    $('passos').hidden = !(n >= 1 && n <= 4);
    document.querySelectorAll('#passos > span').forEach(function (s) {
      var p = Number(s.dataset.passo);
      s.className = p < n ? 'feito' : (p === n ? 'atual' : '');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n === 3) prepararDestinatario();
    if (n === 4) montarResumo();
  }

  function definirLocal(l) {
    estado.local = l;
    $('localNome').textContent = l === 'METRO' ? 'Metrô' : 'AGF';
    $('localChip').hidden = false;
    salvarRascunho();
    irPara(1);
  }

  // ---------------------------------------------------------------- 1. cotação
  function tipoObjeto() { var r = document.querySelector('input[name="tipoObjeto"]:checked'); return r ? r.value : 'PACOTE'; }

  function aplicarTipo() {
    var t = tipoObjeto();
    document.querySelectorAll('#tipoSeg .seg-item').forEach(function (l) { l.classList.toggle('is-selected', l.querySelector('input').checked); });
    $('alturaField').hidden = t !== 'PACOTE';
    $('larguraField').hidden = t === 'ROLO';
    $('diametroField').hidden = t !== 'ROLO';
    $('dimensoesHint').textContent = t === 'ROLO'
      ? 'Rolo: comprimento e diâmetro. Rolos têm taxa de manuseio especial.'
      : t === 'ENVELOPE' ? 'Envelope: comprimento e largura.' : 'Sem medidas, o atendente confere no balcão.';
    limparOpcoes();
  }

  function marcarPesoRapido() {
    var g = Number($('pesoG').value) || 0;
    document.querySelectorAll('#pesosRapidos button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.g) === g); });
  }

  function limparOpcoes() { $('cardOpcoes').hidden = true; $('opcoes').innerHTML = ''; }

  async function buscarCepDestino() {
    var cep = V.digitos($('cepDestino').value);
    var info = $('cepDestinoInfo');
    if (cep.length !== 8) { info.hidden = true; return; }
    info.hidden = false; info.className = 'field-hint'; info.textContent = 'Buscando...';
    try {
      var d = await api('/cep?cep=' + cep);
      info.textContent = d.municipio + ' / ' + d.uf + (d.bairro ? ' • ' + d.bairro : '');
    } catch (e) { info.className = 'field-hint is-error'; info.textContent = e.message; }
  }

  function medidas() {
    var t = tipoObjeto(), n = function (id) { return Number(String($(id).value || '').replace(',', '.')) || 0; };
    if (t === 'ROLO') return { alturaCm: n('diametroCm'), larguraCm: n('diametroCm'), comprimentoCm: n('comprimentoCm') };
    if (t === 'ENVELOPE') return { alturaCm: n('larguraCm') && n('comprimentoCm') ? 1 : 0, larguraCm: n('larguraCm'), comprimentoCm: n('comprimentoCm') };
    return { alturaCm: n('alturaCm'), larguraCm: n('larguraCm'), comprimentoCm: n('comprimentoCm') };
  }

  async function cotar() {
    var cep = V.digitos($('cepDestino').value);
    if (cep.length !== 8) { toast('Digite o CEP de destino.', 'erro'); $('cepDestino').focus(); return; }
    var g = Math.round(Number($('pesoG').value) || 0);
    if (g <= 0) { toast('Informe o peso aproximado.', 'erro'); $('pesoG').focus(); return; }
    var m = medidas();
    var corpo = { cepDestino: cep, pesoG: g, tipoObjeto: tipoObjeto(), alturaCm: m.alturaCm, larguraCm: m.larguraCm, comprimentoCm: m.comprimentoCm };
    carregando(true, 'Calculando preços...');
    try {
      var r = await api('/cotar', corpo);
      estado.cotacao = corpo;
      estado.opcoes = r.opcoes;
      renderOpcoes(r);
    } catch (e) { limparOpcoes(); toast(e.message, 'erro'); }
    finally { carregando(false); }
  }

  function renderOpcoes(r) {
    $('destinoInfo').innerHTML = '<span class="material-symbols-rounded">where_to_vote</span>' + esc(r.destino.cidade) + ' / ' + esc(r.destino.uf);
    $('opcoes').innerHTML = r.opcoes.map(function (o, i) {
      if (!o.ok) {
        return '<div class="opcao-card disabled"><div class="opcao-header"><span class="material-symbols-rounded">cancel</span><span class="opcao-servico">' + esc(o.nome) + '</span></div>' +
          '<div class="opcao-erro">' + esc(o.erro || 'Indisponível') + '</div></div>';
      }
      return '<button type="button" class="opcao-card" data-i="' + i + '">' +
        '<div class="opcao-header"><span class="material-symbols-rounded">' + (ICONE_SERVICO[o.codigoServico] || 'local_shipping') + '</span><span class="opcao-servico">' + esc(o.nome) + '</span></div>' +
        '<div class="opcao-preco">' + brl(o.total) + '</div>' +
        '<div class="opcao-prazo">' + esc(prazoTexto(o.prazoDias)) + '</div>' +
        '<div class="opcao-escolher">Escolher<span class="material-symbols-rounded">arrow_forward</span></div>' +
      '</button>';
    }).join('');
    $('cardOpcoes').hidden = false;
    $('opcoes').querySelectorAll('[data-i]').forEach(function (b) {
      b.addEventListener('click', function () {
        estado.servico = estado.opcoes[Number(b.dataset.i)];
        irPara(2);
      });
    });
    setTimeout(function () { $('cardOpcoes').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }

  // ---------------------------------------------------------------- 2/3. pessoas
  // Ordem e ícones dos campos (mesma ordem das telas do Atende)
  var CAMPOS = [
    { k: 'documento', rot: 'CPF ou CNPJ', ic: 'badge', modo: 'numeric', auto: 'off', ph: 'Só números' },
    { k: 'nome', rot: 'Nome completo', ic: 'person', auto: 'name' },
    { k: 'celular', rot: 'Celular', ic: 'smartphone', modo: 'tel', auto: 'tel', opc: true, ph: '(85) 99999-9999', meia: true },
    { k: 'email', rot: 'E-mail', ic: 'mail', modo: 'email', auto: 'email', opc: true, meia: true },
    { k: 'cep', rot: 'CEP', ic: 'markunread_mailbox', modo: 'numeric', auto: 'postal-code', ph: '00000-000', acao: true },
    { k: 'endereco', rot: 'Endereço', ic: 'home_pin', auto: 'address-line1', ph: 'Rua, avenida...' },
    { k: 'numero', rot: 'Número', ic: 'pin', auto: 'off', ph: 'Ou S/N', meia: true },
    { k: 'complemento', rot: 'Complemento', ic: 'apartment', auto: 'address-line2', opc: true, meia: true },
    { k: 'bairro', rot: 'Bairro', ic: 'map', auto: 'off' },
    { k: 'cidade', rot: 'Cidade', ic: 'location_city', auto: 'address-level2', meia: true },
    { k: 'uf', rot: 'UF', ic: 'flag', auto: 'address-level1', meia: true }
  ];

  function htmlCampo(papel, c) {
    var opcional = c.opc || (papel === 'destinatario' && c.k === 'documento');
    return '<div class="field" data-campo="' + c.k + '">' +
      '<label class="field-label" for="' + papel + '-' + c.k + '">' + esc(c.rot) + (opcional ? ' <i>(opcional)</i>' : '') + '</label>' +
      '<div class="field-input' + (c.acao ? ' field-with-action' : '') + '">' +
        '<span class="material-symbols-rounded">' + c.ic + '</span>' +
        '<input id="' + papel + '-' + c.k + '" name="' + c.k + '" autocomplete="' + c.auto + '"' + (c.modo ? ' inputmode="' + c.modo + '"' : '') +
          (c.ph ? ' placeholder="' + esc(c.ph) + '"' : '') + (c.k === 'uf' ? ' maxlength="2"' : '') + (c.k === 'cep' ? ' maxlength="9"' : '') + ' />' +
        (c.acao ? '<button type="button" class="field-action" data-buscar-cep><span class="material-symbols-rounded">search</span><span>Buscar</span></button>' : '') +
      '</div>' +
      '<div class="field-hint is-error" hidden></div>' +
    '</div>';
  }

  function montarForm(papel) {
    var form = document.querySelector('form[data-pessoa="' + papel + '"]');
    var html = '', i = 0;
    while (i < CAMPOS.length) {
      var c = CAMPOS[i];
      if (c.meia && CAMPOS[i + 1] && CAMPOS[i + 1].meia) {
        html += '<div class="grid-2">' + htmlCampo(papel, c) + htmlCampo(papel, CAMPOS[i + 1]) + '</div>';
        i += 2;
      } else { html += htmlCampo(papel, c); i += 1; }
    }
    form.innerHTML = html;
    form.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', function () { mascarar(inp); limparErro(inp); });
      inp.addEventListener('blur', function () { inp.value = finalizar(inp.name, inp.value); });
    });
    var cep = form.querySelector('input[name="cep"]');
    cep.addEventListener('input', function () { if (V.digitos(cep.value).length === 8 && !cep.readOnly) preencherPorCep(form, V.digitos(cep.value)); });
    form.querySelector('[data-buscar-cep]').addEventListener('click', function () { preencherPorCep(form, V.digitos(cep.value)); });
  }

  function mascarar(inp) {
    var k = inp.name, v = inp.value;
    if (k === 'documento') { var d = V.digitos(v).slice(0, 14); inp.value = d.length === 11 || d.length === 14 ? V.formatarDocumento(d) : d; return; }
    if (k === 'cep') { inp.value = V.formatarCep(v); return; }
    if (k === 'celular') { inp.value = V.formatarCelular(v); return; }
    if (k === 'email') return;
    var pos = inp.selectionStart;
    var novo = V.texto(v);
    if (k === 'uf') novo = novo.replace(/[^A-Z]/g, '').slice(0, 2);
    if (novo !== v) { inp.value = novo; try { inp.setSelectionRange(pos, pos); } catch (e) { /* ok */ } }
  }
  function finalizar(k, v) {
    if (k === 'email') return V.email(v);
    if (k === 'documento') return V.formatarDocumento(v);
    if (k === 'cep' || k === 'celular') return v;
    return V.textoFinal(v);
  }
  function limparErro(inp) {
    var f = inp.closest('.field'); f.classList.remove('has-error');
    var h = f.querySelector('.field-hint.is-error'); h.hidden = true; h.textContent = '';
  }

  async function preencherPorCep(form, cep) {
    if (cep.length !== 8) { mostrarErros(form, { cep: 'CEP precisa ter 8 números.' }); return; }
    try {
      var d = await api('/cep?cep=' + cep);
      var set = function (k, v) { var i = form.querySelector('input[name="' + k + '"]'); if (i && v) { i.value = V.textoFinal(v); limparErro(i); } };
      set('endereco', d.logradouro); set('bairro', d.bairro); set('cidade', d.municipio); set('uf', d.uf);
      var num = form.querySelector('input[name="numero"]');
      if (num && !num.value) num.focus();
    } catch (e) { mostrarErros(form, { cep: e.message }); }
  }

  function lerForm(papel) {
    var p = {};
    document.querySelectorAll('form[data-pessoa="' + papel + '"] input').forEach(function (i) { p[i.name] = i.value; });
    return p;
  }
  function preencherForm(papel, dados) {
    var form = document.querySelector('form[data-pessoa="' + papel + '"]');
    Object.keys(dados || {}).forEach(function (k) {
      var i = form.querySelector('input[name="' + k + '"]');
      if (i) i.value = V.valorParaExibir(k, dados[k]);
    });
  }
  function mostrarErros(form, erros) {
    var primeiro = null;
    Object.keys(erros).forEach(function (k) {
      var f = form.querySelector('[data-campo="' + k + '"]');
      if (!f) return;
      f.classList.add('has-error');
      var h = f.querySelector('.field-hint.is-error'); h.textContent = erros[k]; h.hidden = false;
      if (!primeiro) primeiro = f.querySelector('input');
    });
    if (primeiro) { primeiro.focus(); primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  function avancarPessoa(papel, proxima) {
    var form = document.querySelector('form[data-pessoa="' + papel + '"]');
    var r = V.validarPessoa(lerForm(papel), papel);
    if (papel === 'destinatario' && r.dados.cep !== V.digitos(estado.cotacao.cepDestino)) r.erros.cep = 'O CEP precisa ser o da cotação.';
    if (Object.keys(r.erros).length) { mostrarErros(form, r.erros); toast('Confira os campos em vermelho.', 'erro'); return; }
    estado[papel] = r.dados;
    preencherForm(papel, r.dados);
    salvarRascunho();
    irPara(proxima);
  }

  function prepararDestinatario() {
    var form = document.querySelector('form[data-pessoa="destinatario"]');
    var cepInp = form.querySelector('input[name="cep"]');
    var cep = V.digitos(estado.cotacao && estado.cotacao.cepDestino);
    if (V.digitos(estado.destinatario.cep) !== cep) {
      estado.destinatario = { cep: cep };
      form.querySelectorAll('input').forEach(function (i) { i.value = ''; });
      cepInp.value = V.formatarCep(cep);
      preencherPorCep(form, cep);
    }
    cepInp.readOnly = true;
    cepInp.closest('.field-input').classList.add('is-locked');
    form.querySelector('[data-buscar-cep]').hidden = true;
  }

  // ---------------------------------------------------------------- 4. conferir e salvar
  function cardPessoa(titulo, icone, p, voltar, dest) {
    var linhas = [p.nome,
      (p.documento ? 'CPF/CNPJ ' + V.formatarDocumento(p.documento) : ''),
      [p.endereco, p.numero].filter(Boolean).join(', ') + (p.complemento ? ' - ' + p.complemento : ''),
      p.bairro + ' - ' + p.cidade + '/' + p.uf,
      'CEP ' + V.formatarCep(p.cep),
      [p.celular ? V.formatarCelular(p.celular) : '', p.email].filter(Boolean).join(' • ')].filter(Boolean);
    return '<section class="card' + (dest ? ' card-dest' : '') + '"><header class="card-head"><span class="material-symbols-rounded">' + icone + '</span><h2>' + titulo + '</h2>' +
      '<button type="button" class="btn btn-ghost btn-sm pt-editar" data-voltar="' + voltar + '"><span class="material-symbols-rounded">edit</span>Editar</button></header>' +
      '<div class="pt-linhas">' + linhas.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div></section>';
  }
  function montarResumo() {
    var s = estado.servico || {};
    $('resumo').innerHTML =
      '<section class="card"><div class="pt-srv"><span class="material-symbols-rounded">' + (ICONE_SERVICO[s.codigoServico] || 'local_shipping') + '</span>' +
        '<div><b>' + esc(s.nome) + '</b><span>' + esc(prazoTexto(s.prazoDias)) + ' • estimado</span></div><strong>' + brl(s.total) + '</strong></div></section>' +
      cardPessoa('Remetente', 'person', estado.remetente, 2) + cardPessoa('Destinatário', 'person_pin_circle', estado.destinatario, 3, true);
    $('resumo').querySelectorAll('[data-voltar]').forEach(function (b) { b.addEventListener('click', function () { irPara(Number(b.dataset.voltar)); }); });
  }

  async function salvar() {
    if (!$('aceite').checked) { toast('Marque a caixa de concordância.', 'erro'); return; }
    var btn = $('btnSalvar'); btn.disabled = true;
    carregando(true, 'Salvando etiqueta...');
    try {
      var r = await api('/etiquetas', {
        local: estado.local, servico: estado.servico.codigoServico, cotacao: estado.cotacao,
        remetente: estado.remetente, destinatario: estado.destinatario, aceite: true
      });
      $('codigoFinal').textContent = r.codigo;
      $('finalInfo').innerHTML = '<span class="badge badge-info">' + esc(r.servico) + '</span><span class="badge badge-muted">' + brl(r.total) + ' estimado</span><span class="badge badge-muted">' + esc(r.localNome) + '</span>';
      $('aceite').checked = false;
      irPara(5);
    } catch (e) {
      toast(e.message, 'erro');
      var campos = e.campos || (e.campo ? (function () { var o = {}; o[e.campo] = e.message; return o; })() : null);
      if (campos) {
        var papel = Object.keys(campos)[0].split('.')[0];
        irPara(papel === 'remetente' ? 2 : 3);
        var erros = {};
        Object.keys(campos).filter(function (c) { return c.indexOf(papel + '.') === 0; }).forEach(function (c) { erros[c.split('.')[1]] = campos[c]; });
        mostrarErros(document.querySelector('form[data-pessoa="' + papel + '"]'), erros);
      }
    } finally { btn.disabled = false; carregando(false); }
  }

  function outroObjeto(mesmoRemetente) {
    estado.cotacao = null; estado.opcoes = []; estado.servico = null; estado.destinatario = {};
    if (!mesmoRemetente) {
      estado.remetente = {}; limparRascunho();
      document.querySelectorAll('form[data-pessoa="remetente"] input').forEach(function (i) { i.value = ''; });
    }
    document.querySelectorAll('form[data-pessoa="destinatario"] input').forEach(function (i) { i.value = ''; });
    ['cepDestino', 'pesoG', 'alturaCm', 'larguraCm', 'comprimentoCm', 'diametroCm'].forEach(function (id) { $(id).value = ''; });
    $('cepDestinoInfo').hidden = true; marcarPesoRapido(); limparOpcoes();
    salvarRascunho();
    irPara(1);
  }

  // ---------------------------------------------------------------- início
  function iniciar() {
    montarForm('remetente');
    montarForm('destinatario');

    document.querySelectorAll('[data-local]').forEach(function (b) { b.addEventListener('click', function () { definirLocal(b.dataset.local); }); });
    document.querySelectorAll('.pt-acoes [data-voltar]').forEach(function (b) { b.addEventListener('click', function () { irPara(Number(b.dataset.voltar)); }); });
    document.querySelectorAll('input[name="tipoObjeto"]').forEach(function (r) { r.addEventListener('change', aplicarTipo); });
    $('cepDestino').addEventListener('input', function () {
      this.value = V.formatarCep(this.value);
      limparOpcoes();
      if (V.digitos(this.value).length === 8) buscarCepDestino(); else $('cepDestinoInfo').hidden = true;
    });
    $('btnBuscarCep').addEventListener('click', buscarCepDestino);
    $('pesoG').addEventListener('input', function () { marcarPesoRapido(); limparOpcoes(); });
    document.querySelectorAll('#pesosRapidos button').forEach(function (b) {
      b.addEventListener('click', function () { $('pesoG').value = b.dataset.g; marcarPesoRapido(); limparOpcoes(); });
    });
    ['alturaCm', 'larguraCm', 'comprimentoCm', 'diametroCm'].forEach(function (id) { $(id).addEventListener('input', limparOpcoes); });
    $('btnCotar').addEventListener('click', cotar);
    $('btnRemetente').addEventListener('click', function () { avancarPessoa('remetente', 3); });
    $('btnDestinatario').addEventListener('click', function () { avancarPessoa('destinatario', 4); });
    $('btnSalvar').addEventListener('click', salvar);
    $('btnOutroMesmo').addEventListener('click', function () { outroObjeto(true); });
    $('btnNova').addEventListener('click', function () { outroObjeto(false); });

    aplicarTipo();
    var r = lerRascunho();
    if (r && r.remetente) { estado.remetente = r.remetente; preencherForm('remetente', r.remetente); }
    var param = String(new URLSearchParams(location.search).get('local') || '').toUpperCase().replace(/[^A-Z]/g, '');
    var local = LOCAIS[param] ? param : (r && LOCAIS[r.local] ? r.local : '');
    if (local) definirLocal(local); else irPara(0);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
