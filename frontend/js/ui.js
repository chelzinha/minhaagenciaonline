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

  function fmtMoneyInput(value) {
    const digits = String(value == null ? '' : value).replace(/\D/g, '');
    if (!digits) return '';
    const cents = (parseInt(digits, 10) / 100).toFixed(2);
    const parts = cents.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts[0] + ',' + parts[1];
  }
  function parseMoneyInput(value) {
    if (value == null || value === '') return 0;
    const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(normalized);
    return isFinite(n) ? n : 0;
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

  // ============ PDF DOWNLOAD / PREVIEW ============
  function normalizeBase64Pdf(base64) {
    return String(base64 || '')
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s/g, '');
  }

  function base64ToPdfBlob(base64) {
    const clean = normalizeBase64Pdf(base64);
    if (!clean) throw new Error('PDF vazio ou inválido.');

    const byteChars = atob(clean);
    const sliceSize = 1024;
    const slices = [];
    for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
      const slice = byteChars.slice(offset, offset + sliceSize);
      const bytes = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i++) bytes[i] = slice.charCodeAt(i);
      slices.push(bytes);
    }
    return new Blob(slices, { type: 'application/pdf' });
  }

  function createPdfObjectUrl(base64) {
    return URL.createObjectURL(base64ToPdfBlob(base64));
  }

  function downloadBase64Pdf(base64, filename) {
    const link = document.createElement('a');
    let url = '';
    try {
      url = createPdfObjectUrl(base64);
      link.href = url;
    } catch (e) {
      // Fallback antigo caso o navegador não aceite Blob URL.
      link.href = 'data:application/pdf;base64,' + normalizeBase64Pdf(base64);
    }
    link.download = filename || 'etiqueta.pdf';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      if (url) URL.revokeObjectURL(url);
    }, 1000);
  }

  function setIframeBase64Pdf(iframe, base64) {
    if (!iframe) return;
    try {
      if (iframe._pdfObjectUrl) URL.revokeObjectURL(iframe._pdfObjectUrl);
      iframe._pdfObjectUrl = createPdfObjectUrl(base64);
      iframe.src = iframe._pdfObjectUrl;
    } catch (e) {
      iframe.src = 'data:application/pdf;base64,' + normalizeBase64Pdf(base64);
    }
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
    fmtCep, fmtCpfCnpj, fmtPhone, fmtMoney, fmtMoneyInput, parseMoneyInput,
    digitsOnly, escapeHtml, joinNonEmpty,
    bindMask, bindSegmented,
    downloadBase64Pdf, setIframeBase64Pdf
  };
})();