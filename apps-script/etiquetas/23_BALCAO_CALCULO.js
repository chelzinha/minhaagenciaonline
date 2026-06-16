/**
 * APP ETIQUETAS AGF — 23_BALCAO_CALCULO.gs
 */

function action_balcaoConfig_(params) {
  const cfg = getBalcaoConfig_();
  return {
    version: BCFG.APP_VERSION,
    cepOrigemDefault: balcaoDigits_(cfg.CEP_ORIGEM_DEFAULT || cfg.CEP_ORIGEM || cfg.CEP_ORIGEM_DEFAULT || BCFG.DEFAULTS.CEP_ORIGEM),
    cidadeOrigemDefault: sanitize_(cfg.CIDADE_ORIGEM_DEFAULT || BCFG.DEFAULTS.CIDADE_ORIGEM),
    ufOrigemDefault: balcaoNormalizeUf_(cfg.UF_ORIGEM_DEFAULT || BCFG.DEFAULTS.UF_ORIGEM),
    servicos: balcaoListarServicos_(),
    apiPrazoConfigurada: balcaoPrazoDisponivel_()
  };
}

function action_balcaoCep_(params) {
  return balcaoBuscarCep_(params.cep);
}

function action_balcaoCotar_(params) {
  return balcaoCotarTodos_(params.payload || {});
}

function action_balcaoSalvarRascunho_(params) {
  return balcaoSalvarRascunho_(params.payload || {});
}

function action_balcaoListarRascunhos_(params) {
  return balcaoListarRascunhos_(params.filtros || {});
}

function balcaoListarServicos_() {
  const ss = getBalcaoSpreadsheet_();
  const sh = ss.getSheetByName(BCFG.SHEETS.SERVICOS);
  let rows = sh ? sheetToObjects_(sh) : [];
  if (!rows.length) {
    rows = BCFG.SERVICOS_PADRAO.map((s, idx) => ({
      ATIVO: s.ativo, CHAVE: s.chave, CODIGO_SERVICO: s.codigo, CODIGO_PRAZO: s.codigoPrazo,
      NOME: s.nome, TIPO: s.tipo, LIMITE_PESO_G: s.limitePesoG, PERMITE_AR: 'SIM', PERMITE_MP: 'SIM', PERMITE_VD: 'SIM', ORDEM: idx + 1
    }));
  }
  return rows
    .filter(r => upper_(r.ATIVO || 'SIM') !== 'NAO')
    .sort((a,b) => Number(a.ORDEM || 999) - Number(b.ORDEM || 999))
    .map(r => ({
      chave: sanitize_(r.CHAVE),
      codigoServico: sanitize_(r.CODIGO_SERVICO),
      codigoPrazo: sanitize_(r.CODIGO_PRAZO || r.CODIGO_SERVICO),
      nome: sanitize_(r.NOME),
      tipo: upper_(r.TIPO || ''),
      limitePesoG: Number(r.LIMITE_PESO_G || 0),
      permiteAr: upper_(r.PERMITE_AR || 'SIM') !== 'NAO',
      permiteMp: upper_(r.PERMITE_MP || 'SIM') !== 'NAO',
      permiteVd: upper_(r.PERMITE_VD || 'SIM') !== 'NAO'
    }));
}

function balcaoCotarTodos_(p) {
  const cepOrigem = balcaoDigits_(p.cepOrigem);
  const cepDestino = balcaoDigits_(p.cepDestino);
  if (!balcaoIsCep_(cepOrigem)) throw new Error('CEP de origem inválido.');
  if (!balcaoIsCep_(cepDestino)) throw new Error('CEP de destino inválido.');

  const origem = p.origem && p.origem.uf ? p.origem : balcaoBuscarCep_(cepOrigem);
  const destino = p.destino && p.destino.uf ? p.destino : balcaoBuscarCep_(cepDestino);

  const entrada = balcaoNormalizarEntrada_(p, origem, destino);
  const servicos = balcaoListarServicos_();
  const opcoes = servicos.map(s => balcaoCotarServico_(s, entrada));

  const totalOk = opcoes.filter(o => o.ok).length;
  const totalErro = opcoes.length - totalOk;

  return {
    ok: totalOk > 0,
    entrada: entrada,
    opcoes: opcoes,
    totalOk: totalOk,
    totalErro: totalErro,
    aviso: 'Preço calculado por tabela interna. Prazo, quando disponível, consultado na API Prazo dos Correios.'
  };
}

