'use strict';

(() => {
  const nativeOpen = window.open.bind(window);

  function normalizePixMessage(message) {
    let output = String(message || '').replace(
      /(?:🔗\s*)?Link direto para o seu Pix:/g,
      'Link direto para o seu Pix:'
    );

    output = output.replace(
      /https:\/\/([^\s/]+)\/pix\/([A-Z0-9]{1,25})(?=\s|$)/g,
      (_match, host, txid) =>
        'https://' +
        host +
        '/pix/?txid=' +
        encodeURIComponent(txid)
    );

    return output;
  }

  function normalizeWhatsAppUrl(value) {
    try {
      const url = new URL(String(value || ''));

      if (url.hostname !== 'wa.me') {
        return value;
      }

      const message = url.searchParams.get('text');

      if (!message) {
        return value;
      }

      const normalized = normalizePixMessage(message);

      if (normalized === message) {
        return value;
      }

      url.searchParams.set('text', normalized);
      return url.toString();
    } catch (_) {
      return value;
    }
  }

  window.open = function(url, target, features) {
    return nativeOpen(
      normalizeWhatsAppUrl(url),
      target,
      features
    );
  };

  try {
    if (navigator.clipboard?.writeText) {
      const nativeWriteText =
        navigator.clipboard.writeText.bind(
          navigator.clipboard
        );

      navigator.clipboard.writeText = text =>
        nativeWriteText(
          normalizePixMessage(text)
        );
    }
  } catch (_) {
    // Alguns navegadores não permitem sobrescrever Clipboard.writeText.
  }

  window.CaixaPixMessageLinkFix = Object.freeze({
    normalizePixMessage,
    normalizeWhatsAppUrl
  });
})();
