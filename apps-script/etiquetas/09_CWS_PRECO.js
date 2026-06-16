/**
 * APP ETIQUETAS AGF — 09_CWS_PRECO.gs
 * Cotação prévia: preço + prazo de entrega.
 *
 * Permite mostrar ao usuário "esse envio vai custar R$ X e chega em
 * Y dias úteis" ANTES de criar a pré-postagem. Evita comprometer
 * etiqueta sem o cliente saber o preço (UX à prova de balcão).
 *
 * Manual capítulo 13: API Preço e API Prazo (síncronas).
 */


function buildPrecoQueryByTipoObjeto_(p) {
  const tipo = upper_(p.tipoObjeto || 'CAIXA');
  const base = {
    psObjeto: String(Math.round(toNumber_(p.pesoG))),
    tpObjeto: resolveCodigoFormatoObjeto_(p.tipoObjeto)
  };

  if (tipo === 'ROLO' || tipo === 'CILINDRO') {
    base.comprimento = String(toNumber_(p.comprimentoCm));
    base.diametro = String(toNumber_(p.diametroCm));
    return base;
  }

  if (tipo === 'ENVELOPE') {
    base.comprimento = String(toNumber_(p.comprimentoCm));
    base.largura = String(toNumber_(p.larguraCm));
    return base;
  }

  base.altura = String(toNumber_(p.alturaCm));
  base.largura = String(toNumber_(p.larguraCm));
  base.comprimento = String(toNumber_(p.comprimentoCm));
  return base;
}

/**
 * Regra isolada da API PREÇO para evitar regressão de Valor Declarado.
 *
 * PAC 03085 rejeita VD=019 com ERP-054. Para PAC, usar 064.
 * Para SEDEX, usar 019.
 *
 * Esta regra fica local no módulo de preço para não depender de helper antigo
 * com o mesmo nome em outro arquivo do projeto Apps Script.
 */
function precoIsPac_(client, codigoServico, servicoLabel) {
  const cod = codigoServico ? normalizeCodigoServico_(codigoServico) : '';
  const label = upper_(servicoLabel || '');
  const pacCliente = client && client.COD_SERVICO_PAC ? normalizeCodigoServico_(client.COD_SERVICO_PAC) : '';

  if (label === 'PAC' || label === 'PAC_CONTRATO' || label === 'PACMINI') return true;
  if (pacCliente && cod === pacCliente) return true;

  return {
    '03085': true,
    '03298': true,
    '04510': true
  }[cod] === true;
}

function precoIsSedex_(client, codigoServico, servicoLabel) {
  const cod = codigoServico ? normalizeCodigoServico_(codigoServico) : '';
  const label = upper_(servicoLabel || '');
  const sedexCliente = client && client.COD_SERVICO_SEDEX ? normalizeCodigoServico_(client.COD_SERVICO_SEDEX) : '';

  if (label === 'SEDEX' || label === 'SEDEX_CONTRATO' || label === 'SEDEX10' || label === 'SEDEX12') return true;
  if (sedexCliente && cod === sedexCliente) return true;

  return {
    '03050': true,
    '03220': true,
    '04014': true,
    '03158': true,
    '03140': true
  }[cod] === true;
}

function precoCodigoValorDeclarado_(client, codigoServico, servicoLabel) {
  if (precoIsPac_(client, codigoServico, servicoLabel)) {
    return CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO_PAC || '064';
  }
  return CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO || '019';
}

function buildServicosAdicionaisPreco_(client, codigoServico, p) {
  const adicionais = [];
  const servicoLabel = p && p.servicoLabel ? p.servicoLabel : p.servico;

  if (upper_(p.ar) === 'SIM') {
    adicionais.push(CFG.CWS.SERVICOS_ADICIONAIS.AVISO_RECEBIMENTO);
  }

  if (upper_(p.maoPropria) === 'SIM') {
    adicionais.push(CFG.CWS.SERVICOS_ADICIONAIS.MAO_PROPRIA);
  }

  if (toNumber_(p.valorDeclarado) > 0) {
    adicionais.push(precoCodigoValorDeclarado_(client, codigoServico, servicoLabel));
  }

  let unicos = adicionais
    .map(function(v) { return sanitize_(v); })
    .filter(Boolean)
    .filter(function(v, i, arr) { return arr.indexOf(v) === i; });

  const vdPadrao = CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO || '019';
  const vdPac = CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO_PAC || '064';

  // Trava anti-regressão: PAC nunca deve sair com VD 019.
  if (precoIsPac_(client, codigoServico, servicoLabel)) {
    unicos = unicos.map(function(code) {
      return code === vdPadrao ? vdPac : code;
    });
  }

  // Trava anti-regressão: SEDEX nunca deve sair com VD PAC 064.
  if (precoIsSedex_(client, codigoServico, servicoLabel)) {
    unicos = unicos.map(function(code) {
      return code === vdPac ? vdPadrao : code;
    });
  }

  return unicos.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
}

