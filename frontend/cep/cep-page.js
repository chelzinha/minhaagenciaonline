(function initCepPage(window, document) {
  "use strict";

  const PAGE_SIZE = 6;

  const dom = {
    form: document.getElementById("cep-form"),
    query: document.getElementById("cep-query"),
    submit: document.getElementById("cep-submit"),
    status: document.getElementById("cep-status"),
    results: document.getElementById("cep-results")
  };

  const state = {
    loading: false,
    lastPayload: null,
    lastResults: [],
    selectedIndex: null,
    page: 1
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    dom.submit.disabled = isLoading;
    dom.submit.innerHTML = isLoading
      ? '<span class="agf-address-loader" aria-hidden="true"></span>Consultando'
      : '<span class="material-symbols-rounded" aria-hidden="true">search</span>Consultar';
  }

  function setStatus(message, type) {
    const safeMessage = escapeHtml(message || "");
    if (!safeMessage) {
      dom.status.innerHTML = "";
      return;
    }

    const icon = type === "error" ? "error" : type === "success" ? "check_circle" : "info";
    dom.status.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span>${safeMessage}</span>`;
  }

  function renderEmpty(message, error) {
    state.lastPayload = null;
    state.lastResults = [];
    state.selectedIndex = null;
    state.page = 1;
    dom.results.innerHTML = `<div class="${error ? "agf-address-error" : "agf-address-empty"}">${escapeHtml(message)}</div>`;
  }

  function resultTitle(item) {
    return window.AGFAddress.formatLogradouroComNumero(item) || item.cidade || "Endereço encontrado";
  }

  function rangeLabel(item) {
    if (!item) return "";
    if (window.AGFAddress && typeof window.AGFAddress.getRangeLabel === "function") {
      return window.AGFAddress.getRangeLabel(item);
    }
    return String(item.faixaNumeroLabel || item.complemento || "").replace(/^[-–—]\s*/g, "").trim();
  }

  function resultSubtitle(item) {
    const parts = [];
    const range = rangeLabel(item);
    if (range) parts.push(range);
    if (item.bairro) parts.push(item.bairro);
    if (item.cidade || item.uf) parts.push([item.cidade, item.uf].filter(Boolean).join("/"));
    if (item.cep) parts.push(`CEP ${window.AGFAddress.formatCep(item.cep)}`);
    return parts.join(" • ");
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(state.lastResults.length / PAGE_SIZE));
  }

  function clampPage(page) {
    const totalPages = getTotalPages();
    return Math.min(Math.max(Number(page) || 1, 1), totalPages);
  }

  function getPageItems() {
    state.page = clampPage(state.page);
    const start = (state.page - 1) * PAGE_SIZE;
    return state.lastResults.slice(start, start + PAGE_SIZE).map((item, offset) => ({
      item,
      index: start + offset
    }));
  }

  function renderSelectedPanel() {
    const selected = state.lastResults[Number(state.selectedIndex)];
    if (!selected) return "";

    const title = resultTitle(selected);
    const subtitle = resultSubtitle(selected);
    const multiline = window.AGFAddress.resultToMultiline(selected);

    return `
      <section class="agf-address-selected-panel" aria-label="Endereço selecionado">
        <div class="agf-address-selected-head">
          <div>
            <div class="agf-address-selected-label">
              <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
              Endereço selecionado
            </div>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <button class="agf-address-mini-button agf-address-mini-button-primary" type="button" data-copy="all" data-index="${state.selectedIndex}">
            <span class="material-symbols-rounded" aria-hidden="true">content_copy</span>
            Copiar selecionado
          </button>
        </div>
        <pre class="agf-address-selected-copy">${escapeHtml(multiline)}</pre>
      </section>
    `;
  }

  function renderCards() {
    return getPageItems().map(({ item, index }) => {
      const title = resultTitle(item);
      const subtitle = resultSubtitle(item);
      const isSelected = Number(state.selectedIndex) === index;

      return `
        <article class="agf-address-result-card${isSelected ? " is-selected" : ""}${item.numeroDentroDaFaixa ? " is-number-match" : ""}" data-result-index="${index}">
          <div class="agf-address-result-main">
            <div class="agf-address-result-title">
              <span class="material-symbols-rounded" aria-hidden="true">location_on</span>
              <span>${escapeHtml(title)}</span>
            </div>
            <div class="agf-address-result-body">${escapeHtml(subtitle)}</div>
            ${item.numeroDentroDaFaixa ? '<div class="agf-address-range-match"><span class="material-symbols-rounded" aria-hidden="true">verified</span>Número dentro desta faixa de CEP</div>' : ''}
          </div>
          <div class="agf-address-result-actions">
            <button class="agf-address-mini-button agf-address-mini-button-primary${isSelected ? " is-current-selection" : ""}" type="button" data-select="${index}" aria-pressed="${isSelected ? "true" : "false"}">
              <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
              ${isSelected ? "Selecionado" : "Selecionar"}
            </button>
            <button class="agf-address-mini-button" type="button" data-copy="all" data-index="${index}">
              <span class="material-symbols-rounded" aria-hidden="true">content_copy</span>
              Copiar tudo
            </button>
            <button class="agf-address-mini-button" type="button" data-copy="cep" data-index="${index}">
              <span class="material-symbols-rounded" aria-hidden="true">tag</span>
              Copiar CEP
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderPagination() {
    const total = state.lastResults.length;
    const totalPages = getTotalPages();
    if (totalPages <= 1) return "";

    const pageButtons = Array.from({ length: totalPages }, (_, i) => {
      const page = i + 1;
      return `
        <button class="agf-address-page-button${page === state.page ? " is-active" : ""}" type="button" data-page="${page}" aria-current="${page === state.page ? "page" : "false"}">
          ${page}
        </button>
      `;
    }).join("");

    const start = (state.page - 1) * PAGE_SIZE + 1;
    const end = Math.min(state.page * PAGE_SIZE, total);

    return `
      <nav class="agf-address-pagination" aria-label="Paginação dos resultados">
        <div class="agf-address-page-summary">${start}-${end} de ${total}</div>
        <div class="agf-address-page-controls">
          <button class="agf-address-page-nav" type="button" data-page-prev ${state.page === 1 ? "disabled" : ""}>
            <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
            Anterior
          </button>
          <div class="agf-address-page-numbers">${pageButtons}</div>
          <button class="agf-address-page-nav" type="button" data-page-next ${state.page === totalPages ? "disabled" : ""}>
            Próxima
            <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </nav>
    `;
  }

  function renderResults(payload) {
    const results = Array.isArray(payload.results) ? payload.results : [];
    state.lastPayload = payload;
    state.lastResults = results;
    state.page = clampPage(state.page);

    if (!payload.ok || !results.length) {
      renderEmpty(payload.message || "Nenhum endereço encontrado para essa consulta.", !payload.ok);
      return;
    }

    if (state.selectedIndex !== null && !results[Number(state.selectedIndex)]) {
      state.selectedIndex = null;
    }

    dom.results.innerHTML = `${renderSelectedPanel()}${renderPagination()}${renderCards()}${renderPagination()}`;

    const provider = payload.provider ? ` via ${payload.provider}` : "";
    const message = payload.message || `${results.length} resultado(s) encontrado(s)${provider}.`;
    setStatus(message, "success");
  }

  function rerenderAfterPagination() {
    renderResults(state.lastPayload || { ok: true, results: state.lastResults });
    const resultsTop = dom.results.querySelector(".agf-address-pagination") || dom.results.firstElementChild;
    if (resultsTop) {
      resultsTop.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function selectResult(index) {
    const numericIndex = Number(index);
    if (!state.lastResults[numericIndex]) return;
    state.selectedIndex = numericIndex;
    renderResults(state.lastPayload || { ok: true, results: state.lastResults });

    const selectedPanel = dom.results.querySelector(".agf-address-selected-panel");
    if (selectedPanel) {
      selectedPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  async function copyResult(index, mode, button) {
    const item = state.lastResults[Number(index)];
    if (!item) return;

    const text = mode === "cep"
      ? window.AGFAddress.formatCep(item.cep)
      : window.AGFAddress.resultToMultiline(item);

    const ok = await window.AGFAddress.copyText(text);
    const original = button.innerHTML;

    button.innerHTML = ok
      ? '<span class="material-symbols-rounded" aria-hidden="true">done</span>Copiado'
      : '<span class="material-symbols-rounded" aria-hidden="true">error</span>Não copiou';

    window.setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (state.loading) return;

    const query = dom.query.value.trim();
    setLoading(true);
    setStatus("Consultando base de endereços...", "info");
    state.selectedIndex = null;
    state.page = 1;
    dom.results.innerHTML = "";

    try {
      const payload = await window.AGFAddress.lookup(query);
      renderResults(payload);
    } catch (error) {
      const message = error && error.message === "CONFIG_MISSING_SERVICE_URL"
        ? "O endereço do backend ainda não foi configurado. Cole a URL do Web App em /shared/address/address-config.js."
        : "Não foi possível consultar agora. Verifique sua conexão ou tente novamente.";

      setStatus(message, "error");
      renderEmpty(message, true);
      console.error("[AGF CEP] Erro na consulta", error);
    } finally {
      setLoading(false);
    }
  }

  function bindEvents() {
    dom.form.addEventListener("submit", handleSubmit);

    dom.results.addEventListener("click", (event) => {
      const selectButton = event.target.closest("[data-select]");
      if (selectButton) {
        selectResult(selectButton.dataset.select);
        return;
      }

      const copyButton = event.target.closest("[data-copy]");
      if (copyButton) {
        copyResult(copyButton.dataset.index, copyButton.dataset.copy, copyButton);
        return;
      }

      const pageButton = event.target.closest("[data-page]");
      if (pageButton) {
        state.page = clampPage(pageButton.dataset.page);
        rerenderAfterPagination();
        return;
      }

      const prevButton = event.target.closest("[data-page-prev]");
      if (prevButton) {
        state.page = clampPage(state.page - 1);
        rerenderAfterPagination();
        return;
      }

      const nextButton = event.target.closest("[data-page-next]");
      if (nextButton) {
        state.page = clampPage(state.page + 1);
        rerenderAfterPagination();
      }
    });

    dom.query.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dom.query.value = "";
        dom.results.innerHTML = "";
        state.lastPayload = null;
        state.lastResults = [];
        state.selectedIndex = null;
        state.page = 1;
        setStatus("", "info");
      }
    });
  }

  function init() {
    bindEvents();
    dom.query.focus();
  }

  init();
})(window, document);
