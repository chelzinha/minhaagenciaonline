/**
 * AGF SUPERFRETE — 43_SF_ETIQUETA_AGF.gs
 * Etapa 7: dados para impressão da etiqueta AGF personalizada.
 *
 * Importante:
 * - Não substitui o PDF oficial da SuperFrete.
 * - Retorna dados normalizados para o frontend gerar uma etiqueta experimental em HTML.
 * - O PDF oficial/DACE continua como fallback obrigatório.
 */

function action_sfAdminGetAgfLabelData_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  const orderIdAgf = sanitize_(params.orderIdAgf || params.ORDER_ID_AGF);
  if (!orderIdAgf) throw new Error('ORDER_ID_AGF obrigatório para gerar etiqueta AGF.');

  const etiquetas = sfReadObjects_(SF.SHEETS.ETIQUETAS);
  const row = etiquetas.find(function (e) { return sanitize_(e.ORDER_ID_AGF) === orderIdAgf; });
  if (!row) throw new Error('Etiqueta não encontrada: ' + orderIdAgf);

  const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', row.CLIENTE_ID) || {};
  const remetente = sfFindBy_(SF.SHEETS.REMETENTES, 'REMETENTE_ID', row.REMETENTE_ID) || {};
  const itens = sfReadObjects_(SF.SHEETS.DECLARACAO_ITENS).filter(function (item) {
    return sanitize_(item.ORDER_ID_AGF) === orderIdAgf;
  }).map(function (item) {
    return {
      ITEM_SEQ: sfToMoney_(item.ITEM_SEQ),
      DESCRICAO: sanitize_(item.DESCRICAO),
      QUANTIDADE: sfToMoney_(item.QUANTIDADE),
      VALOR_UNITARIO: sfToMoney_(item.VALOR_UNITARIO),
      VALOR_TOTAL: sfToMoney_(item.VALOR_TOTAL),
      UNIDADE: sanitize_(item.UNIDADE || 'UN')
    };
  });

  const responseObj = safeJsonParse_(row.RESPONSE_SUPERFRETE_JSON || '{}') || {};
  const payloadObj = safeJsonParse_(row.PAYLOAD_PEDIDO_JSON || '{}') || {};
  const contrato = sfFindValueByKeyCandidates_(responseObj, ['contract', 'contract_id', 'contractNumber', 'contract_number', 'numeroContrato', 'numero_contrato'])
    || sfFindValueByKeyCandidates_(payloadObj, ['contract', 'contract_id', 'contractNumber', 'contract_number', 'numeroContrato', 'numero_contrato'])
    || sfFindValueByKeyCandidates_(responseObj, ['postage_contract', 'postageContract', 'contract_code'])
    || '';

  const tracking = sanitize_(row.TRACKING);
  const statusLogistico = sanitize_(row.STATUS_LOGISTICO);
  if (!tracking) {
    sfLog_('WARN', 'SF_ETIQUETA_AGF', 'LABEL_WITHOUT_TRACKING', {
      USUARIO_ID: user.USUARIO_ID,
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: sanitize_(row.ORDER_ID_SUPERFRETE),
      MENSAGEM: 'Etiqueta AGF solicitada sem TRACKING/SRO. Recomenda-se atualizar SuperFrete antes de imprimir.'
    });
  }

  return {
    geradoEm: nowIso_(),
    operadorId: user.USUARIO_ID,
    aviso: 'Etiqueta AGF experimental. Use o PDF oficial da SuperFrete como fallback operacional.',
    etiqueta: {
      ORDER_ID_AGF: orderIdAgf,
      ORDER_ID_SUPERFRETE: sanitize_(row.ORDER_ID_SUPERFRETE),
      STATUS_LOGISTICO: statusLogistico,
      STATUS_FINANCEIRO: sanitize_(row.STATUS_FINANCEIRO),
      SERVICO: sanitize_(row.SERVICO),
      TRANSPORTADORA: sanitize_(row.TRANSPORTADORA || 'Correios'),
      TRACKING: tracking,
      CONTRATO: sanitize_(contrato),
      NF: '0000000000',
      VOLUME: '1/1',
      PESO_G: sfToMoney_(row.PESO),
      PDF_OFICIAL_URL: sanitize_(row.PDF_OFICIAL_URL),
      PDF_AGF_URL: sanitize_(row.PDF_AGF_URL),
      DACE_URL: sanitize_(row.DACE_URL),
      CRIADO_EM: sanitize_(row.CRIADO_EM),
      EMITIDO_EM: sanitize_(row.EMITIDO_EM)
    },
    cliente: {
      CLIENTE_ID: sanitize_(cliente.CLIENTE_ID),
      NOME_EXIBICAO: sanitize_(cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(cliente.RAZAO_SOCIAL),
      DOCUMENTO: sanitize_(cliente.DOCUMENTO),
      LOGO_URL: sanitize_(cliente.LOGO_URL),
      EMAIL: sanitize_(cliente.EMAIL),
      TELEFONE: sanitize_(cliente.TELEFONE)
    },
    remetente: {
      REMETENTE_ID: sanitize_(remetente.REMETENTE_ID),
      NOME_REMETENTE: sanitize_(remetente.NOME_REMETENTE || cliente.NOME_EXIBICAO),
      RAZAO_SOCIAL: sanitize_(remetente.RAZAO_SOCIAL),
      CNPJ_CPF: sanitize_(remetente.CNPJ_CPF || cliente.DOCUMENTO),
      EMAIL: sanitize_(remetente.EMAIL || cliente.EMAIL),
      TELEFONE: sanitize_(remetente.TELEFONE || cliente.TELEFONE),
      CEP: sanitize_(remetente.CEP),
      ENDERECO: sanitize_(remetente.ENDERECO),
      NUMERO: sanitize_(remetente.NUMERO),
      COMPLEMENTO: sanitize_(remetente.COMPLEMENTO),
      BAIRRO: sanitize_(remetente.BAIRRO),
      CIDADE: sanitize_(remetente.CIDADE),
      UF: sanitize_(remetente.UF)
    },
    destinatario: {
      NOME: sanitize_(row.DESTINATARIO_NOME),
      DOCUMENTO: sanitize_(row.DESTINATARIO_DOCUMENTO),
      CEP: sanitize_(row.DESTINATARIO_CEP),
      ENDERECO: sanitize_(row.DESTINATARIO_ENDERECO),
      NUMERO: sanitize_(row.DESTINATARIO_NUMERO),
      COMPLEMENTO: sanitize_(row.DESTINATARIO_COMPLEMENTO),
      BAIRRO: sanitize_(row.DESTINATARIO_BAIRRO),
      CIDADE: sanitize_(row.DESTINATARIO_CIDADE),
      UF: sanitize_(row.DESTINATARIO_UF)
    },
    itens: itens
  };
}

function sfFindValueByKeyCandidates_(obj, candidates) {
  if (!obj || typeof obj !== 'object') return '';
  const wanted = {};
  candidates.forEach(function (k) { wanted[String(k).toLowerCase()] = true; });
  return sfFindValueByKeyCandidatesRec_(obj, wanted, 0);
}

function sfFindValueByKeyCandidatesRec_(obj, wanted, depth) {
  if (!obj || depth > 8) return '';
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = sfFindValueByKeyCandidatesRec_(obj[i], wanted, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof obj !== 'object') return '';
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (wanted[String(k).toLowerCase()]) {
      const value = sanitize_(obj[k]);
      if (value) return value;
    }
  }
  for (let j = 0; j < keys.length; j++) {
    const found = sfFindValueByKeyCandidatesRec_(obj[keys[j]], wanted, depth + 1);
    if (found) return found;
  }
  return '';
}
