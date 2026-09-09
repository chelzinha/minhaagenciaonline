import { analyzeShipments, formatCurrency } from "./engine.js";
import { parseCsv, readCsvFile, validateCsvHeaders } from "./csv.js";

const config = window.AGFCOMPARADOR_CONFIG || {};
const state = {
  tariffData: null,
  tariffSource: "",
  csvRows: [],
  csvName: "",
  analysis: null,
};

const elements = {
  baseStatus: document.querySelector("#baseStatus"),
  originLabel: document.querySelector("#originLabel"),
  validityLabel: document.querySelector("#validityLabel"),
  classificationLabel: document.querySelector("#classificationLabel"),
  clientName: document.querySelector("#clientName"),
  analystName: document.querySelector("#analystName"),
  includeDeclared: document.querySelector("#includeDeclared"),
  csvFile: document.querySelector("#csvFile"),
  dropZone: document.querySelector("#dropZone"),
  fileHelp: document.querySelector("#fileHelp"),
  sampleButton: document.querySelector("#sampleButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  validationBox: document.querySelector("#validationBox"),
  resultsSection: document.querySelector("#resultsSection"),
  resultsTitle: document.querySelector("#resultsTitle"),
  analysisMeta: document.querySelector("#analysisMeta"),
  summaryGrid: document.querySelector("#summaryGrid"),
  comparisonBars: document.querySelector("#comparisonBars"),
  opportunityPanel: document.querySelector("#opportunityPanel"),
  miniDonut: document.querySelector("#miniDonut"),
  miniDonutValue: document.querySelector("#miniDonutValue"),
  miniLegend: document.querySelector("#miniLegend"),
  serviceChart: document.querySelector("#serviceChart"),
  destinationChart: document.querySelector("#destinationChart"),
  savingsChart: document.querySelector("#savingsChart"),
  insightsList: document.querySelector("#insightsList"),
  resultsBody: document.querySelector("#resultsBody"),
  tableCount: document.querySelector("#tableCount"),
  searchFilter: document.querySelector("#searchFilter"),
  serviceFilter: document.querySelector("#serviceFilter"),
  savingsFilter: document.querySelector("#savingsFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  criteriaList: document.querySelector("#criteriaList"),
  exportButton: document.querySelector("#exportButton"),
  printButton: document.querySelector("#printButton"),
  printReportButton: document.querySelector("#printReportButton"),
  printClientName: document.querySelector("#printClientName"),
  printMeta: document.querySelector("#printMeta"),
  baseDialog: document.querySelector("#baseDialog"),
  openBaseButton: document.querySelector("#openBaseButton"),
  closeBaseButton: document.querySelector("#closeBaseButton"),
  reloadBaseButton: document.querySelector("#reloadBaseButton"),
  openSpreadsheetLink: document.querySelector("#openSpreadsheetLink"),
  baseSourceLabel: document.querySelector("#baseSourceLabel"),
  baseVersionLabel: document.querySelector("#baseVersionLabel"),
  toast: document.querySelector("#toast"),
};

const KPI_ICONS = {
  shipments: "i-package",
  current: "i-wallet",
  avista: "i-tag",
  app: "i-mobile",
  platinum: "i-crown",
  savings: "i-trend",
};

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function formatDateIso(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatPercent(value) {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safe.toFixed(2).replace(".", ",")}%`;
}

function countLabel(value, singular, plural) {
  return `${value} ${value === 1 ? singular : plural}`;
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3400);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar a base: HTTP ${response.status}`);
  return response.json();
}

function validateTariffData(data) {
  const required = ["pac_avista", "sedex_avista", "pac_app", "sedex_app", "pac_platinum", "sedex_platinum", "mini_platinum"];
  const missing = required.filter((key) => !data?.tarifas?.[key]);
  if (missing.length) throw new Error(`Base incompleta. Abas ausentes: ${missing.join(", ")}`);
  return data;
}

async function loadTariffData(force = false) {
  elements.baseStatus.textContent = "Carregando base tarifária...";
  const apiUrl = String(config.tariffApiUrl || "").trim();

  if (apiUrl) {
    try {
      const separator = apiUrl.includes("?") ? "&" : "?";
      const liveData = await fetchJson(`${apiUrl}${separator}action=tarifas&t=${force ? Date.now() : ""}`);
      state.tariffData = validateTariffData(liveData);
      state.tariffSource = "Google Sheets via Apps Script";
      updateBaseUi();
      return;
    } catch (error) {
      console.error("Falha na base ao vivo. Usando base incorporada.", error);
      showToast("A base ao vivo não respondeu. A versão incorporada foi utilizada.");
    }
  }

  state.tariffData = validateTariffData(await fetchJson(config.defaultTariffUrl || "./data/tarifas.json"));
  state.tariffSource = "Base incorporada ao aplicativo";
  updateBaseUi();
}

function updateBaseUi() {
  const meta = state.tariffData.meta;
  elements.baseStatus.textContent = `${state.tariffSource} · versão ${meta.versao}`;
  elements.originLabel.textContent = `${meta.origem.cidade}/${meta.origem.uf} · CEP ${meta.origem.cep}`;
  elements.validityLabel.textContent = formatDateIso(meta.vigencia);
  elements.classificationLabel.textContent = meta.classificacaoCidades;
  elements.baseSourceLabel.textContent = state.tariffSource;
  elements.baseVersionLabel.textContent = `Versão ${meta.versao} · vigência ${formatDateIso(meta.vigencia)}`;
  elements.openSpreadsheetLink.href = config.spreadsheetUrl || "#";
  elements.analyzeButton.disabled = !state.csvRows.length;
}

function showValidation(message, type = "success", details = []) {
  elements.validationBox.hidden = false;
  elements.validationBox.className = `validation-box${type === "error" ? " error" : ""}`;
  const marker = type === "error" ? icon("i-alert") : icon("i-check");
  elements.validationBox.innerHTML = `<strong>${marker} ${escapeHtml(message)}</strong>${details.length ? `<ul>${details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}`;
}

function acceptCsv(parsed, filename) {
  const validation = validateCsvHeaders(parsed.headers);
  state.csvRows = parsed.rows;
  state.csvName = filename;
  elements.fileHelp.textContent = `${filename} · ${countLabel(parsed.rows.length, "postagem", "postagens")} · separador ${parsed.delimiter === ";" ? "ponto e vírgula" : parsed.delimiter}`;

  if (!validation.valid) {
    elements.analyzeButton.disabled = true;
    showValidation("O CSV não possui todas as colunas necessárias.", "error", validation.missing.map((header) => `Coluna ausente: ${header}`));
    return;
  }

  const emptyRows = parsed.rows.filter((row) => !row.SERVICO && !row.OBJETO).length;
  const details = [
    `${parsed.rows.length} linhas prontas para análise.`,
    emptyRows ? `${emptyRows} linhas vazias serão ignoradas.` : "Nenhuma linha vazia foi identificada.",
  ];
  showValidation("Arquivo validado e pronto para análise.", "success", details);
  elements.analyzeButton.disabled = !state.tariffData || parsed.rows.length === 0;
}

async function handleCsvFile(file) {
  try {
    if (!file) return;
    const parsed = await readCsvFile(file);
    acceptCsv(parsed, file.name);
  } catch (error) {
    console.error(error);
    showValidation("Não foi possível ler o CSV.", "error", [error.message]);
  }
}

function summaryCard({ label, value, note, iconName, className = "" }) {
  return `
    <article class="summary-card ${className}">
      <div class="summary-card-top">
        <span class="kpi-label">${escapeHtml(label)}</span>
        <span class="kpi-icon">${icon(iconName)}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function renderSummary(summary) {
  elements.summaryGrid.innerHTML = [
    summaryCard({
      label: "Postagens analisadas",
      value: String(summary.count),
      note: `${summary.calculated} calculadas · ${summary.review} para revisar`,
      iconName: KPI_ICONS.shipments,
    }),
    summaryCard({
      label: "Valor atual informado",
      value: formatCurrency(summary.original),
      note: "Total registrado no CSV",
      iconName: KPI_ICONS.current,
      className: "current",
    }),
    summaryCard({
      label: "Simulação à vista",
      value: formatCurrency(summary.avista),
      note: `${summary.coverage.avista} objetos com cobertura`,
      iconName: KPI_ICONS.avista,
    }),
    summaryCard({
      label: "APP Correios",
      value: formatCurrency(summary.app),
      note: `${summary.coverage.app} objetos com cobertura`,
      iconName: KPI_ICONS.app,
      className: "app",
    }),
    summaryCard({
      label: "Contrato Platinum",
      value: formatCurrency(summary.platinum),
      note: `${summary.coverage.platinum} objetos com cobertura`,
      iconName: KPI_ICONS.platinum,
      className: "highlight",
    }),
    summaryCard({
      label: "Economia potencial",
      value: formatCurrency(summary.savings),
      note: `${formatPercent(summary.savingsPct)} sobre o valor atual`,
      iconName: KPI_ICONS.savings,
      className: "savings",
    }),
  ].join("");
}

function renderBars(summary) {
  const scenarios = [
    { label: "Valor atual", value: summary.original, className: "current" },
    { label: "À vista", value: summary.avista, className: "avista" },
    { label: "APP Correios", value: summary.app, className: "app" },
    { label: "Platinum", value: summary.platinum, className: "platinum" },
    { label: "Melhor contrato", value: summary.bestContract, className: "best" },
  ];
  const max = Math.max(...scenarios.map((item) => Number(item.value) || 0), 1);
  elements.comparisonBars.innerHTML = scenarios.map((item) => {
    const width = Math.max(1.5, ((Number(item.value) || 0) / max) * 100);
    return `
      <div class="comparison-row ${item.className}">
        <span class="label">${escapeHtml(item.label)}</span>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${width}%"></div></div>
        <span class="value">${formatCurrency(item.value)}</span>
      </div>
    `;
  }).join("");
}

function renderOpportunity(summary) {
  const annual = summary.savings * 12;
  const positive = summary.savings > 0;
  const contractDelta = summary.original - summary.platinum;
  elements.opportunityPanel.innerHTML = `
    <div class="opportunity-top">
      <span class="opportunity-icon">${icon("i-crown")}</span>
      <span class="opportunity-status">${positive ? "Oportunidade identificada" : "Requer análise"}</span>
    </div>
    <h3>${positive ? "A simulação indica vantagem contratual." : "O perfil precisa de uma leitura comercial adicional."}</h3>
    <p>${positive
      ? `A melhor combinação contratual reduz o total estimado em ${formatCurrency(summary.savings)}. Considerando somente o Platinum, a diferença para o valor atual é de ${formatCurrency(contractDelta)}.`
      : "O total simulado não ficou abaixo do valor informado. Verifique descontos já aplicados, serviços adicionais e objetos sinalizados para revisão."}</p>
    <div class="opportunity-number">
      <span>Projeção simples para 12 períodos equivalentes</span>
      <strong>${formatCurrency(annual)}</strong>
    </div>
  `;
}

function renderMiniChart(results, summary) {
  const eligible = results.filter((item) => item.miniEligible).length;
  const total = results.length;
  const notEligible = Math.max(0, total - eligible);
  const pct = total ? (eligible / total) * 100 : 0;
  elements.miniDonut.style.setProperty("--pct", `${pct}%`);
  elements.miniDonutValue.textContent = `${Math.round(pct)}%`;
  elements.miniLegend.innerHTML = `
    <div class="legend-row"><span class="legend-dot"></span><span>Potencialmente elegíveis</span><strong>${eligible}</strong></div>
    <div class="legend-row"><span class="legend-dot muted"></span><span>Fora do potencial atual</span><strong>${notEligible}</strong></div>
    <div class="legend-row"><span class="legend-dot" style="background:var(--green-500)"></span><span>Valor total simulado</span><strong>${formatCurrency(summary.mini)}</strong></div>
  `;
  elements.miniDonut.setAttribute("aria-label", `${eligible} de ${total} objetos potencialmente elegíveis para Mini Envios`);
}

function countBy(results, field) {
  const counts = new Map();
  for (const item of results) {
    const key = String(item[field] || "NÃO INFORMADO");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function renderServiceChart(results) {
  const counts = new Map([["PAC", 0], ["SEDEX", 0], ["MINI", 0]]);
  for (const item of results) counts.set(item.service, (counts.get(item.service) || 0) + 1);
  const total = Math.max(results.length, 1);
  const items = [
    ["PAC", counts.get("PAC") || 0, "pac"],
    ["SEDEX", counts.get("SEDEX") || 0, "sedex"],
    ["Mini Envios", counts.get("MINI") || 0, "mini"],
  ];
  elements.serviceChart.innerHTML = `
    <div class="service-stack" aria-label="Distribuição por serviço">
      ${items.map(([, value, cls]) => `<span class="${cls}" style="width:${(value / total) * 100}%"></span>`).join("")}
    </div>
    <div class="service-list">
      ${items.map(([label, value, cls]) => `
        <div class="service-row">
          <span class="dot ${cls}"></span>
          <span>${label}</span>
          <strong>${value} · ${Math.round((value / total) * 100)}%</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDestinationChart(results) {
  const top = countBy(results, "uf").slice(0, 6);
  const max = Math.max(...top.map(([, count]) => count), 1);
  elements.destinationChart.innerHTML = top.length
    ? top.map(([uf, count]) => `
        <div class="mini-bar-row">
          <span>${escapeHtml(uf)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
          <strong>${count}</strong>
        </div>
      `).join("")
    : `<p class="method-note">Nenhum destino disponível.</p>`;
}

function renderSavingsChart(results) {
  const top = results
    .filter((item) => Number(item.savings) > 0)
    .sort((a, b) => Number(b.savings) - Number(a.savings))
    .slice(0, 6);
  const max = Math.max(...top.map((item) => Number(item.savings)), 1);
  elements.savingsChart.innerHTML = top.length
    ? top.map((item) => `
        <div class="ranking-row">
          <span class="ranking-label">
            <strong>${escapeHtml(item.object || "Sem código")}</strong>
            <small>${escapeHtml(item.service)} · ${escapeHtml(item.destination)}</small>
          </span>
          <div class="bar-track"><div class="bar-fill" style="width:${(Number(item.savings) / max) * 100}%"></div></div>
          <strong>${formatCurrency(item.savings)}</strong>
        </div>
      `).join("")
    : `<p class="method-note">Nenhum objeto apresentou economia positiva nesta análise.</p>`;
}

function renderInsights(results, summary) {
  const services = countBy(results, "service");
  const destinations = countBy(results, "uf");
  const dominantService = services[0] || ["NÃO INFORMADO", 0];
  const topDestination = destinations[0] || ["NÃO INFORMADO", 0];
  const miniPct = summary.count ? (summary.coverage.mini / summary.count) * 100 : 0;
  const positiveSavings = results.filter((item) => Number(item.savings) > 0).length;
  const bestScenario = [
    ["À vista", summary.avista],
    ["APP Correios", summary.app],
    ["Platinum", summary.platinum],
    ["Melhor combinação", summary.bestContract],
  ].filter(([, value]) => Number(value) > 0).sort((a, b) => a[1] - b[1])[0];

  const insights = [
    {
      title: bestScenario ? `${bestScenario[0]} apresenta o menor total simulado.` : "Não foi possível identificar o menor cenário.",
      text: bestScenario ? `Total estimado de ${formatCurrency(bestScenario[1])} para o conjunto analisado.` : "Revise as linhas sem cobertura tarifária.",
    },
    {
      title: `${positiveSavings} de ${summary.count} objetos apresentam economia positiva.`,
      text: `Isso representa ${summary.count ? Math.round((positiveSavings / summary.count) * 100) : 0}% da base importada.`,
    },
    {
      title: `${Math.round(miniPct)}% dos objetos têm potencial para Mini Envios.`,
      text: `${summary.coverage.mini} objetos foram sinalizados. A aceitação final depende das demais regras do serviço.`,
    },
    {
      title: `${dominantService[0]} é o serviço mais frequente.`,
      text: `${dominantService[1]} objetos, equivalentes a ${summary.count ? Math.round((dominantService[1] / summary.count) * 100) : 0}% do volume.`,
    },
    {
      title: `${topDestination[0]} concentra o maior volume por UF.`,
      text: `${topDestination[1]} objetos destinados a essa unidade federativa.`,
    },
  ];

  if (summary.review > 0) {
    insights.push({
      title: `${summary.review} objetos precisam de revisão.`,
      text: "Confira dimensões, classificação municipal ou serviços adicionais antes de apresentar a proposta.",
    });
  }

  elements.insightsList.innerHTML = insights.slice(0, 6).map((item, index) => `
    <div class="insight-item">
      <span class="insight-index">${String(index + 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></div>
    </div>
  `).join("");
}

function weightLabel(item) {
  if (!item.chargeableWeightRegularG) return "-";
  const regular = `${Math.round(item.chargeableWeightRegularG)} g`;
  if (item.chargeableWeightAppG && item.chargeableWeightAppG !== item.chargeableWeightRegularG) {
    return `${regular}<div class="route-detail">APP: ${Math.round(item.chargeableWeightAppG)} g</div>`;
  }
  return regular;
}

function serviceBadge(service) {
  const cls = service === "SEDEX" ? "sedex" : service === "MINI" ? "mini" : "pac";
  const label = service === "MINI" ? "MINI ENVIOS" : service;
  return `<span class="service-badge ${cls}">${escapeHtml(label)}</span>`;
}

function renderTable() {
  if (!state.analysis) return;
  const service = elements.serviceFilter.value;
  const status = elements.statusFilter.value;
  const savingsMode = elements.savingsFilter.value;
  const query = normalizeSearch(elements.searchFilter.value);

  const filtered = state.analysis.results.filter((item) => {
    const matchesService = service === "TODOS" || item.service === service;
    const matchesStatus = status === "TODOS" || item.status === status;
    const matchesSavings = savingsMode === "TODOS"
      || (savingsMode === "POSITIVA" && Number(item.savings) > 0)
      || (savingsMode === "NEGATIVA" && Number(item.savings) <= 0);
    const haystack = normalizeSearch(`${item.object} ${item.destination} ${item.city} ${item.uf} ${item.service}`);
    const matchesSearch = !query || haystack.includes(query);
    return matchesService && matchesStatus && matchesSavings && matchesSearch;
  });

  elements.tableCount.textContent = `${filtered.length} de ${state.analysis.results.length} objetos exibidos`;
  elements.resultsBody.innerHTML = filtered.length ? filtered.map((item) => {
    const warningText = item.warnings.join(" ");
    const savingClass = item.savings === null ? "" : item.savings >= 0 ? "saving-positive" : "saving-negative";
    return `
      <tr>
        <td><strong>${escapeHtml(item.object || "Sem código")}</strong></td>
        <td>${serviceBadge(item.service)}</td>
        <td>${escapeHtml(item.destination)}<div class="route-detail">Classe ${escapeHtml(item.cityClassification)}</div></td>
        <td>${escapeHtml(item.route.routeLabel)}<div class="route-detail">${escapeHtml(item.route.contractGroup || "Sem grupo")}</div></td>
        <td>${weightLabel(item)}</td>
        <td class="money">${formatCurrency(item.originalValue)}</td>
        <td class="money">${formatCurrency(item.avista)}</td>
        <td class="money">${formatCurrency(item.app)}</td>
        <td class="money">${formatCurrency(item.platinum)}</td>
        <td class="money" title="${escapeHtml(item.miniReason)}">${formatCurrency(item.mini)}</td>
        <td class="money"><strong>${formatCurrency(item.bestContract)}</strong></td>
        <td class="money ${savingClass}">${formatCurrency(item.savings)}${item.savingsPct !== null ? `<div class="route-detail">${formatPercent(item.savingsPct)}</div>` : ""}</td>
        <td class="warning-cell">
          <span class="badge ${item.status === "CALCULADO" ? "badge-ok" : "badge-review"}">${item.status === "CALCULADO" ? icon("i-check") : icon("i-alert")} ${escapeHtml(item.status)}</span>
          ${warningText ? `<div><button class="warning-button" title="${escapeHtml(warningText)}" type="button">Ver alertas</button></div>` : ""}
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--slate-500)">Nenhum objeto corresponde aos filtros selecionados.</td></tr>`;
}

function renderCriteria() {
  const meta = state.tariffData.meta;
  elements.criteriaList.innerHTML = [
    `Origem fixa: ${meta.origem.nome}, CEP ${meta.origem.cep}, ${meta.origem.cidade}/${meta.origem.uf}.`,
    `Todos os cenários usam as tarifas com vigência em ${formatDateIso(meta.vigencia)}.`,
    `A classificação municipal utilizada é a versão de ${meta.classificacaoCidades}.`,
    "Nas tabelas à vista, capitais e cidades A ou A+ usam o bloco capital-capital. As demais usam capital-interior.",
    "O peso tarifável à vista e Platinum considera o peso real até 5 kg cúbicos. Acima disso, utiliza o maior entre peso real e cúbico.",
    "No APP Correios, o peso foi calculado pelo divisor 7000, conforme a instrução da tabela fornecida.",
    "Mini Envios é apresentado como oportunidade potencial. A confirmação final depende das demais condições de aceitação do serviço.",
    "AR e Mão Própria não foram recalculados porque os valores não constam na base normalizada atual.",
  ].map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function updatePrintHeader() {
  const client = elements.clientName.value.trim() || "Cliente não identificado";
  elements.printClientName.textContent = `Comparativo de tarifas | ${client}`;
  elements.printMeta.textContent = `Base ${state.tariffData.meta.versao} | Vigência ${formatDateIso(state.tariffData.meta.vigencia)} | Origem ${state.tariffData.meta.origem.cep} | Responsável: ${elements.analystName.value.trim() || "AGF José Bonifácio"}`;
}

function renderDashboard() {
  const { results, summary } = state.analysis;
  renderSummary(summary);
  renderBars(summary);
  renderOpportunity(summary);
  renderMiniChart(results, summary);
  renderServiceChart(results);
  renderDestinationChart(results);
  renderSavingsChart(results);
  renderInsights(results, summary);
  renderTable();
  renderCriteria();
}

function runAnalysis() {
  if (!state.tariffData || !state.csvRows.length) return;
  const rows = state.csvRows.filter((row) => row.SERVICO || row.OBJETO);
  state.analysis = analyzeShipments(state.tariffData, rows, {
    includeDeclared: elements.includeDeclared.checked,
  });

  const client = elements.clientName.value.trim();
  elements.resultsTitle.textContent = client ? `Resultado para ${client}` : "Resultado da análise";
  const now = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());
  elements.analysisMeta.textContent = `${state.csvName || "Arquivo importado"} · ${rows.length} postagens · análise gerada em ${now}`;
  renderDashboard();
  updatePrintHeader();
  elements.resultsSection.hidden = false;
  elements.printButton.disabled = false;
  elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportResults() {
  if (!state.analysis) return;
  const headers = [
    "OBJETO", "SERVICO", "DESTINO", "CLASSIFICACAO", "TRECHO", "GRUPO",
    "PESO_REAL_G", "PESO_TARIFAVEL_G", "PESO_APP_G", "VALOR_INFORMADO",
    "VALOR_AVISTA", "VALOR_APP", "VALOR_PLATINUM", "MINI_POTENCIAL",
    "MELHOR_CONTRATO", "ECONOMIA", "ECONOMIA_PCT", "STATUS", "ALERTAS"
  ];
  const lines = [headers.map(csvEscape).join(";")];
  for (const item of state.analysis.results) {
    const row = [
      item.object, item.service, item.destination, item.cityClassification, item.route.routeLabel,
      item.route.contractGroup, item.realWeightG, item.chargeableWeightRegularG, item.chargeableWeightAppG,
      item.originalValue, item.avista, item.app, item.platinum, item.mini, item.bestContract,
      item.savings, item.savingsPct, item.status, item.warnings.join(" | ")
    ];
    lines.push(row.map(csvEscape).join(";"));
  }
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const client = (elements.clientName.value.trim() || "cliente").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  link.href = url;
  link.download = `comparativo-tarifas-${client}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function useSample() {
  try {
    const response = await fetch("./data/exemplo_postagens.csv", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    acceptCsv(parseCsv(text), "exemplo_postagens.csv");
    if (!elements.clientName.value) elements.clientName.value = "Sanauto - exemplo";
  } catch (error) {
    showValidation("Não foi possível carregar o arquivo de exemplo.", "error", [error.message]);
  }
}

function bindEvents() {
  elements.csvFile.addEventListener("change", (event) => handleCsvFile(event.target.files?.[0]));
  elements.dropZone.addEventListener("dragover", (event) => { event.preventDefault(); elements.dropZone.classList.add("dragging"); });
  elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragging"));
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
    handleCsvFile(event.dataTransfer.files?.[0]);
  });
  elements.sampleButton.addEventListener("click", useSample);
  elements.analyzeButton.addEventListener("click", runAnalysis);
  elements.searchFilter.addEventListener("input", renderTable);
  elements.serviceFilter.addEventListener("change", renderTable);
  elements.savingsFilter.addEventListener("change", renderTable);
  elements.statusFilter.addEventListener("change", renderTable);
  elements.exportButton.addEventListener("click", exportResults);
  elements.printButton.addEventListener("click", () => { updatePrintHeader(); window.print(); });
  elements.printReportButton.addEventListener("click", () => { updatePrintHeader(); window.print(); });
  elements.openBaseButton.addEventListener("click", () => elements.baseDialog.showModal());
  elements.closeBaseButton.addEventListener("click", () => elements.baseDialog.close());
  elements.reloadBaseButton.addEventListener("click", async () => {
    await loadTariffData(true);
    showToast("Base tarifária recarregada.");
    if (state.analysis) runAnalysis();
  });
  elements.baseDialog.addEventListener("click", (event) => {
    if (event.target === elements.baseDialog) elements.baseDialog.close();
  });
}

async function init() {
  bindEvents();
  try {
    await loadTariffData();
  } catch (error) {
    console.error(error);
    elements.baseStatus.textContent = "Falha ao carregar a base";
    showValidation("A base tarifária não pôde ser carregada.", "error", [error.message]);
  }
}

init();