function balcaoNormalizarEntrada_(p, origem, destino) {
  const pesoG = balcaoToNumber_(p.pesoG);
  const altura = balcaoToNumber_(p.alturaCm);
  const largura = balcaoToNumber_(p.larguraCm);
  const comprimento = balcaoToNumber_(p.comprimentoCm);
  const diametro = balcaoToNumber_(p.diametroCm);
  const tipoObjeto = upper_(p.tipoObjeto || 'PACOTE');
  const valorDeclarado = balcaoToNumber_(p.valorDeclarado);

  if (pesoG <= 0) throw new Error('Informe o peso em gramas.');
  if (tipoObjeto !== 'ENVELOPE') {
    if (comprimento <= 0 || largura <= 0 || altura <= 0) throw new Error('Informe altura, largura e comprimento.');
  }

  const pesoCubicoKg = (comprimento > 0 && largura > 0 && altura > 0)
    ? (comprimento * largura * altura) / balcaoToNumber_(getBalcaoConfig_().CUBAGEM_DIVISOR || BCFG.DEFAULTS.CUBAGEM_DIVISOR)
    : 0;

  const isentoKg = balcaoToNumber_(getBalcaoConfig_().CUBAGEM_ISENCAO_KG || BCFG.DEFAULTS.CUBAGEM_ISENCAO_KG);
  const pesoTarifadoG = pesoCubicoKg > isentoKg ? Math.max(pesoG, Math.ceil(pesoCubicoKg * 1000)) : pesoG;

  return {
    cepOrigem: origem.cep || balcaoDigits_(p.cepOrigem),
    cidadeOrigem: origem.cidade || '',
    ufOrigem: balcaoNormalizeUf_(origem.uf),
    cepDestino: destino.cep || balcaoDigits_(p.cepDestino),
    cidadeDestino: destino.cidade || '',
    ufDestino: balcaoNormalizeUf_(destino.uf),
    origemCapital: balcaoIsCapital_(origem.uf, origem.cidade),
    destinoCapital: balcaoIsCapital_(destino.uf, destino.cidade),
    tipoObjeto: tipoObjeto,
    pesoG: pesoG,
    pesoCubicoKg: balcaoMoney_(pesoCubicoKg),
    pesoTarifadoG: Math.ceil(pesoTarifadoG),
    alturaCm: altura,
    larguraCm: largura,
    comprimentoCm: comprimento,
    diametroCm: diametro,
    valorDeclarado: valorDeclarado,
    ar: upper_(p.ar) === 'SIM' ? 'SIM' : 'NAO',
    maoPropria: upper_(p.maoPropria) === 'SIM' ? 'SIM' : 'NAO'
  };
}

function balcaoCotarServico_(servico, entrada) {
  try {
    if (!servico.codigoServico) throw new Error('Serviço sem código.');
    if (servico.limitePesoG && entrada.pesoTarifadoG > servico.limitePesoG) {
      throw new Error('Peso tarifado excede o limite do serviço (' + servico.limitePesoG + ' g).');
    }

    const precoBaseInfo = balcaoEncontrarTarifa_(servico, entrada);
    const adicionais = balcaoCalcularAdicionais_(servico, entrada);
    const prazo = balcaoConsultarPrazo_(servico.codigoPrazo || servico.codigoServico, entrada.cepOrigem, entrada.cepDestino);
    const total = balcaoMoney_(precoBaseInfo.precoBase + adicionais.valorDeclaradoAdicional + adicionais.arValor + adicionais.mpValor);

    return {
      ok: true,
      servico: servico.chave,
      nome: servico.nome,
      codigoServico: servico.codigoServico,
      codigoPrazo: servico.codigoPrazo,
      precoBase: balcaoMoney_(precoBaseInfo.precoBase),
      valorDeclarado: entrada.valorDeclarado,
      vdAdicional: adicionais.valorDeclaradoAdicional,
      arValor: adicionais.arValor,
      mpValor: adicionais.mpValor,
      total: total,
      prazo: prazo,
      prazoDias: prazo.ok ? prazo.prazoDias : '',
      dataMaxima: prazo.ok ? prazo.dataMaxima : '',
      pesoTarifadoG: entrada.pesoTarifadoG,
      faixa: precoBaseInfo.faixa,
      grupoDestino: precoBaseInfo.grupoDestino,
      erro: null
    };
  } catch (e) {
    return {
      ok: false,
      servico: servico.chave,
      nome: servico.nome,
      codigoServico: servico.codigoServico,
      erro: e.message
    };
  }
}

