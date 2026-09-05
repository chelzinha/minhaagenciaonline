'use strict';

(() => {
  const API_URL =
    'https://script.google.com/macros/s/AKfycbxH-9PPg_R5i5YGYuZOgizOK-_i9XssRvvoA21XFnxt0nZr9SF87jFysf4s3bhNVSIe/exec';

  const $ = id => document.getElementById(id);
  const money = cents =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format((Number(cents) || 0) / 100);

  let currentPayload = '';
  let refreshTimer = null;
  let loading = false;

  function txidFromLocation() {
    const pathParts = window.location.pathname
      .split('/')
      .filter(Boolean);

    const pixIndex = pathParts.findIndex(
      part => part.toLowerCase() === 'pix'
    );

    const fromPath =
      pixIndex >= 0
        ? pathParts[pixIndex + 1] || ''
        : '';

    const fromQuery =
      new URLSearchParams(window.location.search)
        .get('txid') || '';

    return String(fromPath || fromQuery)
      .trim()
      .toUpperCase();
  }

  function setVisible(id, visible) {
    $(id)?.classList.toggle('hidden', !visible);
  }

  function showError(message) {
    setVisible('loadingState', false);
    setVisible('contentState', false);
    setVisible('errorState', true);
    $('errorMessage').textContent =
      message || 'Confira o link recebido e tente novamente.';
  }

  async function requestPix(txid) {
    const url = new URL(API_URL);
    url.searchParams.set('action', 'publicPix');
    url.searchParams.set('txid', txid);
    url.searchParams.set('_', String(Date.now()));

    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error('Não foi possível consultar esta cobrança.');
    }

    const result = await response.json();

    if (!result?.ok) {
      throw new Error(
        result?.error ||
        'Cobrança Pix não encontrada.'
      );
    }

    return result;
  }

  function renderQr(payload) {
    const container = $('pixQr');
    container.innerHTML = '';

    if (!payload) return false;

    if (typeof window.QRCode !== 'function') {
      return false;
    }

    try {
      new window.QRCode(container, {
        text: payload,
        width: 270,
        height: 270,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      return true;
    } catch (error) {
      console.error('[PUBLIC_PIX_QR]', error);
      return false;
    }
  }

  function setStatus(status) {
    const pill = $('statusPill');
    const text = $('statusText');
    const icon = pill.querySelector('.material-symbols-rounded');

    pill.className = 'status-pill';

    if (status === 'PAGO') {
      pill.classList.add('paid');
      text.textContent = 'Pagamento recebido';
      icon.textContent = 'check_circle';
      return;
    }

    if (status === 'PENDENTE') {
      pill.classList.add('pending');
      text.textContent = 'Aguardando pagamento';
      icon.textContent = 'schedule';
      return;
    }

    pill.classList.add('unavailable');
    text.textContent =
      status === 'CANCELADO'
        ? 'Cobrança cancelada'
        : status === 'EXPIRADO'
          ? 'Cobrança expirada'
          : 'Cobrança indisponível';
    icon.textContent = 'block';
  }

  function renderFinished(status) {
    const icon = $('finishedIcon');
    const title = $('finishedTitle');
    const message = $('finishedMessage');

    if (status === 'PAGO') {
      icon.textContent = 'check_circle';
      title.textContent = 'Pagamento recebido';
      message.textContent = 'Você já pode fechar esta página.';
      return;
    }

    icon.textContent = 'info';
    title.textContent =
      status === 'CANCELADO'
        ? 'Cobrança cancelada'
        : status === 'EXPIRADO'
          ? 'Cobrança expirada'
          : 'Cobrança indisponível';
    message.textContent =
      'Não utilize um código antigo para realizar o pagamento.';
  }

  function render(result) {
    const status = String(result.status || 'ERRO').toUpperCase();
    const payable = status === 'PENDENTE' && result.payable === true;

    currentPayload = payable
      ? String(result.pixPayload || '')
      : '';

    setVisible('loadingState', false);
    setVisible('errorState', false);
    setVisible('contentState', true);

    $('amountValue').textContent = money(result.amountCents);
    $('receiverName').textContent =
      result.receiverName || 'AGUANAMBI SERV POSTAIS';
    $('txidValue').textContent = result.txid || '';

    setStatus(status);
    setVisible('paymentContent', payable);
    setVisible('finishedState', !payable);

    if (payable) {
      $('pixCode').textContent = currentPayload;

      if (!renderQr(currentPayload)) {
        $('qrWrap').classList.add('hidden');
      } else {
        $('qrWrap').classList.remove('hidden');
      }
    } else {
      renderFinished(status);
    }

    if (refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }

    if (status === 'PENDENTE') {
      refreshTimer = window.setInterval(
        () => load(false),
        15000
      );
    }
  }

  async function copyText(value) {
    const text = String(value || '');

    if (!text) {
      throw new Error('Código Pix indisponível.');
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand('copy');
    textarea.remove();

    if (!copied) {
      throw new Error('Não foi possível copiar o código Pix.');
    }
  }

  async function copyPix() {
    const feedback = $('copyFeedback');

    try {
      await copyText(currentPayload);
      feedback.textContent = 'Código Pix copiado ✓';

      window.setTimeout(() => {
        if (feedback.textContent === 'Código Pix copiado ✓') {
          feedback.textContent = '';
        }
      }, 3000);
    } catch (error) {
      feedback.textContent =
        error.message || 'Não foi possível copiar.';
    }
  }

  async function load(showInitialLoading = true) {
    if (loading) return;

    const txid = txidFromLocation();

    if (!/^[A-Z0-9]{1,25}$/.test(txid)) {
      showError('O link da cobrança Pix está incompleto ou inválido.');
      return;
    }

    loading = true;

    if (showInitialLoading) {
      setVisible('loadingState', true);
      setVisible('errorState', false);
      setVisible('contentState', false);
    }

    try {
      const result = await requestPix(txid);
      render(result);
    } catch (error) {
      if (showInitialLoading) {
        showError(
          error.message ||
          'Não foi possível consultar esta cobrança.'
        );
      } else {
        console.warn('[PUBLIC_PIX_REFRESH]', error);
      }
    } finally {
      loading = false;
    }
  }

  $('btnCopyIcon').addEventListener('click', copyPix);
  $('btnCopyPix').addEventListener('click', copyPix);

  window.addEventListener('beforeunload', () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
  });

  load(true);
})();
