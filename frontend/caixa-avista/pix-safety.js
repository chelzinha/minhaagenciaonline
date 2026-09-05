'use strict';

(() => {
  const previousFetch = window.fetch.bind(window);
  const previousOpen = window.open.bind(window);

  function onlyDigits(value) {
    return /^\d+$/.test(value);
  }

  function isRepeatedDigits(value) {
    return /^(\d)\1+$/.test(value);
  }

  function isValidCpf(value) {
    const digits = String(value || '');
    if (!/^\d{11}$/.test(digits) || isRepeatedDigits(digits)) return false;

    let sum = 0;
    for (let index = 0; index < 9; index += 1) {
      sum += Number(digits[index]) * (10 - index);
    }

    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(digits[9])) return false;

    sum = 0;
    for (let index = 0; index < 10; index += 1) {
      sum += Number(digits[index]) * (11 - index);
    }

    check = (sum * 10) % 11;
    if (check === 10) check = 0;

    return check === Number(digits[10]);
  }

  function isValidCnpj(value) {
    const digits = String(value || '');
    if (!/^\d{14}$/.test(digits) || isRepeatedDigits(digits)) return false;

    const calculate = (base, weights) => {
      const sum = base
        .split('')
        .reduce(
          (total, digit, index) =>
            total + Number(digit) * weights[index],
          0
        );

      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    const first = calculate(
      digits.slice(0, 12),
      [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    );

    const second = calculate(
      digits.slice(0, 12) + String(first),
      [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    );

    return digits.slice(-2) === String(first) + String(second);
  }

  function isValidNumericDocumentKey(value) {
    const key = String(value == null ? '' : value).trim();

    if (!onlyDigits(key)) return true;
    if (key.length === 11) return isValidCpf(key);
    if (key.length === 14) return isValidCnpj(key);

    return false;
  }

  function validateLibraryResponse(payload) {
    const payments = payload?.library?.payments;
    if (!Array.isArray(payments)) return false;

    let changed = false;

    payments.forEach(payment => {
      const key = String(
        payment?.pixKey == null ? '' : payment.pixKey
      ).trim();

      if (!key || isValidNumericDocumentKey(key)) return;

      payment.pixKey = '';
      changed = true;

      console.error(
        '[CAIXA_PIX_SAFETY] Chave Pix numérica inválida na configuração. A cobrança foi bloqueada até a correção da planilha.',
        {
          paymentId: String(payment?.id || ''),
          unitId: String(payload?.library?.unit?.id || '')
        }
      );
    });

    return changed;
  }

  window.fetch = async function(input, init = {}) {
    const response = await previousFetch(input, init);

    try {
      const method = String(
        init?.method || input?.method || 'GET'
      ).toUpperCase();

      if (method !== 'POST' || !response.ok) return response;

      const clone = response.clone();
      const payload = await clone.json();

      if (!validateLibraryResponse(payload)) return response;

      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.set('content-type', 'application/json; charset=utf-8');

      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };

  function parseEmvFields(value) {
    const text = String(value || '');
    const fields = {};
    let offset = 0;

    while (offset + 4 <= text.length) {
      const id = text.slice(offset, offset + 2);
      const lengthText = text.slice(offset + 2, offset + 4);
      const length = Number(lengthText);

      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lengthText)) {
        break;
      }

      const start = offset + 4;
      const end = start + length;

      if (end > text.length) {
        break;
      }

      fields[id] = text.slice(start, end);
      offset = end;
    }

    return fields;
  }

  function extractPixTxid(code) {
    const topLevel = parseEmvFields(code);
    const additional = parseEmvFields(topLevel['62'] || '');
    const txid = String(additional['05'] || '')
      .trim()
      .toUpperCase();

    return /^[A-Z0-9]{1,25}$/.test(txid)
      ? txid
      : '';
  }

  function publicPixUrl(txid) {
    const host = String(window.location.hostname || '').toLowerCase();
    const useCurrentOrigin =
      host.endsWith('.pages.dev') ||
      host === 'localhost' ||
      host === '127.0.0.1';

    const origin = useCurrentOrigin
      ? window.location.origin
      : 'https://www.minhaagenciaonline.com.br';

    return (
      origin.replace(/\/$/, '') +
      '/pix/' +
      encodeURIComponent(txid)
    );
  }

  function formatPixMessage(message) {
    let output = String(message || '').replace(
      /Pix Copia e Cola:\r?\n(?!\r?\n)/,
      'Pix Copia e Cola:\n\n'
    );

    if (
      output.includes('🔗 Link direto para o seu Pix:')
    ) {
      return output;
    }

    const codeSection = output.split('Pix Copia e Cola:')[1] || '';
    const code = String(codeSection).trim();
    const txid = extractPixTxid(code);

    if (!txid) {
      return output;
    }

    const marker = '\n\nPix Copia e Cola:';

    if (!output.includes(marker)) {
      return output;
    }

    return output.replace(
      marker,
      [
        '',
        '',
        '🔗 Link direto para o seu Pix:',
        publicPixUrl(txid),
        '',
        'Pix Copia e Cola:'
      ].join('\n')
    );
  }

  function formatWhatsAppUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.hostname !== 'wa.me') return value;

      const message = url.searchParams.get('text');
      if (!message || !message.includes('Pix Copia e Cola:')) {
        return value;
      }

      url.searchParams.set(
        'text',
        formatPixMessage(message)
      );

      return url.toString();
    } catch (_) {
      return value;
    }
  }

  window.open = function(url, target, features) {
    return previousOpen(
      formatWhatsAppUrl(url),
      target,
      features
    );
  };

  try {
    if (navigator.clipboard?.writeText) {
      const previousWriteText =
        navigator.clipboard.writeText.bind(
          navigator.clipboard
        );

      navigator.clipboard.writeText = text =>
        previousWriteText(
          formatPixMessage(text)
        );
    }
  } catch (_) {
    // Alguns navegadores não permitem sobrescrever Clipboard.writeText.
  }

  window.CaixaPixSafety = Object.freeze({
    isValidNumericDocumentKey,
    isValidCpf,
    isValidCnpj,
    extractPixTxid,
    formatPixMessage
  });
})();