function balcaoEncontrarTarifa_(servico, entrada) {
  const ss = getBalcaoSpreadsheet_();
  const sh = ss.getSheetByName(BCFG.SHEETS.TARIFAS);
  if (!sh) throw new Error('Aba BALCAO_TARIFAS não encontrada. Rode balcaoCriarAbasModelo().');
  const rows = sheetToObjects_(sh).filter(r => {
    if (upper_(r.ATIVO || 'SIM') === 'NAO') return false;
    const chaveOk = upper_(r.CHAVE_SERVICO) === upper_(servico.chave);
    const codOk = sanitize_(r.CODIGO_SERVICO) === sanitize_(servico.codigoServico);
    return chaveOk || codOk;
  });
  if (!rows.length) throw new Error('Sem tarifas cadastradas para ' + servico.nome + '.');

  const trechoEntrada = (entrada.origemCapital && entrada.destinoCapital) ? 'CAPITAL_CAPITAL' : 'GERAL';
  const candidates = rows.filter(r => {
    const ufOrigem = balcaoNormalizeUf_(r.UF_ORIGEM);
    if (ufOrigem && ufOrigem !== entrada.ufOrigem) return false;

    const ufDestino = balcaoNormalizeUf_(r.UF_DESTINO);
    const grupoDestino = balcaoNormalizeText_(r.GRUPO_DESTINO);
    const ufDestinoOk = !ufDestino || ufDestino === entrada.ufDestino;
    const grupoOk = !grupoDestino || grupoDestino.split(/[,;\s]+/).indexOf(entrada.ufDestino) >= 0 || grupoDestino.indexOf(entrada.ufDestino) >= 0;
    if (!ufDestinoOk && !grupoOk) return false;

    const trecho = upper_(r.TRECHO || 'TODOS');
    if (trecho && trecho !== 'TODOS' && trecho !== trechoEntrada && !(trechoEntrada === 'GERAL' && trecho.indexOf('INTERIOR') >= 0)) return false;

    const min = balcaoToNumber_(r.PESO_MIN_G);
    const max = balcaoToNumber_(r.PESO_MAX_G);
    if (max > 0 && entrada.pesoTarifadoG >= min && entrada.pesoTarifadoG <= max) return true;
    return false;
  });

  if (candidates.length) {
    const best = candidates[0];
    return {
      precoBase: balcaoToNumber_(best.PRECO_BASE),
      faixa: String(best.PESO_MIN_G || '') + ' a ' + String(best.PESO_MAX_G || '') + ' g',
      grupoDestino: best.GRUPO_DESTINO || best.UF_DESTINO || ''
    };
  }

  // Kg adicional: procura última faixa + linha de kg adicional compatível
  const compatible = rows.filter(r => {
    const ufOrigem = balcaoNormalizeUf_(r.UF_ORIGEM);
    if (ufOrigem && ufOrigem !== entrada.ufOrigem) return false;
    const text = balcaoNormalizeText_((r.UF_DESTINO || '') + ' ' + (r.GRUPO_DESTINO || ''));
    return !text || text.indexOf(entrada.ufDestino) >= 0;
  });
  const finite = compatible
    .filter(r => balcaoToNumber_(r.PESO_MAX_G) > 0 && balcaoToNumber_(r.PRECO_BASE) > 0)
    .sort((a,b) => balcaoToNumber_(b.PESO_MAX_G) - balcaoToNumber_(a.PESO_MAX_G));
  const kgRow = compatible.find(r => balcaoToNumber_(r.KG_ADICIONAL) > 0 || /KG/i.test(String(r.PESO_MAX_G || '') + String(r.OBS || '')));
  if (finite.length && kgRow) {
    const last = finite[0];
    const maxPeso = balcaoToNumber_(last.PESO_MAX_G);
    const base = balcaoToNumber_(last.PRECO_BASE);
    const kgAd = balcaoToNumber_(kgRow.KG_ADICIONAL || kgRow.PRECO_BASE);
    const extraKg = Math.ceil(Math.max(0, entrada.pesoTarifadoG - maxPeso) / 1000);
    return { precoBase: base + extraKg * kgAd, faixa: 'acima de ' + maxPeso + ' g + ' + extraKg + ' kg adicional', grupoDestino: last.GRUPO_DESTINO || last.UF_DESTINO || '' };
  }

  throw new Error('Não encontrei tarifa para ' + entrada.ufOrigem + ' → ' + entrada.ufDestino + ', peso tarifado ' + entrada.pesoTarifadoG + ' g.');
}