function withPrecoRetryForValorDeclarado_(client, codigoServico, queryBase, fnDoRequest, servicoLabel) {
  try {
    return fnDoRequest(queryBase);
  } catch (e) {
    const msg = String(e && e.message || e || '');
    const hasVd = nonEmpty_(queryBase.vlDeclarado) && nonEmpty_(queryBase.servicosAdicionais);
    const invalidAdditional = msg.indexOf('ERP-054') >= 0 && /servi[cç]o adicional/i.test(msg);
    if (!hasVd || !invalidAdditional) throw e;

    const adicionais = String(queryBase.servicosAdicionais).split(',').map(function(s) { return sanitize_(s); }).filter(Boolean);
    const vdPadrao = CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO || '019';
    const vdPac = CFG.CWS.SERVICOS_ADICIONAIS.VALOR_DECLARADO_PAC || '064';
    const isPac = precoIsPac_(client, codigoServico, servicoLabel);
    const isSedex = precoIsSedex_(client, codigoServico, servicoLabel);

    // PAC: se por qualquer motivo saiu 019, corrige para 064 e tenta UMA vez.
    if (isPac && adicionais.indexOf(vdPadrao) >= 0) {
      const corrigidos = adicionais.map(function(code) { return code === vdPadrao ? vdPac : code; });
      return fnDoRequest(Object.assign({}, queryBase, { servicosAdicionais: corrigidos.join(',') }));
    }

    // SEDEX: se por qualquer motivo saiu 064, corrige para 019 e tenta UMA vez.
    if (isSedex && adicionais.indexOf(vdPac) >= 0) {
      const corrigidos = adicionais.map(function(code) { return code === vdPac ? vdPadrao : code; });
      return fnDoRequest(Object.assign({}, queryBase, { servicosAdicionais: corrigidos.join(',') }));
    }

    throw e;
  }
}

function cwsCotar_(client, p) {
  const codigoServico = resolveCodigoServico_(client, p.servico);
  const servicoLabel = p.servicoLabel || p.servico;
  const cepOrigem = digitsOnly_(client.CEP);
  const cepDestino = digitsOnly_(p.destinatarioCep);

  if (!isValidCep_(cepOrigem)) throw new Error('CEP de origem do remetente inválido');
  if (!isValidCep_(cepDestino)) throw new Error('CEP de destino inválido');

  const queryDimensoes = buildPrecoQueryByTipoObjeto_(p);
  const adicionais = buildServicosAdicionaisPreco_(client, codigoServico, Object.assign({}, p, { servicoLabel: servicoLabel }));
  const valorDeclarado = toNumber_(p.valorDeclarado);

  const result = { codigoServico: codigoServico };

  // ===== PRECO =====
  try {
    const queryPreco = Object.assign({
      cepOrigem: cepOrigem,
      cepDestino: cepDestino,
      vlDeclarado: valorDeclarado > 0 ? String(valorDeclarado) : ''
    }, queryDimensoes);

    if (adicionais.length) {
      queryPreco.servicosAdicionais = adicionais.join(',');
    }

    const respPreco = withPrecoRetryForValorDeclarado_(client, codigoServico, queryPreco, function(q) {
      return cwsRequest_(client, {
        service: 'PRECO',
        path: '/v1/nacional/' + codigoServico,
        method: 'get',
        query: q
      });
    }, servicoLabel);

    const j = respPreco.json || {};
    result.preco = {
      pcFinal: sanitize_(j.pcFinal || j.precoFinal || ''),
      pcBase: sanitize_(j.pcBase || ''),
      psCobrado: sanitize_(j.psCobrado || j.pesoCobrado || ''),
      servicosAdicionaisEnviados: adicionais.join(','),
      raw: j
    };
  } catch (e) {
    result.preco = {
      erro: e.message,
      servicosAdicionaisEnviados: adicionais.join(',')
    };
  }

  // ===== PRAZO =====
  try {
    const respPrazo = cwsRequest_(client, {
      service: 'PRAZO',
      path: '/v1/nacional/' + codigoServico,
      method: 'get',
      query: {
        cepOrigem: cepOrigem,
        cepDestino: cepDestino
      }
    });

    const j = respPrazo.json || {};
    result.prazo = {
      prazoEntrega: toNumber_(j.prazoEntrega || j.prazo || 0),
      dataMaxima: sanitize_(j.dataMaxima || ''),
      entregaDomiciliar: sanitize_(j.entregaDomiciliar || ''),
      entregaSabado: sanitize_(j.entregaSabado || ''),
      raw: j
    };
  } catch (e) {
    result.prazo = { erro: e.message };
  }

  return result;
}

/**
 * AÇÃO: cotar
 */
