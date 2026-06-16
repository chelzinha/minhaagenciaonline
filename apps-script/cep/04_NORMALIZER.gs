function agfNormalizeCorreiosItem_(item, provider) {
  if (!item) return null;

  const cep = agfNormalizeCep_(item.cep || item.cepFormatado || item.codigoPostal);
  const uf = agfNormalizeUf_(item.uf || item.siglaUf || item.estado);
  const cidade = agfCleanText_(
    item.localidade ||
    item.nomeLocalidade ||
    item.municipio ||
    item.cidade ||
    item.nomeMunicipio
  );
  const bairro = agfCleanText_(
    item.bairro ||
    item.nomeBairro ||
    item.district
  );

  const tipoLogradouro = agfCleanText_(item.tipoLogradouro || item.tipo || item.tipoLog);
  const nomeLogradouro = agfCleanText_(
    item.logradouro ||
    item.nomeLogradouro ||
    item.endereco ||
    item.street
  );
  const logradouro = agfCleanText_(
    nomeLogradouro && tipoLogradouro && agfNormalizeForCompare_(nomeLogradouro).indexOf(agfNormalizeForCompare_(tipoLogradouro)) !== 0
      ? `${tipoLogradouro} ${nomeLogradouro}`
      : nomeLogradouro
  );

  if (!cep && !logradouro && !cidade) return null;

  const normalized = {
    cep: agfFormatCep_(cep || item.cep || item.codigoPostal || ''),
    cepDigits: cep,
    logradouro,
    tipoLogradouro,
    nomeLogradouro: agfCleanText_(item.nomeLogradouro || ''),
    numeroLogradouro: agfCleanText_(item.numeroLogradouro || ''),
    complemento: agfCleanText_(item.complemento || item.complementoLogradouro),
    abreviatura: agfCleanText_(item.abreviatura || ''),
    bairro,
    cidade,
    uf,
    ibge: agfCleanText_(item.codigoIbge || item.ibge),
    ddd: agfCleanText_(item.ddd),
    numeroLocalidade: agfToNullableNumber_(item.numeroLocalidade),
    numeroLocalidadeSuperior: agfToNullableNumber_(item.numeroLocalidadeSuperior),
    localidadeSuperior: agfCleanText_(item.localidadeSuperior || ''),
    nome: agfCleanText_(item.nome || ''),
    siglaUnidade: agfCleanText_(item.siglaUnidade || ''),
    tipoCEP: agfToNullableNumber_(item.tipoCEP),
    cepAnterior: agfCleanText_(item.cepAnterior || ''),
    distrito: agfCleanText_(item.distrito || ''),
    cepUnidadeOperacional: agfCleanText_(item.cepUnidadeOperacional || ''),
    lado: agfCleanText_(item.lado || ''),
    numeroInicial: agfToNullableNumber_(item.numeroInicial),
    numeroFinal: agfToNullableNumber_(item.numeroFinal),
    clique: agfCleanText_(item.clique || ''),
    caixaPostal: agfCleanText_(item.caixaPostal || ''),
    locker: agfCleanText_(item.locker || ''),
    agenciaModular: agfCleanText_(item.agenciaModular || ''),
    provider: provider || 'correios',
    confidence: cep ? 'high' : 'medium'
  };

  normalized.faixaNumero = agfBuildNumberRangeFromItem_(normalized);
  normalized.faixaNumeroLabel = agfBuildNumberRangeLabel_(normalized);

  return normalized;
}

function agfEnrichResultsWithInput_(results, plan) {
  const numero = plan && plan.numeroInformado ? plan.numeroInformado : '';
  return (results || []).map(item => {
    const faixaNumero = item.faixaNumero || agfBuildNumberRangeFromItem_(item);
    const faixaNumeroLabel = item.faixaNumeroLabel || agfBuildNumberRangeLabel_(item);
    const numeroDentroDaFaixa = numero ? agfAddressItemMatchesNumber_(item, numero) : false;

    return Object.assign({}, item, {
      faixaNumero,
      faixaNumeroLabel,
      numeroDentroDaFaixa,
      numeroInformado: numero,
      queryOriginal: plan ? plan.rawQuery : '',
      searchScope: plan ? plan.scope : ''
    });
  });
}