function balcaoCalcularAdicionais_(servico, entrada) {
  const cfg = getBalcaoConfig_();
  const ad = balcaoMapAdicionais_();
  let arValor = 0;
  let mpValor = 0;
  let vd = 0;

  if (entrada.ar === 'SIM' && servico.permiteAr) arValor = balcaoToNumber_(ad.AR || 0);
  if (entrada.maoPropria === 'SIM' && servico.permiteMp) mpValor = balcaoToNumber_(ad.MP || 0);

  if (entrada.valorDeclarado > 0 && servico.permiteVd) {
    const min = balcaoToNumber_(cfg.VD_MIN || BCFG.DEFAULTS.VD_MIN);
    const maxPac = balcaoToNumber_(cfg.VD_MAX_PAC || BCFG.DEFAULTS.VD_MAX_PAC);
    const maxSedex = balcaoToNumber_(cfg.VD_MAX_SEDEX || BCFG.DEFAULTS.VD_MAX_SEDEX);
    const max = upper_(servico.tipo) === 'PAC' ? maxPac : maxSedex;
    if (entrada.valorDeclarado < min) throw new Error('Valor declarado mínimo: ' + balcaoFormatMoneyBR_(min) + '.');
    if (entrada.valorDeclarado > max) throw new Error('Valor declarado máximo para ' + servico.nome + ': ' + balcaoFormatMoneyBR_(max) + '.');
    const pct = balcaoToNumber_(ad.VD_PERCENT || cfg.AD_VALOREM_PERCENT || BCFG.DEFAULTS.AD_VALOREM_PERCENT);
    vd = balcaoMoney_(entrada.valorDeclarado * pct);
  }

  return { arValor: balcaoMoney_(arValor), mpValor: balcaoMoney_(mpValor), valorDeclaradoAdicional: balcaoMoney_(vd) };
}

function balcaoMapAdicionais_() {
  const ss = getBalcaoSpreadsheet_();
  const sh = ss.getSheetByName(BCFG.SHEETS.ADICIONAIS);
  const out = {};
  if (!sh) return out;
  sheetToObjects_(sh).forEach(r => {
    if (upper_(r.ATIVO || 'SIM') === 'NAO') return;
    out[upper_(r.CHAVE)] = balcaoToNumber_(r.VALOR);
  });
  return out;
}

function balcaoSalvarRascunho_(payload) {
  const ss = getBalcaoSpreadsheet_();
  let sh = ss.getSheetByName(BCFG.SHEETS.RASCUNHOS);
  if (!sh) sh = ensureBalcaoSheet_(ss, BCFG.SHEETS.RASCUNHOS, [
    'ID','DATA_HORA','CEP_ORIGEM','CIDADE_ORIGEM','UF_ORIGEM','CEP_DESTINO','CIDADE_DESTINO','UF_DESTINO','TIPO_OBJETO','PESO_G','ALTURA_CM','LARGURA_CM','COMPRIMENTO_CM','DIAMETRO_CM','VALOR_DECLARADO','AR','MAO_PROPRIA','SERVICO_ESCOLHIDO','CODIGO_SERVICO','PRECO_TOTAL','PRAZO_DIAS','RAW_JSON'
  ]);
  const id = 'BALCAO-' + Utilities.getUuid().slice(0,8).toUpperCase();
  const entrada = payload.entrada || {};
  const opcao = payload.opcao || {};
  sh.appendRow([
    id, new Date(), entrada.cepOrigem || '', entrada.cidadeOrigem || '', entrada.ufOrigem || '', entrada.cepDestino || '', entrada.cidadeDestino || '', entrada.ufDestino || '', entrada.tipoObjeto || '', entrada.pesoG || '', entrada.alturaCm || '', entrada.larguraCm || '', entrada.comprimentoCm || '', entrada.diametroCm || '', entrada.valorDeclarado || '', entrada.ar || '', entrada.maoPropria || '', opcao.nome || opcao.servico || '', opcao.codigoServico || '', opcao.total || '', opcao.prazoDias || '', JSON.stringify(payload)
  ]);
  return { ok: true, id: id, message: 'Rascunho salvo para alimentar a etiqueta/ficha de balcão.' };
}

function balcaoListarRascunhos_(filtros) {
  const ss = getBalcaoSpreadsheet_();
  const sh = ss.getSheetByName(BCFG.SHEETS.RASCUNHOS);
  const rows = sheetToObjects_(sh).reverse().slice(0, Number((filtros && filtros.limit) || 50));
  return { ok: true, rows: rows };
}