function action_cotar_(params) {
  const client = getFullClientFromSession_(params.sessionToken);
  return cwsCotar_(client, params.payload || {});
}

/**
 * Cotação múltipla — todas as modalidades habilitadas no contrato
 * do cliente (PAC e SEDEX, pelas colunas COD_SERVICO_PAC e
 * COD_SERVICO_SEDEX da planilha CLIENTES_APP).
 *
 * Uso pelo frontend v2.2.0: na etapa 1 da tela Nova, o usuário
 * informa só CEP destino, tipo, peso e dimensões e recebe todas
 * as opções de serviço. Depois escolhe uma e preenche os demais
 * dados na etapa 2.
 *
 * Retorno:
 *   {
 *     opcoes: [
 *       { servico: "PAC", codigoServico: "03298",
 *         preco: "23.50", prazoDias: 4, dataMaxima: "...",
 *         ok: true, erro: null },
 *       { servico: "SEDEX", codigoServico: "03220",
 *         preco: "48.90", prazoDias: 1, ok: true, erro: null }
 *     ],
 *     totalOk: 2,
 *     totalErro: 0
 *   }
 *
 * Opções com erro vem com ok:false e a mensagem em erro — o frontend
 * decide se mostra como card desabilitado ou oculta.
 */
function cwsCotarTodos_(client, p) {
  const opcoes = [];
  const modalidades = [];

  // Monta a lista de modalidades habilitadas pro cliente
  if (nonEmpty_(client.COD_SERVICO_PAC)) {
    modalidades.push({ servico: 'PAC', codigoServico: sanitize_(client.COD_SERVICO_PAC) });
  }
  if (nonEmpty_(client.COD_SERVICO_SEDEX)) {
    modalidades.push({ servico: 'SEDEX', codigoServico: sanitize_(client.COD_SERVICO_SEDEX) });
  }

  if (modalidades.length === 0) {
    throw new Error(
      'Nenhum serviço Correios cadastrado para este cliente. ' +
      'Preencha COD_SERVICO_PAC e/ou COD_SERVICO_SEDEX na planilha CLIENTES_APP.'
    );
  }

  let totalOk = 0, totalErro = 0;

  // Cota cada modalidade. Cada uma é independente — se uma falhar,
  // as outras continuam. Retornamos o status por modalidade.
  modalidades.forEach(m => {
    try {
      const cotacao = cwsCotar_(client, {
        servico: m.servico,
        servicoLabel: m.servico,
        destinatarioCep: p.destinatarioCep,
        pesoG: p.pesoG,
        comprimentoCm: p.comprimentoCm,
        larguraCm: p.larguraCm,
        alturaCm: p.alturaCm,
        tipoObjeto: p.tipoObjeto,
        valorDeclarado: p.valorDeclarado,
        ar: p.ar,
        maoPropria: p.maoPropria
      });

      const precoOk = cotacao.preco && !cotacao.preco.erro;
      const prazoOk = cotacao.prazo && !cotacao.prazo.erro;

      if (precoOk && prazoOk) {
        opcoes.push({
          servico: m.servico,
          codigoServico: m.codigoServico,
          preco: cotacao.preco.pcFinal || cotacao.preco.pcBase || '',
          precoBase: cotacao.preco.pcBase || '',
          pesoCobrado: cotacao.preco.psCobrado || '',
          servicosAdicionaisEnviados: cotacao.preco.servicosAdicionaisEnviados || '',
          prazoDias: cotacao.prazo.prazoEntrega || 0,
          dataMaxima: cotacao.prazo.dataMaxima || '',
          entregaDomiciliar: cotacao.prazo.entregaDomiciliar || '',
          entregaSabado: cotacao.prazo.entregaSabado || '',
          ok: true,
          erro: null
        });
        totalOk++;
      } else {
        const erros = [];
        if (!precoOk) erros.push('preço: ' + (cotacao.preco && cotacao.preco.erro || 'sem retorno'));
        if (!prazoOk) erros.push('prazo: ' + (cotacao.prazo && cotacao.prazo.erro || 'sem retorno'));
        opcoes.push({
          servico: m.servico,
          codigoServico: m.codigoServico,
          ok: false,
          erro: erros.join(' | '),
          servicosAdicionaisEnviados: cotacao.preco && cotacao.preco.servicosAdicionaisEnviados || ''
        });
        totalErro++;
      }
    } catch (e) {
      opcoes.push({
        servico: m.servico,
        codigoServico: m.codigoServico,
        ok: false,
        erro: e.message
      });
      totalErro++;
    }
  });

  return {
    opcoes: opcoes,
    totalOk: totalOk,
    totalErro: totalErro
  };
}

/**
 * AÇÃO: cotarTodos
 */
function action_cotarTodos_(params) {
  const client = getFullClientFromSession_(params.sessionToken);
  return cwsCotarTodos_(client, params.payload || {});
}