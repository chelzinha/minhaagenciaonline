window.AGF_CADASTROS_CONFIG = Object.freeze({
  apiUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787'
    : 'https://agf-cadastros-api.chelzinha.workers.dev'
});
