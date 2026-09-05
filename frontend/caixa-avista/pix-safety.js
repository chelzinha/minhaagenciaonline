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
        .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
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

  function normalizeDocumentPixKey(value) {
    const key = String(value == null ? '' : value).trim();

    if (!key || !onlyDigits(key)) return key;
    if (key.length === 11 && isValidCpf(key)) return key;
    if (key.length === 14 && isValidCnpj(key)) return key;

    if (key.length < 11) {
      const cpf = key.padStart(11, '0');
      if (isValidCpf(cpf)) return cpf;
    }

    if (key.length < 14) {
      const cnpj = key.padStart(14, '0');
      if (isValidCnpj(cnpj)) return cnpj;
    }

    return key;
  }

  function normalizeLibraryResponse(payload) {
    const payments = payload?.library?.payments;
    if (!Array.isArray(payments)) return false;

    let changed = false;

    payments.forEach(payment => {
      const original = String(payment?.pixKey == null ? '' : payment.pixKey).trim();
      const normalized = normalizeDocumentPixKey(original);

      if (normalized && normalized !== original) {
        payment.pixKey = normalized;
        changed = true;
      }
    });

    if (changed) {
      console.info(
        '[CAIXA_PIX_SAFETY] Chave Pix documental normalizada para preservar zeros à esquerda.'
      );
    }

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

      if (!normalizeLibraryResponse(payload)) return response;

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

  function formatPixMessage(message) {
    return String(message || '').replace(
      /Pix Copia e Cola:\r?\n(?!\r?\n)/,
      'Pix Copia e Cola:\n\n'
    );
  }

  function formatWhatsAppUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.hostname !== 'wa.me') return value;

      const message = url.searchParams.get('text');
      if (!message || !message.includes('Pix Copia e Cola:')) return value;

      url.searchParams.set('text', formatPixMessage(message));
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
      const previousWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = text => previousWriteText(formatPixMessage(text));
    }
  } catch (_) {
    // Alguns navegadores não permitem sobrescrever Clipboard.writeText.
  }

  window.CaixaPixSafety = Object.freeze({
    normalizePixKey: normalizeDocumentPixKey,
    isValidCpf,
    isValidCnpj,
    formatPixMessage
  });
})();