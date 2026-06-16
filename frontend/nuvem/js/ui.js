/* =====================================================
   APP ETIQUETAS — UI Helpers
   Toast, modal, loading, formatadores comuns.
   ===================================================== */

const UI = (function () {

  // ============ LOADING ============
  let _loadingCount = 0;
  function setBusyState(isBusy) {
    document.body.classList.toggle('is-busy', !!isBusy);
  }
  function showLoading(text) {
    _loadingCount++;
    const el = document.getElementById('loading');
    document.getElementById('loadingText').textContent = text || 'Processando...';
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    setBusyState(true);
  }
  function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1);
    if (_loadingCount === 0) {
      const el = document.getElementById('loading');
      el.classList.remove('show');
      el.setAttribute('aria-hidden', 'true');
      setBusyState(false);
    }
  }
  function forceHideLoading() {
    _loadingCount = 0;
    const el = document.getElementById('loading');
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    setBusyState(false);
  }

  // ============ TOAST ============
  let _toastTimer = null;
  function toast(message, type) {
    const el = document.getElementById('toast');
    el.textContent = message || '';
    el.className = 'toast show';
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    if (type === 'error') el.classList.add('toast-error');
    else if (type === 'success') el.classList.add('toast-success');

    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'),
                             APP_CONFIG.TOAST_DURATION_MS);
  }
  function toastError(err) {
    const msg = err && err.message ? err.message : String(err || 'Erro inesperado');
    toast(msg, 'error');
  }

  // ============ MODAL CONFIRM ============
  function confirm(opts) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal');
      const modalCard = modal.querySelector('.modal-card');
      const btnConfirm = document.getElementById('modalConfirm');
      const btnCancel = document.getElementById('modalCancel');
      const previousFocus = document.activeElement;

      document.getElementById('modalTitle').textContent = opts.title || 'Confirmar';
      document.getElementById('modalBody').textContent = opts.body || '';
      btnConfirm.textContent = opts.confirmText || 'Confirmar';
      btnCancel.textContent = opts.cancelText || 'Cancelar';

      if (opts.danger) {
        btnConfirm.classList.remove('btn-primary');
        btnConfirm.classList.add('btn-danger');
      } else {
        btnConfirm.classList.add('btn-primary');
        btnConfirm.classList.remove('btn-danger');
      }

      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');

      setTimeout(() => {
        try { modalCard.focus(); } catch (e) {}
      }, 0);

      function close(result) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        btnConfirm.removeEventListener('click', onYes);
        btnCancel.removeEventListener('click', onNo);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeyDown);
        try {
          if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
        } catch (e) {}
        resolve(result);
      }
      function onYes() { close(true); }
      function onNo() { close(false); }
      function onBackdrop(e) { if (e.target === modal) close(false); }
      function onKeyDown(e) {
        if (e.key === 'Escape') close(false);
      }

      btnConfirm.addEventListener('click', onYes);
      btnCancel.addEventListener('click', onNo);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeyDown);
    });
  }

  // ============ FORMATADORES ============
  function fmtCep(value) {
    const d = (value || '').toString().replace(/\D/g, '').slice(0, 8);
    return d.length <= 5 ? d : d.slice(0, 5) + '-' + d.slice(5);
  }
  function fmtCpfCnpj(value) {
    const d = (value || '').toString().replace(/\D/g, '');
    if (d.length <= 11) {
      // CPF
      return d.replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2}).*/,
        function (_, a, b, c, dd) {
          let s = a;
          if (b) s += '.' + b;
          if (c) s += '.' + c;
          if (dd) s += '-' + dd;
          return s;
        });
    }
    // CNPJ
    return d.replace(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*/,
      function (_, a, b, c, dd, e) {
        let s = a;
        if (b) s += '.' + b;
        if (c) s += '.' + c;
        if (dd) s += '/' + dd;
        if (e) s += '-' + e;
        return s;
      });
  }
  function fmtPhone(value) {
    const d = (value || '').toString().replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function fmtMoney(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function fmtDateTimeBr(value) {
    if (!value) return '';
    const dt = new Date(value);
    if (isNaN(dt.getTime())) {
      const s = String(value).replace('T', ' ').replace(/\+0000$/, '').slice(0, 16);
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}:\d{2})$/);
      return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(value);
    }
    const pad = n => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  function digitsOnly(v) {
    return (v || '').toString().replace(/\D/g, '');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function joinNonEmpty(arr, sep) {
    return (arr || []).filter(x => x != null && String(x).trim() !== '').join(sep || ', ');
  }

  // ============ AUTO-MASK INPUTS ============
  function bindMask(input, formatter) {
    if (!input) return;
    input.addEventListener('input', () => {
      const start = input.selectionStart;
      const before = input.value;
      const after = formatter(before);
      if (after !== before) {
        input.value = after;
        const diff = after.length - before.length;
        try { input.setSelectionRange(start + diff, start + diff); } catch (e) {}
      }
    });
  }

  // ============ PDF DOWNLOAD ============
  function downloadBase64Pdf(base64, filename) {
    const link = document.createElement('a');
    link.href = 'data:application/pdf;base64,' + base64;
    link.download = filename || 'etiqueta.pdf';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 100);
  }

  function setIframeBase64Pdf(iframe, base64) {
    iframe.src = 'data:application/pdf;base64,' + base64;
  }

  // ============ FORM SEGMENTED CONTROL ============
  function bindSegmented(form) {
    form.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('input[type="radio"]').forEach(input => {
        input.addEventListener('change', () => {
          const name = input.name;
          form.querySelectorAll('input[type="radio"][name="' + name + '"]').forEach(r => {
            r.closest('.seg-item').classList.toggle('is-selected', r.checked);
          });
        });
      });
    });
  }

  return {
    showLoading, hideLoading, forceHideLoading,
    toast, toastError,
    confirm,
    fmtCep, fmtCpfCnpj, fmtPhone, fmtMoney, fmtDateTimeBr,
    digitsOnly, escapeHtml, joinNonEmpty,
    bindMask, bindSegmented,
    downloadBase64Pdf, setIframeBase64Pdf
  };
})();

UI.mergeAndDownloadPdfs = async function(docs, filename) {
  if (!docs || !docs.length) throw new Error('Nenhum PDF disponível para exportar.');
  const merged = await PDFLib.PDFDocument.create();
  for (const doc of docs) {
    const src = await PDFLib.PDFDocument.load(UI.base64ToUint8Array(doc.pdfBase64));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  const bytes = await merged.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'documentos.pdf';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 300);
};
UI.base64ToUint8Array = function(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
UI.downloadHtmlFile = function(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename || 'arquivo.html';
  document.body.appendChild(link); link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 300);
};
UI.openPrintHtml = function(html) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Não foi possível abrir a janela de impressão.');
  win.document.open(); win.document.write(html); win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
};
