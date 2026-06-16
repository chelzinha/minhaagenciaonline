/* =====================================================
   APP ETIQUETAS — Screen: sucesso
   =====================================================
   Mostra o resultado após gerar etiqueta:
     - Código de rastreio (BR...BR)
     - Preview do PDF (iframe com data-uri base64)
     - Imprimir (window.print do iframe)
     - Baixar PDF
     - Nova etiqueta (volta pra /nova)

   Os dados vêm do Router.getSuccessData() (setados pela
   tela Nova antes de navegar). Se alguém acessar #/sucesso
   direto (recarregou a página, colou a URL), mostra mensagem
   amigável e oferece voltar para /nova.
   ===================================================== */

Screens.sucesso = (function () {

  function $(id) { return document.getElementById(id); }

  function showEmpty() {
    const codigoEl = $('successCodigo');
    if (codigoEl) codigoEl.textContent = '—';

    // Esconde preview e troca ações
    const iframe = $('pdfPreview');
    if (iframe) iframe.src = 'about:blank';

    // Mensagem de estado vazio
    const card = document.querySelector('.success-card');
    if (card) {
      const h = card.querySelector('.success-title');
      const p = card.querySelector('.success-sub');
      if (h) h.textContent = 'Nenhuma etiqueta ativa';
      if (p) p.textContent = 'Gere uma nova etiqueta ou consulte o histórico.';
    }

    // Remove preview vazio
    const prev = document.querySelector('.success-preview');
    if (prev) prev.style.display = 'none';

    const btnImp = $('btnImprimir');
    const btnDl  = $('btnBaixar');
    if (btnImp) btnImp.disabled = true;
    if (btnDl)  btnDl.disabled = true;
  }

  function base64ToBlob(base64, mimeType) {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/pdf' });
  }

  function isAbortError(err) {
    const msg = String((err && (err.name || err.message)) || '').toLowerCase();
    return msg.indexOf('abort') >= 0 || msg.indexOf('cancel') >= 0;
  }

  function getShareUrl(doc) {
    if (!doc) return '';
    return doc.driveDownloadUrl || doc.driveUrl || '';
  }

  function getWhatsappText(doc, label) {
    const url = getShareUrl(doc);
    if (!url) return '';
    return 'Olá! Segue ' + (label || 'o PDF') + ': ' + url;
  }

  function openWhatsappWithLink(doc, label) {
    const text = getWhatsappText(doc, label);
    if (!text) {
      UI.toast('Não encontrei um link público para compartilhar este PDF.', 'error');
      return;
    }
    const waUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
    window.open(waUrl, '_blank', 'noopener');
  }

  async function sharePdfOrWhatsapp(doc, label) {
    if (!doc) {
      UI.toast('PDF não disponível para compartilhamento.', 'error');
      return;
    }

    if (!doc.pdfBase64) {
      if (getShareUrl(doc)) openWhatsappWithLink(doc, label);
      else UI.toast('PDF não disponível para compartilhamento.', 'error');
      return;
    }

    const fileName = doc.pdfFileName || 'documento.pdf';

    try {
      if (navigator.share && window.File) {
        const blob = base64ToBlob(doc.pdfBase64, 'application/pdf');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const canShareFiles = !navigator.canShare || navigator.canShare({ files: [file] });

        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: label || fileName,
            text: label || 'PDF'
          });
          return;
        }
      }
    } catch (e) {
      if (isAbortError(e)) return;
    }

    openWhatsappWithLink(doc, label);
  }

  function printIframe_(iframe) {
    try {
      const w = iframe && iframe.contentWindow;
      if (w && w.print) {
        w.focus();
        w.print();
      } else {
        window.print();
      }
    } catch (e) {
      UI.toastError(e);
    }
  }

  async function enhanceCombinedPdf_(data) {
    if (!data || !data.pdfBase64 || !data.declaracao || !data.declaracao.pdfBase64) return;

    const iframe = $('pdfPreview');
    const btnImp = $('btnImprimir');
    const btnDl = $('btnBaixar');
    const subtitle = document.querySelector('.success-card .success-sub');
    const previous = {
      printHtml: btnImp ? btnImp.innerHTML : '',
      downloadHtml: btnDl ? btnDl.innerHTML : '',
      printDisabled: btnImp ? btnImp.disabled : false,
      downloadDisabled: btnDl ? btnDl.disabled : false,
      subtitle: subtitle ? subtitle.textContent : ''
    };

    if (btnImp) {
      btnImp.disabled = true;
      btnImp.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span>Preparando PDF completo...';
    }
    if (btnDl) btnDl.disabled = true;

    try {
      const pdfCompleto = await UI.mergeBase64Pdfs([data.pdfBase64, data.declaracao.pdfBase64]);
      const fileName = 'postagem_completa_' + (data.codigoObjeto || data.idPrePostagem || 'etiqueta') + '.pdf';

      if (iframe) UI.setIframeBase64Pdf(iframe, pdfCompleto);
      if (btnImp) {
        btnImp.disabled = false;
        btnImp.innerHTML = '<span class="material-symbols-rounded">print</span>Imprimir etiqueta + DACE';
        btnImp.onclick = () => printIframe_(iframe);
      }
      if (btnDl) {
        btnDl.disabled = false;
        btnDl.innerHTML = '<span class="material-symbols-rounded">download</span>Baixar PDF completo';
        btnDl.onclick = () => UI.downloadBase64Pdf(pdfCompleto, fileName);
      }
      if (subtitle) subtitle.textContent = 'Etiqueta e DACE prontos em um único PDF com 2 páginas.';
    } catch (e) {
      console.warn('Não foi possível montar PDF completo; mantendo PDFs individuais.', e);
      if (btnImp) {
        btnImp.disabled = previous.printDisabled;
        btnImp.innerHTML = previous.printHtml;
      }
      if (btnDl) {
        btnDl.disabled = previous.downloadDisabled;
        btnDl.innerHTML = previous.downloadHtml;
      }
      if (subtitle) subtitle.textContent = previous.subtitle;
      UI.toast('Não foi possível montar o PDF completo. Os botões individuais continuam disponíveis.', 'error');
    }
  }

  function mount() {
    const data = Router.getSuccessData();
    const mainPdfUrl = getShareUrl(data);
    if (!data || (!data.pdfBase64 && !mainPdfUrl)) {
      showEmpty();
      wireNovaButton();
      return;
    }

    // Código de rastreio
    $('successCodigo').textContent = data.codigoObjeto || data.idPrePostagem || '—';

    // Preview do PDF: usa Blob URL quando há base64. Se vier só link do Drive, mostra estado de link.
    const iframe = $('pdfPreview');
    const preview = document.querySelector('.success-preview');
    const card = document.querySelector('.success-card');
    if (data.pdfBase64) {
      if (preview) preview.style.display = '';
      if (iframe) UI.setIframeBase64Pdf(iframe, data.pdfBase64);
    } else {
      if (iframe) iframe.src = 'about:blank';
      if (preview) preview.style.display = 'none';
      if (card) {
        const h = card.querySelector('.success-title');
        const p = card.querySelector('.success-sub');
        if (h) h.textContent = 'PDF encontrado';
        if (p) p.textContent = 'O arquivo está disponível pelo Drive.';
      }
    }

    // Botões
    const btnImp = $('btnImprimir');
    const btnDl  = $('btnBaixar');
    const btnWa  = $('btnWhatsapp');

    if (btnImp) {
      btnImp.disabled = false;
      if (!data.pdfBase64 && mainPdfUrl) {
        btnImp.innerHTML = '<span class="material-symbols-rounded">open_in_new</span>Abrir PDF';
        btnImp.onclick = () => window.open(mainPdfUrl, '_blank', 'noopener');
      } else {
        btnImp.onclick = () => {
          try {
            const w = iframe && iframe.contentWindow;
            if (w && w.print) {
              w.focus();
              w.print();
            } else {
              window.print();
            }
          } catch (e) {
            UI.toastError(e);
          }
        };
      }
    }

    if (btnDl) {
      btnDl.disabled = false;
      btnDl.onclick = () => {
        const fileName = data.pdfFileName || ('etiqueta_' + (data.codigoObjeto || 'rotulo') + '.pdf');
        if (data.pdfBase64) UI.downloadBase64Pdf(data.pdfBase64, fileName);
        else if (mainPdfUrl) window.open(mainPdfUrl, '_blank', 'noopener');
      };
    }

    if (btnWa) {
      btnWa.disabled = false;
      btnWa.onclick = () => sharePdfOrWhatsapp({
        pdfBase64: data.pdfBase64 || '',
        pdfFileName: data.pdfFileName || ('etiqueta_' + (data.codigoObjeto || 'rotulo') + '.pdf'),
        driveUrl: data.driveUrl || '',
        driveDownloadUrl: data.driveDownloadUrl || ''
      }, 'a etiqueta de postagem');
    }

    // Se for DC e veio a declaração, mantém os botões individuais como fallback
    // e prepara também o PDF completo (etiqueta + DACE) para impressão em um clique.
    renderDeclaracao(data);
    enhanceCombinedPdf_(data);

    // No fluxo com NF-e não existe DACE: a NF substitui a DC-e.
    // Explicita isso na tela para que o PDF de 1 página não pareça incompleto.
    const tipoDocumento = String(data.tipoDocumento || '').toUpperCase();
    if (tipoDocumento === 'NF' && !data.declaracao) {
      const subtitle = document.querySelector('.success-card .success-sub');
      if (subtitle) subtitle.textContent = 'Etiqueta pronta. Esta postagem utiliza NF-e e, por isso, não possui DACE.';
    }

    // Se a declaração falhou mas o rótulo foi OK, avisa o usuário
    if (data.declaracaoErro) {
      const nomeDoc = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'DACE / DC-e' : 'documento da remessa';
      UI.toast('Atenção: rótulo OK, mas falhou ao gerar ' + nomeDoc + ': ' +
               data.declaracaoErro + ' — tente reimprimir pelo histórico.', 'error');
    }

    wireNovaButton();
  }

  function renderDeclaracao(data) {
    // Remove seção antiga se existir (re-render)
    const existente = document.getElementById('dcSection');
    if (existente) existente.remove();

    if (!data.declaracao || !data.declaracao.pdfBase64) return;

    const card = document.querySelector('.success-card');
    if (!card) return;

    const section = document.createElement('div');
    section.id = 'dcSection';
    section.className = 'success-dc-section';
    const tituloDoc = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'DACE / DC-e' : 'Documento da remessa';
    const labelImprimir = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'Imprimir DACE' : 'Imprimir documento';
    const labelBaixar = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'Baixar DACE' : 'Baixar documento';

    section.innerHTML =
      '<h3 class="success-dc-title">' +
        '<span class="material-symbols-rounded">inventory_2</span>' +
        tituloDoc +
      '</h3>' +
      '<div class="success-actions">' +
        '<button class="btn btn-ghost btn-block" id="btnImprimirDC">' +
          '<span class="material-symbols-rounded">print</span>' +
          labelImprimir +
        '</button>' +
        '<button class="btn btn-ghost btn-block" id="btnBaixarDC">' +
          '<span class="material-symbols-rounded">download</span>' +
          labelBaixar +
        '</button>' +
        '<button class="btn btn-whatsapp btn-block" id="btnWhatsappDC">' +
          '<span class="wa-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M19.05 4.94A9.77 9.77 0 0 0 12.09 2C6.66 2 2.24 6.4 2.24 11.83c0 1.74.46 3.43 1.33 4.91L2 22l5.43-1.51a9.8 9.8 0 0 0 4.66 1.19h.01c5.43 0 9.85-4.41 9.85-9.84 0-2.63-1.03-5.11-2.9-6.9Zm-6.96 15.08h-.01a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.22.9.86-3.14-.19-.32a8.16 8.16 0 0 1-1.25-4.32c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.21.84 5.74 2.38a8.06 8.06 0 0 1 2.38 5.74c0 4.48-3.65 8.13-8.14 8.13Zm4.46-6.08c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.95-1.22-.72-.64-1.2-1.44-1.34-1.68-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.79-.2-.47-.4-.41-.54-.42l-.46-.01c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.24 1.01.38 1.36.49.57.18 1.1.15 1.52.09.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/>' +
            '</svg>' +
          '</span>' +
          'Enviar por WhatsApp' +
        '</button>' +
      '</div>' +
      '<div class="success-preview">' +
        '<iframe id="pdfPreviewDC" title="Preview da declaração"></iframe>' +
      '</div>';

    // Insere antes do preview do rótulo se existir, senão no fim
    const previewRotulo = card.querySelector('.success-preview');
    if (previewRotulo) {
      card.insertBefore(section, previewRotulo);
    } else {
      card.appendChild(section);
    }

    // Preenche iframe e bind dos botões
    const iframeDc = document.getElementById('pdfPreviewDC');
    if (iframeDc) UI.setIframeBase64Pdf(iframeDc, data.declaracao.pdfBase64);

    document.getElementById('btnImprimirDC').addEventListener('click', () => {
      try {
        const w = iframeDc && iframeDc.contentWindow;
        if (w && w.print) { w.focus(); w.print(); }
      } catch (e) { UI.toastError(e); }
    });

    document.getElementById('btnBaixarDC').addEventListener('click', () => {
      const prefixo = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'dace_' : 'documento_';
      const fn = data.declaracao.pdfFileName || (prefixo + (data.codigoObjeto || 'doc') + '.pdf');
      UI.downloadBase64Pdf(data.declaracao.pdfBase64, fn);
    });

    document.getElementById('btnWhatsappDC').addEventListener('click', () => {
      const prefixo = (String(data.tipoDocumento || '').toUpperCase() === 'DC') ? 'dace_' : 'documento_';
      const fn = data.declaracao.pdfFileName || (prefixo + (data.codigoObjeto || 'doc') + '.pdf');
      sharePdfOrWhatsapp({
        pdfBase64: data.declaracao.pdfBase64,
        pdfFileName: fn,
        driveUrl: data.declaracao.driveUrl || '',
        driveDownloadUrl: data.declaracao.driveDownloadUrl || ''
      }, tituloDoc);
    });
  }

  function wireNovaButton() {
    const btnNova = $('btnNova');
    if (btnNova) {
      btnNova.onclick = () => {
        Router.setSuccessData(null);
        Router.navigate('/nova');
      };
    }
  }

  return { mount };
})();
