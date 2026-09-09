const INDEX_CACHE = new WeakMap();

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function parseNumberBR(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildIndexes(data) {
  if (INDEX_CACHE.has(data)) return INDEX_CACHE.get(data);

  const classifications = new Map();
  for (const row of data.classificacao?.rows ?? []) {
    const [uf, , city, , currentClass] = row;
    classifications.set(`${normalizeText(uf)}|${normalizeText(city)}`, normalizeText(currentClass));
  }

  const capitals = new Set();
  const eplus = new Set();
  for (const row of data.capitais_eplus?.rows ?? []) {
    const [uf, city, type] = row;
    const key = `${normalizeText(uf)}|${normalizeText(city)}`;
    if (normalizeText(type) === "CAPITAL") capitals.add(key);
    if (normalizeText(type).includes("E+")) eplus.add(key);
  }

  const index = { classifications, capitals, eplus };
  INDEX_CACHE.set(data, index);
  return index;
}

export function getCityClassification(data, uf, city) {
  const { classifications } = buildIndexes(data);
  return classifications.get(`${normalizeText(uf)}|${normalizeText(city)}`) || "SEM CLASSIFICAÇÃO";
}

export function isCapitalEquivalent(data, uf, city) {
  const key = `${normalizeText(uf)}|${normalizeText(city)}`;
  const { capitals } = buildIndexes(data);
  const classification = getCityClassification(data, uf, city);
  return capitals.has(key) || classification === "A" || classification === "A+";
}

export function detectService(row) {
  const service = normalizeText(row.SERVICO);
  const code = String(row.CODIGO_ECT ?? "").replace(/\D/g, "");

  if (service.includes("MINI") || ["4227", "4235", "4391"].includes(code)) return "MINI";
  if (service.includes("SEDEX") || ["4014", "3220", "4162", "41955", "4195"].includes(code)) return "SEDEX";
  if (service.includes("PAC") || ["4510", "3298", "4669", "3395"].includes(code)) return "PAC";
  return "DESCONHECIDO";
}

function groupFromMap(map, uf) {
  const normalizedUf = normalizeText(uf);
  for (const [group, states] of Object.entries(map ?? {})) {
    if (states.includes(normalizedUf)) return group;
  }
  return null;
}

export function resolveRoute(data, service, uf, city) {
  const destinationUf = normalizeText(uf);
  const destinationCity = normalizeText(city);
  const origin = data.meta.origem;
  const classification = getCityClassification(data, destinationUf, destinationCity);
  const capitalEquivalent = isCapitalEquivalent(data, destinationUf, destinationCity);
  const sameState = destinationUf === normalizeText(origin.uf);
  const sameCity = sameState && destinationCity === normalizeText(origin.cidade);

  let avistaBlock = null;
  let avistaGroup = null;
  let contractGroup = null;
  let routeLabel = "";

  if (sameState) {
    avistaBlock = "CAPITAL_CAPITAL";
    avistaGroup = sameCity ? "LOCAL" : "ESTADUAL";
    routeLabel = sameCity ? "Local" : "Estadual";

    if (service === "SEDEX") {
      contractGroup = sameCity ? "L3" : "E4";
    } else {
      contractGroup = "E4";
    }
  } else {
    avistaBlock = capitalEquivalent ? "CAPITAL_CAPITAL" : "CAPITAL_INTERIOR";
    avistaGroup = groupFromMap(data.mapas.avistaUf, destinationUf);
    const groupMap = capitalEquivalent ? data.mapas.capital : data.mapas.interior;
    contractGroup = groupFromMap(groupMap, destinationUf);
    routeLabel = capitalEquivalent ? "Capital / cidade A ou A+" : "Interior";
  }

  return {
    classification,
    capitalEquivalent,
    sameState,
    sameCity,
    avistaBlock,
    avistaGroup,
    contractGroup,
    routeLabel,
  };
}

function dimensionsFromRow(row) {
  return {
    height: parseNumberBR(row.ALTURA),
    width: parseNumberBR(row.LARGURA),
    length: parseNumberBR(row.COMPRIMENTO),
  };
}

function validDimensions(dimensions) {
  return dimensions.height > 0 && dimensions.width > 0 && dimensions.length > 0;
}

export function calculateChargeableWeight(row, mode, rules) {
  const realWeightG = Math.max(0, parseNumberBR(row.PESO));
  const dimensions = dimensionsFromRow(row);
  const warnings = [];

  if (!realWeightG) warnings.push("Peso real ausente ou inválido.");

  if (!validDimensions(dimensions)) {
    if (mode === "APP") {
      return {
        realWeightG,
        cubicWeightG: null,
        chargeableWeightG: null,
        dimensions,
        warnings: [...warnings, "O APP exige dimensões para calcular o peso cúbico."],
      };
    }
    return {
      realWeightG,
      cubicWeightG: null,
      chargeableWeightG: realWeightG || null,
      dimensions,
      warnings: [...warnings, "Dimensões ausentes. O cálculo usou somente o peso real."],
    };
  }

  const divisor = mode === "APP" ? rules.app.divisorCubico : rules.avista.divisorCubico;
  const volume = dimensions.height * dimensions.width * dimensions.length;
  const cubicWeightG = Math.ceil((volume / divisor) * 1000);

  if (mode === "APP") {
    return { realWeightG, cubicWeightG, chargeableWeightG: cubicWeightG, dimensions, warnings };
  }

  const exemptionG = rules.avista.isencaoCubagemKg * 1000;
  const chargeableWeightG = cubicWeightG <= exemptionG
    ? realWeightG
    : Math.max(realWeightG, cubicWeightG);

  return { realWeightG, cubicWeightG, chargeableWeightG, dimensions, warnings };
}

function tariffFieldIndexes(tariff) {
  const headers = tariff.headers;
  const atSight = headers.includes("BLOCO_DESTINO");
  return {
    atSight,
    block: atSight ? headers.indexOf("BLOCO_DESTINO") : -1,
    min: headers.indexOf("PESO_MIN_G"),
    max: headers.indexOf("PESO_MAX_G"),
    type: headers.indexOf("TIPO_FAIXA"),
  };
}

export function lookupTariff(tariff, group, weightG, block = null) {
  if (!tariff || !group || !Number.isFinite(weightG) || weightG <= 0) return null;
  const indexes = tariffFieldIndexes(tariff);
  const groupIndex = tariff.headers.indexOf(group);
  if (groupIndex < 0) return null;

  const rows = tariff.rows.filter((row) => !indexes.atSight || row[indexes.block] === block);
  const regularRows = rows.filter((row) => row[indexes.type] === "FAIXA");

  if (weightG <= 10000) {
    const row = regularRows.find((item) => {
      const min = Number(item[indexes.min]);
      const max = Number(item[indexes.max]);
      return weightG >= min && weightG <= max;
    });
    return row ? roundMoney(Number(row[groupIndex])) : null;
  }

  const base = regularRows.find((item) => Number(item[indexes.max]) === 10000);
  const additional = rows.find((item) => item[indexes.type] === "KG_ADICIONAL");
  if (!base || !additional) return null;

  const extraKg = Math.ceil((weightG - 10000) / 1000);
  return roundMoney(Number(base[groupIndex]) + extraKg * Number(additional[groupIndex]));
}

function calculateAdValorem(declared, automaticIndemnity, percentage) {
  if (!declared || !percentage) return 0;
  return roundMoney(Math.max(0, declared - automaticIndemnity) * (percentage / 100));
}

function hasSpecialHandling(dimensions) {
  return validDimensions(dimensions) && Math.max(dimensions.height, dimensions.width, dimensions.length) > 70;
}

function scenarioTotal(baseFreight, declared, dimensions, rule, includeDeclared) {
  if (baseFreight === null) return null;
  let value = baseFreight;
  if (includeDeclared) {
    value += calculateAdValorem(declared, rule.indenizacaoAutomatica, rule.adValoremPct);
  }
  if (rule.manuseioEspecial && hasSpecialHandling(dimensions)) value += rule.manuseioEspecial;
  return roundMoney(value);
}

function miniScenario(data, row, route, declared, includeDeclared) {
  const realWeight = parseNumberBR(row.PESO);
  const rule = data.regras.mini;
  if (!realWeight || realWeight > rule.pesoMaxInformadoG) {
    return { value: null, eligible: false, reason: "Peso acima do limite informado para Mini Envios." };
  }

  let base = null;
  if (realWeight <= rule.pesoPrecoProprioMaxG) {
    base = lookupTariff(data.tarifas.mini_platinum, route.contractGroup, realWeight);
  } else {
    base = lookupTariff(data.tarifas.pac_platinum, route.contractGroup, realWeight);
  }
  if (base === null) return { value: null, eligible: false, reason: "Não foi possível localizar a faixa do Mini Envios." };

  const adValorem = includeDeclared
    ? calculateAdValorem(declared, rule.indenizacaoAutomatica, rule.adValoremPct)
    : 0;
  const value = roundMoney(base + adValorem);
  const dimensions = dimensionsFromRow(row);
  const notes = [];
  if (dimensions.height > 0 && dimensions.height < 1) notes.push("Altura deverá ser informada como no mínimo 1 cm.");
  notes.push("Elegibilidade potencial: os arquivos fornecidos não trazem todas as restrições físicas do serviço.");
  return { value, eligible: true, reason: notes.join(" ") };
}

export function calculateShipment(data, row, options = {}) {
  const includeDeclared = options.includeDeclared !== false;
  const service = detectService(row);
  const uf = normalizeText(row.UF);
  const city = normalizeText(row.CIDADE);
  const route = resolveRoute(data, service, uf, city);
  const declared = parseNumberBR(row.DECLARADO);
  const originalValue = parseNumberBR(row.VALOR);
  const warnings = [];

  if (service === "DESCONHECIDO") warnings.push("Serviço não reconhecido.");
  if (!uf || !city) warnings.push("Cidade ou UF de destino ausente.");
  if (route.classification === "SEM CLASSIFICAÇÃO" && uf !== data.meta.origem.uf) {
    warnings.push("Cidade não localizada na classificação de 2023.");
  }
  if (String(row.ADICIONAIS ?? "").trim()) {
    warnings.push("O arquivo possui adicionais. AR e MP não foram recalculados porque os valores não constam na base normalizada atual.");
  }

  const regularWeights = calculateChargeableWeight(row, "REGULAR", data.regras);
  const appWeights = calculateChargeableWeight(row, "APP", data.regras);
  warnings.push(...regularWeights.warnings, ...appWeights.warnings);

  let avista = null;
  let app = null;
  let platinum = null;

  if (service === "PAC" || service === "SEDEX") {
    const key = service.toLowerCase();
    const avistaBase = lookupTariff(
      data.tarifas[`${key}_avista`],
      route.avistaGroup,
      regularWeights.chargeableWeightG,
      route.avistaBlock,
    );
    avista = scenarioTotal(avistaBase, declared, regularWeights.dimensions, data.regras.avista, includeDeclared);

    const appBase = lookupTariff(
      data.tarifas[`${key}_app`],
      route.contractGroup,
      appWeights.chargeableWeightG,
    );
    app = appBase;

    const platinumBase = lookupTariff(
      data.tarifas[`${key}_platinum`],
      route.contractGroup,
      regularWeights.chargeableWeightG,
    );
    platinum = scenarioTotal(platinumBase, declared, regularWeights.dimensions, data.regras.platinum, includeDeclared);
  }

  const mini = miniScenario(data, row, route, declared, includeDeclared);
  const contractOptions = [platinum, mini.eligible ? mini.value : null].filter((value) => value !== null);
  const bestContract = contractOptions.length ? Math.min(...contractOptions) : null;
  const savings = bestContract === null ? null : roundMoney(originalValue - bestContract);
  const savingsPct = bestContract === null || !originalValue ? null : roundMoney((savings / originalValue) * 100);

  const status = warnings.some((warning) => warning.includes("não foi") || warning.includes("ausente") || warning.includes("não reconhecido"))
    ? "REVISAR"
    : "CALCULADO";

  return {
    source: row,
    object: row.OBJETO || "",
    service,
    destination: `${city || "SEM CIDADE"}/${uf || "--"}`,
    city,
    uf,
    cityClassification: route.classification,
    route,
    realWeightG: regularWeights.realWeightG,
    cubicWeightRegularG: regularWeights.cubicWeightG,
    chargeableWeightRegularG: regularWeights.chargeableWeightG,
    cubicWeightAppG: appWeights.cubicWeightG,
    chargeableWeightAppG: appWeights.chargeableWeightG,
    originalValue,
    avista,
    app,
    platinum,
    mini: mini.value,
    miniEligible: mini.eligible,
    miniReason: mini.reason,
    bestContract,
    savings,
    savingsPct,
    warnings: [...new Set(warnings)],
    status,
  };
}

export function summarizeResults(results) {
  const sum = (field) => roundMoney(results.reduce((total, item) => total + (Number(item[field]) || 0), 0));
  const countValid = (field) => results.filter((item) => item[field] !== null).length;
  const original = sum("originalValue");
  const best = sum("bestContract");
  const savings = roundMoney(original - best);
  return {
    count: results.length,
    calculated: results.filter((item) => item.status === "CALCULADO").length,
    review: results.filter((item) => item.status === "REVISAR").length,
    original,
    avista: sum("avista"),
    app: sum("app"),
    platinum: sum("platinum"),
    mini: sum("mini"),
    bestContract: best,
    savings,
    savingsPct: original ? roundMoney((savings / original) * 100) : 0,
    coverage: {
      avista: countValid("avista"),
      app: countValid("app"),
      platinum: countValid("platinum"),
      mini: results.filter((item) => item.miniEligible).length,
    },
  };
}

export function analyzeShipments(data, rows, options = {}) {
  const results = rows.map((row) => calculateShipment(data, row, options));
  return { results, summary: summarizeResults(results) };
}
