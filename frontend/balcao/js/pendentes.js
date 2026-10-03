/* =====================================================
   BALCÃO DO ATENDENTE - Etiquetas do cliente (QR Code /postar)
   - Fila do dia por local (AGF ou METRÔ), atualizada sozinha.
   - Campos prontos para copiar e colar no Atende, na ordem das telas.
   - Imprime a mesma etiqueta do balcão (espaço superior para o SRO).
   - Também padroniza a ficha digitada pelo atendente (maiúsculas, sem acento).
   Carregado pelo balcao.js. Não altera a cotação nem a ficha do atendente.
   ===================================================== */
(function () {
  'use strict';
  var V = window.AgfValidacao;
  var LOCAL_KEY = 'agf_balcao_local';
  var INTERVALO_MS = 10000;
  var STATUS = { PENDENTE: 'Pendente', EM_ATENDIMENTO: 'Em atendimento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', EXPIRADA: 'Expirada' };
  var $ = function (id) { return document.getElementById(id); };
  var st = { local: lerLocal(), etiquetas: [], aberta: null, carregando: false, ultimoPendentes: null, timer: null };

  function lerLocal() { try { return localStorage.getItem(LOCAL_KEY) === 'METRO' ? 'METRO' : 'AGF'; } catch (e) { return 'AGF'; } }
  function gravarLocal(l) { try { localStorage.setItem(LOCAL_KEY, l); } catch (e) { /* ok */ } }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(n) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','); }
  function hora(utc) {
    if (!utc) return '';
    var d = new Date(String(utc).replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
  }
  function toast(msg, tipo) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg; el.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(el._bp); el._bp = setTimeout(function () { el.classList.remove('show'); }, 3600);
  }

  // ---------------------------------------------------------------- estrutura
  function montar() {
    var main = document.querySelector('main.app-shell');
    if (!main || $('bpFila')) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = './styles/pendentes.css?v=2.2.0';
    document.head.appendChild(css);
    var sec = document.createElement('section');
    sec.className = 'card bp-fila';
    sec.id = 'bpFila';
    sec.innerHTML =
      '<header class="bp-head">' +
        '<span class="material-symbols-rounded">qr_code_scanner</span>' +
        '<div class="bp-titulo"><h2>Etiquetas do cliente</h2><p>Geradas pelo QR Code do balcão. O atendente também pode digitar a ficha abaixo, como sempre.</p></div>' +
        '<div class="bp-locais" role="group" aria-label="Local">' +
          '<button type="button" data-bp-local="AGF">AGF</button><button type="button" data-bp-local="METRO">METRÔ</button>' +
        '</div>' +
        '<span class="bp-badge" id="bpBadge" hidden>0</span>' +
        '<button type="button" class="bp-icone" id="bpAtualizar" title="Atualizar"><span class="material-symbols-rounded">refresh</span></button>' +
      '</header>' +
      '<div class="bp-lista" id="bpLista"><div class="bp-vazio">Carregando...</div></div>' +
      '<details class="bp-finalizadas" id="bpFinalizadasWrap" hidden><summary id="bpFinalizadasTit">Finalizadas hoje</summary><div class="bp-lista" id="bpFinalizadas"></div></details>';
    main.insertBefore(sec, main.firstElementChild);

    var modal = document.createElement('div');
    modal.className = 'bp-modal';
    modal.id = 'bpModal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="bp-modal-card" id="bpModalCard"></div>';
    document.body.appendChild(modal);

    sec.querySelectorAll('[data-bp-local]').forEach(function (b) {
      b.addEventListener('click', function () { st.local = b.dataset.bpLocal; gravarLocal(st.local); st.ultimoPendentes = null; marcarLocal(); carregar(); });
    });
    $('bpAtualizar').addEventListener('click', function () { carregar(true); });
    modal.addEventListener('click', function (e) { if (e.target === modal) fecharModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) fecharModal(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') carregar(); });
    marcarLocal();
  }
  function marcarLocal() {
    document.querySelectorAll('[data-bp-local]').forEach(function (b) {
      var on = b.dataset.bpLocal === st.local;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ---------------------------------------------------------------- fila
  async function carregar(manual) {
    if (st.carregando) return;
    st.carregando = true;
    try {
      var r = await BalcaoApi.etiquetas(st.local);
      st.etiquetas = r.etiquetas || [];
      if (st.ultimoPendentes !== null && r.pendentes > st.ultimoPendentes) {
        var nova = st.etiquetas.filter(function (e) { return e.status === 'PENDENTE'; }).slice(-1)[0];
        toast('Nova etiqueta do cliente: ' + (nova ? nova.codigo : ''), 'success');
      }
      st.ultimoPendentes = r.pendentes;
      renderLista();
      if (manual) toast('Fila atualizada', 'success');
    } catch (e) {
      $('bpLista').innerHTML = '<div class="bp-vazio erro">' + esc(e.message) + '</div>';
    } finally { st.carregando = false; }
  }

  function item(e) {
    var acao = e.status === 'PENDENTE' ? 'Atender' : 'Abrir';
    return '<article class="bp-item st-' + e.status.toLowerCase() + '">' +
      '<div class="bp-cod">' + esc(e.codigo) + '<small>' + esc(hora(e.criadaEm)) + '</small></div>' +
      '<div class="bp-info"><b>' + esc(e.remetente.nome) + '</b>' +
        '<span>para ' + esc(e.destinatario.nome) + ' • ' + esc(e.destinatario.cidade) + '/' + esc(e.destinatario.uf) + '</span>' +
        '<span>' + (e.servico ? '' : '<b class="bp-tag">Só etiqueta</b> ') + esc(e.servicoNome) + ' • ' + (e.total != null ? brl(e.total) : 'preço no SARA') + (e.atendente && e.status !== 'PENDENTE' ? ' • ' + esc(e.atendente) : '') + (e.sro ? ' • ' + esc(e.sro) : '') + '</span></div>' +
      '<span class="bp-chip">' + esc(STATUS[e.status] || e.status) + '</span>' +
      '<button type="button" class="btn ' + (e.status === 'PENDENTE' ? 'btn-primary' : 'btn-ghost') + '" data-bp-abrir="' + esc(e.id) + '">' + acao + '</button>' +
    '</article>';
  }

  function renderLista() {
    var abertas = st.etiquetas.filter(function (e) { return e.status === 'PENDENTE' || e.status === 'EM_ATENDIMENTO'; });
    var fim = st.etiquetas.filter(function (e) { return e.status !== 'PENDENTE' && e.status !== 'EM_ATENDIMENTO'; });
    var pend = abertas.filter(function (e) { return e.status === 'PENDENTE'; }).length;
    $('bpBadge').hidden = !pend; $('bpBadge').textContent = pend;
    $('bpLista').innerHTML = abertas.length ? abertas.map(item).join('') : '<div class="bp-vazio">Nenhuma etiqueta de cliente aguardando.</div>';
    $('bpFinalizadasWrap').hidden = !fim.length;
    $('bpFinalizadasTit').textContent = 'Finalizadas hoje (' + fim.length + ')';
    $('bpFinalizadas').innerHTML = fim.map(item).join('');
    document.querySelectorAll('[data-bp-abrir]').forEach(function (b) {
      b.addEventListener('click', function () { abrir(b.dataset.bpAbrir); });
    });
    if (st.aberta) {
      var atual = st.etiquetas.filter(function (e) { return e.id === st.aberta.id; })[0];
      if (atual && atual.status !== st.aberta.status) { st.aberta = atual; renderModal(); }
    }
  }

  // ---------------------------------------------------------------- detalhe
  async function abrir(id) {
    var e = st.etiquetas.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    if (e.status === 'PENDENTE') {
      try { e = await BalcaoApi.mudarStatus({ id: id, status: 'EM_ATENDIMENTO' }); }
      catch (err) { toast(err.message, 'error'); carregar(); return; }
      carregar();
    }
    st.aberta = e;
    renderModal();
    $('bpModal').hidden = false;
    document.body.classList.add('bp-travado');
    var f = $('bpModalCard').querySelector('[data-bp-copiar]');
    if (f) f.focus();
  }
  function fecharModal() {
    $('bpModal').hidden = true;
    document.body.classList.remove('bp-travado');
    st.aberta = null;
  }

  function blocoPessoa(titulo, papel, p) {
    return '<div class="bp-pessoa"><h3>' + titulo + '</h3>' + V.ORDEM.map(function (k) {
      var v = p[k] || '';
      var exib = V.valorParaExibir(k, v);
      return '<div class="bp-linha' + (v ? '' : ' vazio') + '"><span class="bp-rot">' + esc(V.ROTULOS[k]) + '</span>' +
        '<span class="bp-val">' + (v ? esc(exib) : '-') + '</span>' +
        (v ? '<button type="button" class="bp-copiar" data-bp-copiar="' + esc(V.valorParaColar(k, v)) + '" aria-label="Copiar ' + esc(V.ROTULOS[k]) + '">' +
          '<span class="material-symbols-rounded">content_copy</span></button>' : '<span class="bp-copiar-off"></span>') +
      '</div>';
    }).join('') + '</div>';
  }

  function renderModal() {
    var e = st.aberta;
    if (!e) return;
    var aberta = e.status === 'PENDENTE' || e.status === 'EM_ATENDIMENTO';
    var c = e.cotacao || {};
    var medidas = c.alturaCm && c.larguraCm && c.comprimentoCm ? ' • ' + c.alturaCm + ' x ' + c.larguraCm + ' x ' + c.comprimentoCm + ' cm' : '';
    $('bpModalCard').innerHTML =
      '<header class="bp-modal-head">' +
        '<div><div class="bp-modal-cod">' + esc(e.codigo) + '</div><span class="bp-chip">' + esc(STATUS[e.status] || e.status) + (e.atendente ? ' • ' + esc(e.atendente) : '') + '</span></div>' +
        '<div class="bp-modal-srv"><b>' + esc(e.servicoNome) + (e.servico ? ' (' + esc(e.servico) + ')' : '') + '</b>' +
          (e.total != null
            ? '<span>' + brl(e.total) + ' estimado' + (e.prazoDias ? ' • ' + e.prazoDias + (Number(e.prazoDias) === 1 ? ' dia útil' : ' dias úteis') : '') + '</span>' +
              '<span>Peso informado pelo cliente: ' + esc(e.pesoG) + ' g' + esc(medidas) + '</span>'
            : '<span>Cliente escolheu "Só gerar a etiqueta": sem cotação. Pese e defina o serviço no SARA.</span>') +
        '</div>' +
        '<button type="button" class="bp-icone" id="bpFechar" aria-label="Fechar"><span class="material-symbols-rounded">close</span></button>' +
      '</header>' +
      '<p class="bp-aviso">Confira o peso na balança e lance no SARA. Clique no ícone para copiar cada campo.</p>' +
      '<div class="bp-pessoas">' + blocoPessoa('Remetente', 'remetente', e.remetente) + blocoPessoa('Destinatário', 'destinatario', e.destinatario) + '</div>' +
      '<footer class="bp-modal-pe">' +
        (aberta ? '<label class="bp-sro"><span>Código SRO (opcional)</span><input id="bpSro" maxlength="13" placeholder="AB123456789BR" autocomplete="off" /></label>' : (e.sro ? '<p class="bp-aviso">SRO: <b>' + esc(e.sro) + '</b></p>' : '')) +
        '<div class="bp-botoes">' +
          '<button type="button" class="btn btn-primary" id="bpImprimir"><span class="material-symbols-rounded">print</span>Imprimir etiqueta</button>' +
          (aberta ? '<button type="button" class="btn btn-primary bp-ok" id="bpConcluir"><span class="material-symbols-rounded">check_circle</span>Concluir</button>' +
            '<button type="button" class="btn btn-ghost" id="bpDevolver"><span class="material-symbols-rounded">undo</span>Devolver à fila</button>' +
            '<button type="button" class="btn btn-ghost bp-perigo" id="bpCancelar"><span class="material-symbols-rounded">block</span>Cancelar</button>' : '') +
        '</div>' +
      '</footer>';

    $('bpFechar').addEventListener('click', fecharModal);
    $('bpImprimir').addEventListener('click', imprimir);
    $('bpModalCard').querySelectorAll('[data-bp-copiar]').forEach(function (b) {
      b.addEventListener('click', function () { copiar(b); });
    });
    if (aberta) {
      var sro = $('bpSro');
      sro.addEventListener('input', function () { sro.value = sro.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13); });
      $('bpConcluir').addEventListener('click', function () { mudar('CONCLUIDA', sro.value); });
      $('bpDevolver').addEventListener('click', function () { mudar('PENDENTE'); });
      $('bpCancelar').addEventListener('click', function () { if (window.confirm('Cancelar a etiqueta ' + e.codigo + '?')) mudar('CANCELADA'); });
    }
  }

  async function copiar(btn) {
    var v = btn.getAttribute('data-bp-copiar');
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(v);
      else {
        var t = document.createElement('textarea'); t.value = v; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      btn.classList.add('copiado');
      btn.querySelector('.material-symbols-rounded').textContent = 'check';
      setTimeout(function () { btn.classList.remove('copiado'); btn.querySelector('.material-symbols-rounded').textContent = 'content_copy'; }, 1600);
    } catch (e) { toast('Não consegui copiar. Selecione o texto e use Ctrl+C.', 'error'); }
  }

  async function mudar(status, sro) {
    var e = st.aberta;
    try {
      st.aberta = await BalcaoApi.mudarStatus({ id: e.id, status: status, sro: sro || '' });
      toast(status === 'CONCLUIDA' ? 'Etiqueta ' + e.codigo + ' concluída' : status === 'CANCELADA' ? 'Etiqueta cancelada' : 'Etiqueta devolvida à fila', 'success');
      fecharModal();
    } catch (err) { toast(err.message, 'error'); }
    carregar();
  }

  function imprimir() {
    var e = st.aberta;
    if (!e || typeof BalcaoPage === 'undefined' || !BalcaoPage.imprimirEtiqueta) { toast('Impressão indisponível. Atualize a página.', 'error'); return; }
    BalcaoPage.imprimirEtiqueta({ pesoG: e.pesoG || '' }, { nome: e.servico ? e.servicoNome : '', codigoServico: e.servico }, {
      remetente: e.remetente, destinatario: e.destinatario, observacao: 'Etiqueta ' + e.codigo
    });
  }

  // ---------------------------------------------------------------- ficha digitada pelo atendente
  /** Mesma padronização do cliente: maiúsculas e sem acento ao sair do campo. E-mail em minúsculas. */
  function padronizarFichaAtendente() {
    ['rem', 'dest'].forEach(function (pre) {
      ['Nome', 'Endereco', 'Numero', 'Complemento', 'Bairro', 'Cidade', 'Uf'].forEach(function (campo) {
        var el = $(pre + campo);
        if (!el || el._bpPad) return;
        el._bpPad = true;
        el.addEventListener('blur', function () { el.value = V.textoFinal(el.value); });
      });
      var em = $(pre + 'Email');
      if (em && !em._bpPad) { em._bpPad = true; em.addEventListener('blur', function () { em.value = V.email(em.value); }); }
    });
  }

  function iniciar() {
    if (!V || typeof BalcaoApi === 'undefined' || !BalcaoApi.etiquetas) return;
    montar();
    padronizarFichaAtendente();
    carregar();
    st.timer = setInterval(function () { if (document.visibilityState === 'visible') carregar(); }, INTERVALO_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
