/* =====================================================
   APP ETIQUETAS — Screen: historico
   =====================================================
   Lista as etiquetas geradas pelo usuário logado.
   Funcionalidades:
     - Filtro por mês, status e UF
     - Resumo financeiro das postagens concluídas no mês
     - Busca livre por nome/código/id (input)
     - Reimprimir (baixa PDF do Drive ou regera)
     - Cancelar (DELETE /prepostagens/{id} nos Correios)
     - Rastrear objeto via API Rastro dos Correios
     - Debounce na busca (não spammar o backend)
   ===================================================== */

Screens.historico = (function () {

  let _buscaTimer = null;

  function $(id) { return document.getElementById(id); }

  const STATUS_LABEL = {
    'CONCLUIDO':             { label: 'Concluído', badge: 'badge-ok' },
    'PROCESSANDO_VALIDACAO': { label: 'Processando', badge: 'badge-info' },
    'PROCESSANDO_PREPOST':   { label: 'Processando', badge: 'badge-info' },
    'PROCESSANDO_ROTULO':    { label: 'Processando', badge: 'badge-info' },
    'ERRO_VALIDACAO':        { label: 'Erro validação', badge: 'badge-err' },
    'ERRO_PREPOST':          { label: 'Erro pré-postagem', badge: 'badge-err' },
    'ERRO_ROTULO':           { label: 'Erro rótulo', badge: 'badge-err' },
    'CANCELADO':             { label: 'Cancelado', badge: 'badge-muted' }
  };


  function formatMonthLabel_(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return 'Todos os meses';
    const parts = String(value).split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    try {
      const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch (e) {
      return parts[1] + '/' + parts[0];
    }
  }

  function renderResumo(data) {
    const resumo = (data && data.resumo) || {};
    const periodo = resumo.periodo || (($('histMes') && $('histMes').value) || '');
    const qtd = Number(resumo.totalPostagensConcluidas || 0);
    const total = Number(resumo.valorTotalPostagens || 0);
    const resultados = Number(resumo.totalResultados != null ? resumo.totalResultados : ((data && data.total) || 0));

    if ($('histResumoTitulo')) $('histResumoTitulo').textContent = formatMonthLabel_(periodo);
    if ($('histResumoQtd')) $('histResumoQtd').textContent = String(isFinite(qtd) ? qtd : 0);
    if ($('histResumoValor')) $('histResumoValor').textContent = UI.fmtMoney(isFinite(total) ? total : 0);
    if ($('histResumoResultados')) $('histResumoResultados').textContent = String(isFinite(resultados) ? resultados : 0);
  }

  function statusBadge(status) {
    const s = STATUS_LABEL[status] || { label: status || '—', badge: 'badge-muted' };
    return '<span class="badge ' + s.badge + '">' + UI.escapeHtml(s.label) + '</span>';
  }

  function itemActions(item) {
    const status = (item.status || '').toUpperCase();
    const parts = [];

    if (status === 'CONCLUIDO') {
      if (item.codigoObjeto && item.destCelular) {
        parts.push('<button class="btn btn-whatsapp btn-sm" data-act="whatsapp" data-celular="' + UI.escapeHtml(item.destCelular) + '" data-nome="' + UI.escapeHtml(item.destNome || '') + '" data-codigo="' + UI.escapeHtml(item.codigoObjeto) + '">' +
                   '<span class="material-symbols-rounded">send</span>Enviar por WhatsApp</button>');
      }
      parts.push('<button class="btn btn-ghost btn-sm" data-act="reimprimir" data-id="' +
                 UI.escapeHtml(item.idRegistro) + '">' +
                 '<span class="material-symbols-rounded">print</span>Reimprimir</button>');
      if (item.idPrepostagem) {
        parts.push('<button class="btn btn-ghost btn-sm" data-act="cancelar" data-id="' +
                   UI.escapeHtml(item.idRegistro) + '">' +
                   '<span class="material-symbols-rounded">cancel</span>Cancelar</button>');
      }
    } else if (status === 'ERRO_ROTULO' && item.idPrepostagem) {
      parts.push('<button class="btn btn-ghost btn-sm" data-act="reimprimir" data-id="' +
                 UI.escapeHtml(item.idRegistro) + '">' +
                 '<span class="material-symbols-rounded">refresh</span>Tentar novamente</button>');
      parts.push('<button class="btn btn-ghost btn-sm" data-act="cancelar" data-id="' +
                 UI.escapeHtml(item.idRegistro) + '">' +
                 '<span class="material-symbols-rounded">cancel</span>Cancelar</button>');
    }

    return parts.join('');
  }

  function rastreioChip(codigo) {
    if (!codigo) return '';
    return '<button class="track-chip" type="button" data-act="rastrear" data-codigo="' + UI.escapeHtml(codigo) + '">' +
             '<span class="material-symbols-rounded">local_shipping</span>' +
             UI.escapeHtml(codigo) +
           '</button>';
  }


  function getPdfUrl(data) {
    if (!data) return '';
    return data.driveDownloadUrl || data.driveUrl || data.urlPdfDrive || data.pdfUrl || '';
  }

  function normalizeReimpressaoPayload(data) {
    data = data || {};
    return {
      idRegistro: data.idRegistro,
      idPrePostagem: data.idPrePostagem,
      codigoObjeto: data.codigoObjeto,
      tipoDocumento: data.tipoDocumento,
      pdfBase64: data.pdfBase64 || '',
      pdfFileName: data.pdfFileName,
      driveUrl: data.driveUrl || data.urlPdfDrive || data.pdfUrl || '',
      driveDownloadUrl: data.driveDownloadUrl || '',
      declaracao: data.declaracao || null,
      declaracaoErro: data.erros ? data.erros.join(' | ') : null
    };
  }

  function renderList(items) {
    const list = $('histList');
    if (!list) return;

    if (!items || !items.length) {
      list.innerHTML = '<div class="hist-empty">Nenhuma etiqueta encontrada.</div>';
      return;
    }

    list.innerHTML = items.map(it => {
      const dest = UI.escapeHtml(it.destNome || '—');
      const meta = UI.joinNonEmpty([
        it.dataHora,
        (it.destCidade || '') + (it.destUf ? '/' + it.destUf : ''),
        it.servico,
        it.pesoG ? (it.pesoG + 'g') : '',
        Number(it.precoCotadoNumero) > 0 ? UI.fmtMoney(it.precoCotadoNumero) : (it.precoCotado ? ('R$ ' + String(it.precoCotado).replace('.', ',')) : '')
      ], ' • ');
      const codigo = it.codigoObjeto || it.idPrepostagem || '';
      const erroMsg = (it.status || '').indexOf('ERRO') === 0 && it.mensagemErro
        ? '<div class="hist-item-meta" style="color:var(--err);margin-top:4px">' +
          UI.escapeHtml(it.mensagemErro) + '</div>'
        : '';

      return '<div class="hist-item">' +
               '<div class="hist-item-main">' +
                 '<div class="hist-item-nome">' + dest + '</div>' +
                 '<div class="hist-item-meta">' + UI.escapeHtml(meta) + '</div>' +
                 (codigo ? '<div class="hist-item-track">' + rastreioChip(codigo) + '</div>' : '') +
                 erroMsg +
               '</div>' +
               '<div class="hist-item-actions">' +
                 statusBadge(it.status) +
                 itemActions(it) +
               '</div>' +
             '</div>';
    }).join('');

    list.querySelectorAll('button[data-act]').forEach(btn => {
      const act = btn.getAttribute('data-act');
      const id = btn.getAttribute('data-id');
      const codigo = btn.getAttribute('data-codigo');
      const celular = btn.getAttribute('data-celular');
      const nome = btn.getAttribute('data-nome');
      if (act === 'reimprimir') btn.addEventListener('click', () => reimprimir(id));
      if (act === 'cancelar')   btn.addEventListener('click', () => cancelar(id));
      if (act === 'rastrear')   btn.addEventListener('click', () => abrirRastreio(codigo));
      if (act === 'whatsapp')   btn.addEventListener('click', () => abrirWhatsapp(celular, nome, codigo));
    });
  }

  async function carregar() {
    const list = $('histList');
    if (list) list.innerHTML = '<div class="hist-empty">Carregando...</div>';

    const filtros = {
      mes:    $('histMes') ? ($('histMes').value || '') : '',
      status: $('histStatus') ? ($('histStatus').value || '') : '',
      uf:     $('histUf') ? ($('histUf').value || '') : '',
      busca:  $('histBusca') ? ($('histBusca').value.trim() || '') : '',
      limit:  500
    };

    try {
      const data = await Api.listarHistorico(filtros);
      renderResumo(data);
      renderUfOptions(data.ufs || []);
      renderList(data.items || []);
    } catch (e) {
      UI.toastError(e);
      if (list) list.innerHTML = '<div class="hist-empty">Falha ao carregar histórico.</div>';
    }
  }

  function renderUfOptions(ufs) {
    const select = $('histUf');
    if (!select) return;
    const current = select.value || '';
    select.innerHTML = '<option value="">Todas as UFs</option>' + (ufs || []).map(uf => '<option value="' + UI.escapeHtml(uf) + '">' + UI.escapeHtml(uf) + '</option>').join('');
    select.value = current;
  }

  function normalizarWhatsapp_(celular) {
    let d = UI.digitsOnly(celular || '');
    if (!d) return '';
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }

  function abrirWhatsapp(celular, nome, codigoObjeto) {
    const numero = normalizarWhatsapp_(celular);
    if (!numero) { UI.toast('Celular do destinatário não cadastrado.', 'error'); return; }
    if (!codigoObjeto) { UI.toast('Número de rastreio não disponível.', 'error'); return; }
    const rastreioUrl = window.location.origin + '/rastreio/?objeto=' + encodeURIComponent(codigoObjeto);
    const texto = 'Olá ' + (nome || '') + ', o seu pedido já foi enviado!\n\n' +
      '\uD83D\uDCE6 Esse é o seu número de rastreio:\n' + codigoObjeto + '\n\n' +
      'Você pode acompanhar através do seguinte link:\n' + rastreioUrl;
    window.open('https://wa.me/' + numero + '?text=' + encodeURIComponent(texto), '_blank', 'noopener,noreferrer');
  }

  async function reimprimir(idRegistro) {
    UI.showLoading('Buscando PDF...');
    try {
      const data = await Api.reimprimirEtiqueta(idRegistro);
      const payload = normalizeReimpressaoPayload(data);
      const temPdfPrincipal = !!payload.pdfBase64 || !!getPdfUrl(payload);

      if (!temPdfPrincipal && payload.declaracao && payload.declaracao.pdfBase64) {
        throw new Error('A declaração foi encontrada, mas o PDF principal da etiqueta não voltou do servidor. Verifique o arquivo salvo no Drive.');
      }

      if (!temPdfPrincipal) {
        throw new Error('PDF não encontrado. Verifique se o arquivo da etiqueta ainda existe no Drive e tente novamente.');
      }

      Router.setSuccessData(payload);
      Router.navigate('/sucesso');
    } catch (e) {
      UI.toastError(e);
    } finally {
      UI.hideLoading();
    }
  }

  async function cancelar(idRegistro) {
    const ok = await UI.confirm({
      title: 'Cancelar etiqueta?',
      body: 'A pré-postagem será cancelada nos Correios. Só funciona se a etiqueta ainda não foi postada no balcão. Deseja continuar?',
      confirmText: 'Cancelar etiqueta',
      cancelText: 'Voltar',
      danger: true
    });
    if (!ok) return;

    UI.showLoading('Cancelando...');
    try {
      await Api.cancelarEtiqueta(idRegistro);
      UI.hideLoading();
      UI.toast('Etiqueta cancelada', 'success');
      carregar();
    } catch (e) {
      UI.hideLoading();
      UI.toastError(e);
    }
  }

  function ensureTrackModal_() {
    let modal = document.getElementById('trackModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'trackModal';
    modal.className = 'track-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = [
      '<div class="track-modal-card" role="dialog" aria-modal="true" aria-labelledby="trackTitle" tabindex="-1">',
      '  <div class="track-modal-head">',
      '    <div>',
      '      <div class="track-modal-title" id="trackTitle">Rastreio</div>',
      '      <div class="track-modal-code" id="trackCodigo">—</div>',
      '    </div>',
      '    <button class="icon-btn" type="button" id="trackClose" aria-label="Fechar"><span class="material-symbols-rounded">close</span></button>',
      '  </div>',
      '  <div class="track-summary">',
      '    <div class="track-status-badge" id="trackStatus">Consultando...</div>',
      '    <div class="track-summary-meta" id="trackResumo"></div>',
      '  </div>',
      '  <div class="track-timeline" id="trackTimeline"></div>',
      '  <div class="track-modal-actions">',
      '    <button class="btn btn-ghost btn-block" type="button" id="trackAtualizar"><span class="material-symbols-rounded">refresh</span>Atualizar rastreio</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) fecharRastreio();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) fecharRastreio();
    });
    modal.querySelector('#trackClose').addEventListener('click', fecharRastreio);
    modal.querySelector('#trackAtualizar').addEventListener('click', function () {
      const codigo = modal.getAttribute('data-codigo');
      if (codigo) abrirRastreio(codigo);
    });
    return modal;
  }

  function fecharRastreio() {
    const modal = document.getElementById('trackModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (UI.repairScrollLock) UI.repairScrollLock();
  }

  function renderTimeline(eventos) {
    const timeline = document.getElementById('trackTimeline');
    if (!timeline) return;
    if (!eventos || !eventos.length) {
      timeline.innerHTML = '<div class="track-empty">Nenhum evento de rastreio disponível.</div>';
      return;
    }
    timeline.innerHTML = eventos.map(function (ev) {
      const unidade = UI.joinNonEmpty([ev.unidadeTipo, UI.joinNonEmpty([ev.cidade, ev.uf], '/')], ' • ');
      const destino = UI.joinNonEmpty([ev.unidadeDestinoTipo, UI.joinNonEmpty([ev.unidadeDestinoCidade, ev.unidadeDestinoUf], '/')], ' • ');
      return '<div class="track-event">' +
               '<div class="track-event-dot"></div>' +
               '<div class="track-event-body">' +
                 '<div class="track-event-date">' + UI.escapeHtml(ev.dataHora || '') + '</div>' +
                 '<div class="track-event-title">' + UI.escapeHtml(ev.descricao || 'Sem descrição') + '</div>' +
                 (ev.detalhe ? '<div class="track-event-detail">' + UI.escapeHtml(ev.detalhe) + '</div>' : '') +
                 (unidade ? '<div class="track-event-place">' + UI.escapeHtml(unidade) + '</div>' : '') +
                 (destino ? '<div class="track-event-destino">Destino: ' + UI.escapeHtml(destino) + '</div>' : '') +
               '</div>' +
             '</div>';
    }).join('');
  }

  async function abrirRastreio(codigoObjeto) {
    if (!codigoObjeto) return;
    const modal = ensureTrackModal_();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('data-codigo', codigoObjeto);
    document.body.classList.add('modal-open');

    document.getElementById('trackCodigo').textContent = codigoObjeto;
    document.getElementById('trackStatus').textContent = 'Consultando...';
    document.getElementById('trackStatus').className = 'track-status-badge';
    document.getElementById('trackResumo').textContent = '';
    document.getElementById('trackTimeline').innerHTML = '<div class="track-empty">Carregando rastreio...</div>';

    try {
      const data = await Api.rastrearObjeto(codigoObjeto);
      const resumo = UI.joinNonEmpty([
        data.ultimaAtualizacao ? ('Atualizado em ' + data.ultimaAtualizacao) : '',
        data.localAtual ? ('Local: ' + data.localAtual) : ''
      ], ' • ');
      document.getElementById('trackStatus').textContent = data.statusLabel || 'Sem status';
      document.getElementById('trackStatus').className = 'track-status-badge ' + (data.statusClass || 'is-info');
      document.getElementById('trackResumo').textContent = resumo;
      renderTimeline(data.eventos || []);
    } catch (e) {
      document.getElementById('trackStatus').textContent = 'Falha ao consultar';
      document.getElementById('trackStatus').className = 'track-status-badge is-err';
      document.getElementById('trackResumo').textContent = e && e.message ? e.message : 'Erro ao consultar rastreio.';
      document.getElementById('trackTimeline').innerHTML = '<div class="track-empty">Não foi possível consultar o rastreio agora.</div>';
    }
  }

  function mount() {
    const busca = $('histBusca');
    const status = $('histStatus');
    const uf = $('histUf');
    const mes = $('histMes');
    ensureTrackModal_();


    if (busca) {
      busca.addEventListener('input', () => {
        if (_buscaTimer) clearTimeout(_buscaTimer);
        _buscaTimer = setTimeout(carregar, 300);
      });
    }
    if (status) {
      status.addEventListener('change', carregar);
    }
    if (uf) {
      uf.addEventListener('change', carregar);
    }
    if (mes) {
      mes.addEventListener('change', carregar);
    }

    carregar();
  }

  return { mount };
})();
