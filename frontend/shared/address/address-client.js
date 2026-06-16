/*
  AGF Address Client
  Módulo reutilizável para qualquer front dentro de minhaagenciaonline.com.br.
  Depende apenas de window.fetch e window.AGF_ADDRESS_CONFIG.
*/
(function initAGFAddressClient(window) {
  "use strict";

  const DEFAULT_CONFIG = {
    serviceUrl: "",
    defaultUf: "CE",
    defaultCidade: "Fortaleza",
    timeoutMs: 12000,
    debounceMs: 280,
    minAddressChars: 3,
    maxResults: 12,
    appName: "AGF Consulta CEP"
  };

  const config = Object.assign({}, DEFAULT_CONFIG, window.AGF_ADDRESS_CONFIG || {});

  const UF_LIST = new Set([
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ]);

  function updateConfig(nextConfig) {
    Object.assign(config, nextConfig || {});
    return getConfig();
  }

  function getConfig() {
    return Object.assign({}, config);
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function stripAccents(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/[\t\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeUf(value) {
    const uf = stripAccents(value).trim().toUpperCase();
    return UF_LIST.has(uf) ? uf : "";
  }

  function normalizeCep(value) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return "";
    return digits;
  }

  function formatCep(value) {
    const cep = normalizeCep(value);
    if (!cep) return cleanText(value);
    return `${cep.slice(0, 5)}-${cep.slice(5)}`;
  }

  function detectInput(rawValue) {
    const q = cleanText(rawValue);
    const digits = onlyDigits(q);

    if (!q) {
      return { kind: "empty", q, normalized: "" };
    }

    if (digits.length === 8 && /^\D*\d[\d\D]*$/.test(q)) {
      return { kind: "cep", q, normalized: digits };
    }

    return { kind: "address", q, normalized: q };
  }

  function buildUrl(action, params) {
    if (!config.serviceUrl || config.serviceUrl.indexOf("http") !== 0) {
      throw new Error("CONFIG_MISSING_SERVICE_URL");
    }

    const url = new URL(config.serviceUrl);
    url.searchParams.set("action", action);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    return url.toString();
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), Number(config.timeoutMs) || 12000);

    try {
      const response = await window.fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error("INVALID_JSON_RESPONSE");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function lookup(rawValue, options) {
    const opts = Object.assign({}, options || {});
    const detected = detectInput(rawValue);

    if (detected.kind === "empty") {
      return {
        ok: false,
        type: "empty",
        input: "",
        message: "Digite um CEP ou endereço para consultar.",
        results: []
      };
    }

    if (detected.kind === "cep") {
      return lookupCep(detected.normalized, opts);
    }

    if (detected.normalized.length < Number(config.minAddressChars || 3)) {
      return {
        ok: false,
        type: "address",
        input: detected.normalized,
        message: "Digite pelo menos 3 letras do endereço.",
        results: []
      };
    }

    return lookupAddress(detected.normalized, opts);
  }

  async function lookupCep(cep, options) {
    const normalizedCep = normalizeCep(cep);
    if (!normalizedCep) {
      return {
        ok: false,
        type: "cep",
        input: cep,
        message: "CEP inválido. Digite 8 números.",
        results: []
      };
    }

    const url = buildUrl("cep", {
      cep: normalizedCep,
      maxResults: Number(config.maxResults) || 12,
      source: config.appName
    });

    return fetchJson(url);
  }

  async function lookupAddress(query, options) {
    const opts = Object.assign({}, options || {});
    const logradouro = cleanText(query);

    // Não enviamos UF/cidade como filtro obrigatório por padrão.
    // O backend faz a interpretação inteligente do texto livre e usa
    // defaultUf/defaultCidade apenas como preferência/fallback.
    const params = {
      q: logradouro,
      preferUf: normalizeUf(opts.preferUf || config.defaultUf),
      preferCidade: cleanText(opts.preferCidade || config.defaultCidade),
      maxResults: Number(config.maxResults) || 30,
      source: config.appName
    };

    if (opts.uf) params.uf = normalizeUf(opts.uf);
    if (opts.cidade) params.cidade = cleanText(opts.cidade);
    if (opts.numero) params.numero = cleanText(opts.numero);

    const url = buildUrl("endereco", params);

    return fetchJson(url);
  }

  function getRangeLabel(item) {
    if (!item) return "";
    const explicit = cleanText(item.faixaNumeroLabel || item.complemento || "").replace(/^[-–—]\s*/g, "");
    if (explicit) return explicit;

    const range = item.faixaNumero || null;
    if (!range) return "";

    const inicio = Number(range.inicio || 0);
    const fim = range.fim === null || range.fim === undefined ? null : Number(range.fim);

    if (inicio <= 0 && Number.isFinite(fim)) return `até ${fim}`;
    if (fim === null) return `de ${inicio} ao fim`;
    if (Number.isFinite(inicio) && Number.isFinite(fim)) return `de ${inicio} a ${fim}`;
    return "";
  }

  function formatLogradouroComNumero(item) {
    if (!item || !item.logradouro) return "";
    const numero = cleanText(item.numeroInformado || "");
    return numero ? `${item.logradouro}, ${numero}` : item.logradouro;
  }

  function resultToSingleLine(item) {
    if (!item) return "";

    const range = getRangeLabel(item);
    const main = [formatLogradouroComNumero(item), range ? `(${range})` : "", item.bairro].filter(Boolean).join(" - ");
    const city = [item.cidade, item.uf].filter(Boolean).join("/");
    const cep = item.cep ? `CEP ${formatCep(item.cep)}` : "";

    return [main, city, cep].filter(Boolean).join(" • ");
  }

  function resultToMultiline(item) {
    if (!item) return "";

    const parts = [];
    const range = getRangeLabel(item);
    if (item.logradouro) parts.push(formatLogradouroComNumero(item));
    if (range) parts.push(`Faixa: ${range}`);
    if (item.bairro) parts.push(item.bairro);
    if (item.cidade || item.uf) parts.push([item.cidade, item.uf].filter(Boolean).join("/"));
    if (item.cep) parts.push(`CEP ${formatCep(item.cep)}`);

    return parts.join("\n");
  }

  function copyText(text) {
    const value = String(text || "");
    if (!value) return Promise.resolve(false);

    if (window.navigator && window.navigator.clipboard && window.isSecureContext) {
      return window.navigator.clipboard.writeText(value).then(() => true);
    }

    const textarea = window.document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    window.document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = window.document.execCommand("copy");
    } finally {
      window.document.body.removeChild(textarea);
    }
    return Promise.resolve(copied);
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), wait);
    };
  }

  window.AGFAddress = {
    getConfig,
    updateConfig,
    lookup,
    lookupCep,
    lookupAddress,
    detectInput,
    normalizeCep,
    formatCep,
    formatLogradouroComNumero,
    getRangeLabel,
    resultToSingleLine,
    resultToMultiline,
    copyText,
    debounce
  };
})(window);