function agfDedupeAddressResults_(results) {
  const list = Array.isArray(results) ? results : [];
  const seen = new Set();
  const output = [];

  list.forEach(item => {
    if (!item) return;
    const key = [
      agfNormalizeCep_(item.cep || item.cepDigits),
      agfNormalizeForKey_(item.logradouro),
      agfNormalizeForKey_(item.complemento),
      agfNormalizeForKey_(item.bairro),
      agfNormalizeForKey_(item.cidade),
      agfNormalizeUf_(item.uf)
    ].join('|');

    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function agfRankAddressResults_(results, plan) {
  const core = plan && plan.logradouroCore ? agfNormalizeForCompare_(plan.logradouroCore) : '';
  const preferredUf = plan && plan.preferUf ? agfNormalizeUf_(plan.preferUf) : '';
  const preferredCidade = plan && plan.preferCidade ? agfNormalizeForCompare_(plan.preferCidade) : '';
  const inputNumber = plan && plan.numeroInformado ? plan.numeroInformado : '';

  return (results || []).slice().sort((a, b) => {
    return agfScoreAddressResult_(b, core, preferredUf, preferredCidade, inputNumber) - agfScoreAddressResult_(a, core, preferredUf, preferredCidade, inputNumber);
  });
}

function agfScoreAddressResult_(item, core, preferredUf, preferredCidade, inputNumber) {
  let score = 0;
  const logradouro = agfNormalizeForCompare_(item && item.logradouro);
  const cidade = agfNormalizeForCompare_(item && item.cidade);
  const uf = agfNormalizeUf_(item && item.uf);

  if (core && logradouro === core) score += 80;
  else if (core && logradouro.indexOf(core) >= 0) score += 60;
  else if (core && core.indexOf(logradouro) >= 0) score += 40;

  if (preferredUf && uf === preferredUf) score += 15;
  if (preferredCidade && cidade === preferredCidade) score += 20;
  if (item && item.cepDigits) score += 10;
  if (item && item.provider === 'correios') score += 8;

  if (inputNumber) {
    const hasRange = !!agfBuildNumberRangeFromItem_(item);
    if (agfAddressItemMatchesNumber_(item, inputNumber)) {
      score += 140;
    } else if (hasRange) {
      score -= 15;
    }
  }

  return score;
}

function agfToNullableNumber_(value) {
  if (value === 0 || value === '0') return 0;
  if (value === undefined || value === null || value === '') return null;
  const cleaned = String(value).replace(/[^0-9-]+/g, '');
  if (!cleaned) return null;
  const number = parseInt(cleaned, 10);
  return Number.isFinite(number) ? number : null;
}

function agfNormalizeComplementoLabel_(value) {
  return agfCleanText_(value).replace(/^[-–—]\s*/g, '').trim();
}

function agfBuildNumberRangeFromItem_(item) {
  if (!item) return null;

  const inicioRaw = agfToNullableNumber_(item.numeroInicial);
  const fimRaw = agfToNullableNumber_(item.numeroFinal);

  if (inicioRaw !== null || fimRaw !== null) {
    const inicio = inicioRaw !== null ? inicioRaw : 0;
    const fim = fimRaw !== null && fimRaw > 0 ? fimRaw : null;
    return {
      inicio,
      fim,
      abertoAoFim: fim === null,
      lado: agfNormalizeForCompare_(item.lado || ''),
      origem: 'campos_api'
    };
  }

  return agfParseNumberRangeFromComplement_(item.complemento || '');
}

function agfParseNumberRangeFromComplement_(complemento) {
  const clean = agfNormalizeComplementoLabel_(complemento);
  if (!clean) return null;

  const normalized = agfNormalizeForCompare_(clean);
  const numbers = (normalized.match(/\d+/g) || []).map(n => parseInt(n, 10)).filter(Number.isFinite);
  if (!numbers.length) return null;

  if (/\bATE\b/.test(normalized)) {
    return {
      inicio: 0,
      fim: Math.max.apply(null, numbers),
      abertoAoFim: false,
      lado: '',
      origem: 'complemento'
    };
  }

  if (/\bAO\s+FIM\b/.test(normalized) || /\bA\s+FIM\b/.test(normalized)) {
    return {
      inicio: Math.min.apply(null, numbers),
      fim: null,
      abertoAoFim: true,
      lado: '',
      origem: 'complemento'
    };
  }

  if (/\bDE\b/.test(normalized) && /\bA\b/.test(normalized) && numbers.length >= 2) {
    const firstHalf = numbers.slice(0, Math.max(1, Math.floor(numbers.length / 2)));
    const secondHalf = numbers.slice(Math.max(1, Math.floor(numbers.length / 2)));
    return {
      inicio: Math.min.apply(null, firstHalf),
      fim: Math.max.apply(null, secondHalf.length ? secondHalf : numbers),
      abertoAoFim: false,
      lado: '',
      origem: 'complemento'
    };
  }

  if (numbers.length >= 2) {
    return {
      inicio: Math.min.apply(null, numbers),
      fim: Math.max.apply(null, numbers),
      abertoAoFim: false,
      lado: '',
      origem: 'complemento'
    };
  }

  return null;
}

function agfAddressItemMatchesNumber_(item, numero) {
  const number = agfToNullableNumber_(numero);
  if (number === null) return false;

  const range = item && item.faixaNumero ? item.faixaNumero : agfBuildNumberRangeFromItem_(item);
  if (!range) return false;

  const inicio = range.inicio === null || range.inicio === undefined ? 0 : Number(range.inicio);
  const fim = range.fim === null || range.fim === undefined ? null : Number(range.fim);
  if (number < inicio) return false;
  if (fim !== null && number > fim) return false;

  const lado = agfNormalizeForCompare_(range.lado || item.lado || '');
  if (lado === 'P' || lado === 'PAR') return number % 2 === 0;
  if (lado === 'I' || lado === 'IMPAR' || lado === 'ÍMPAR') return number % 2 !== 0;

  return true;
}

function agfBuildNumberRangeLabel_(item) {
  if (!item) return '';
  const complemento = agfNormalizeComplementoLabel_(item.complemento || '');
  if (complemento) return complemento;

  const range = item.faixaNumero || agfBuildNumberRangeFromItem_(item);
  if (!range) return '';

  const inicio = range.inicio === null || range.inicio === undefined ? 0 : Number(range.inicio);
  const fim = range.fim === null || range.fim === undefined ? null : Number(range.fim);

  if (inicio <= 0 && fim !== null) return `até ${fim}`;
  if (fim === null) return `de ${inicio} ao fim`;
  return `de ${inicio} a ${fim}`;
}
