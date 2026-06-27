function parseJsonSafe_(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch (err) {
    return fallback;
  }
}

function toNumber_(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function digitsOnly_(value) {
  return String(value || '').replace(/\D+/g, '');
}

function kgToGrams_(kg) {
  return Math.round(toNumber_(kg) * 1000);
}

function money2_(value) {
  return Math.round(toNumber_(value) * 100) / 100;
}

function provinceToUf_(province) {
  const map = {
    'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA', 'CEARA': 'CE',
    'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO', 'MARANHAO': 'MA',
    'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', 'PARA': 'PA',
    'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI', 'RIO DE JANEIRO': 'RJ',
    'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', 'RONDONIA': 'RO', 'RORAIMA': 'RR',
    'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', 'SERGIPE': 'SE', 'TOCANTINS': 'TO'
  };

  const raw = String(province || '').trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();

  const key = raw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return map[key] || raw.toUpperCase();
}

function getOrderRowById_(orderId) {
  return sheetRowsAsObjects_(CFG.SHEETS.ORDERS).find(function(r) {
    return String(r.ORDER_ID) === String(orderId);
  }) || null;
}

function getItemsByOrderId_(orderId) {
  return sheetRowsAsObjects_(CFG.SHEETS.ORDER_ITEMS).filter(function(r) {
    return String(r.ORDER_ID) === String(orderId);
  });
}

function getLatestOrderRow_() {
  const rows = sheetRowsAsObjects_(CFG.SHEETS.ORDERS);
  if (!rows.length) return null;
  rows.sort(function(a, b) {
    return new Date(b.CREATED_AT || 0).getTime() - new Date(a.CREATED_AT || 0).getTime();
  });
  return rows[0] || null;
}

function buildDeclarationItemsFromRows_(orderRow, itemRows) {
  const parsed = parseJsonSafe_(orderRow.DECLARATION_ITEMS_JSON, null);
  if (Array.isArray(parsed) && parsed.length) return parsed;

  return itemRows.map(function(item, idx) {
    const qty = toNumber_(item.QUANTITY);
    const unitPrice = toNumber_(item.PRICE);
    return {
      line: idx + 1,
      sku: item.SKU || '',
      description: item.NAME || '',
      quantity: qty,
      unit_price: money2_(unitPrice),
      total_price: money2_(qty * unitPrice),
      weight: toNumber_(item.WEIGHT),
      width: toNumber_(item.WIDTH),
      height: toNumber_(item.HEIGHT),
      depth: toNumber_(item.DEPTH)
    };
  });
}

function buildItemsPayload_(itemRows) {
  return itemRows.map(function(item, idx) {
    const qty = toNumber_(item.QUANTITY);
    const price = toNumber_(item.PRICE);
    return {
      lineKey: item.LINE_KEY || String(idx + 1),
      sku: item.SKU || '',
      name: item.NAME || '',
      quantity: qty,
      unitPrice: money2_(price),
      totalPrice: money2_(qty * price),
      weightKg: toNumber_(item.WEIGHT),
      widthCm: toNumber_(item.WIDTH),
      heightCm: toNumber_(item.HEIGHT),
      depthCm: toNumber_(item.DEPTH)
    };
  });
}

function buildFiscalPayload_(orderRow, itemRows) {
  const declarationItems = buildDeclarationItemsFromRows_(orderRow, itemRows);
  if (String(orderRow.DOC_TYPE || '').toUpperCase() === 'NFE' && (orderRow.INVOICE_KEY || orderRow.INVOICE_LINK)) {
    return {
      docType: 'NFE',
      source: orderRow.DOC_SOURCE || 'METAFIELD_NFE_LIST',
      invoice: {
        key: orderRow.INVOICE_KEY || '',
        link: orderRow.INVOICE_LINK || '',
        raw: parseJsonSafe_(orderRow.INVOICE_JSON, [])
      },
      declaration: null
    };
  }

  return {
    docType: 'DCE',
    source: orderRow.DOC_SOURCE || 'ORDER_ITEMS',
    invoice: null,
    declaration: {
      items: declarationItems,
      totalValue: money2_(declarationItems.reduce(function(sum, item) {
        return sum + toNumber_(item.total_price);
      }, 0))
    }
  };
}

function buildPackagingSuggestion_(orderRow, itemRows) {
  const items = buildItemsPayload_(itemRows);
  let pesoG = kgToGrams_(orderRow.ORDER_WEIGHT);
  if (!pesoG) {
    pesoG = Math.round(items.reduce(function(sum, item) {
      return sum + (toNumber_(item.weightKg) * toNumber_(item.quantity) * 1000);
    }, 0));
  }

  const expanded = [];
  items.forEach(function(item) {
    const qty = Math.max(1, toNumber_(item.quantity));
    for (let i = 0; i < qty; i++) {
      expanded.push({
        widthCm: toNumber_(item.widthCm),
        heightCm: toNumber_(item.heightCm),
        depthCm: toNumber_(item.depthCm)
      });
    }
  });

  let largura = 0;
  let altura = 0;
  let comprimento = 0;

  if (expanded.length === 1) {
    largura = expanded[0].widthCm;
    altura = expanded[0].heightCm;
    comprimento = expanded[0].depthCm;
  } else if (expanded.length > 1) {
    largura = expanded.reduce(function(m, x) { return Math.max(m, x.widthCm); }, 0);
    altura = expanded.reduce(function(m, x) { return Math.max(m, x.heightCm); }, 0);
    comprimento = expanded.reduce(function(sum, x) { return sum + x.depthCm; }, 0);
  }

  largura = Math.max(1, Math.round(largura || 1));
  altura = Math.max(1, Math.round(altura || 1));
  comprimento = Math.max(1, Math.round(comprimento || 1));
  pesoG = Math.max(1, Math.round(pesoG || 1));

  return {
    suggested: true,
    mode: expanded.length <= 1 ? 'single_item' : 'heuristic_multi_item',
    tipoObjeto: 'CAIXA',
    pesoG: pesoG,
    comprimentoCm: comprimento,
    larguraCm: largura,
    alturaCm: altura,
    diametroCm: 0
  };
}

/**
 * Normaliza um telefone brasileiro para o formato aceito pelos Correios:
 * no máximo 11 dígitos (DDD + 9). A Nuvemshop costuma enviar o número com o
 * código do país (ex: "+5585988888489" -> 13 dígitos), o que faz a pré-postagem
 * falhar com "Excedeu tamanho celular destinatário.".
 */
function normalizeCelularBr_(value) {
  var d = digitsOnly_(value);
  if (!d) return '';
  // Remove o código do país (55) quando vier com 12 ou 13 dígitos (55 + DDD + 8/9).
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  // Trava final: nunca enviar mais que 11 dígitos.
  if (d.length > 11) d = d.slice(-11);
  return d;
}

function buildDestinatarioPayload_(orderRow) {
  const rawOrder = parseJsonSafe_(orderRow.RAW_JSON, {});
  const rawCustomer = rawOrder.customer || {};
  const rawDefaultAddress = rawCustomer.default_address || {};

  const telefone = normalizeCelularBr_(orderRow.SHIPPING_PHONE) || normalizeCelularBr_(orderRow.CUSTOMER_PHONE) || normalizeCelularBr_(rawDefaultAddress.phone) || '';

  return {
    nome: String(orderRow.SHIPPING_NAME || orderRow.CUSTOMER_NAME || ''),
    documento: digitsOnly_(orderRow.CUSTOMER_DOCUMENT),
    email: String(orderRow.CUSTOMER_EMAIL || ''),
    telefone: telefone,
    cep: digitsOnly_(orderRow.ZIP),
    endereco: String(orderRow.ADDRESS || ''),
    numero: String(orderRow.NUMBER || ''),
    complemento: String(orderRow.FLOOR || ''),
    bairro: String(orderRow.LOCALITY || ''),
    cidade: String(orderRow.CITY || ''),
    uf: provinceToUf_(orderRow.PROVINCE)
  };
}

function buildFretePayload_(orderRow) {
  return {
    raw: orderRow.SHIPPING_METHOD_RAW || '',
    service: String(orderRow.SHIPPING_SERVICE || '').toUpperCase(),
    optionCode: orderRow.SHIPPING_OPTION_CODE || '',
    optionName: orderRow.SHIPPING_OPTION_NAME || '',
    carrierCode: orderRow.SHIPPING_CARRIER_CODE || '',
    carrierName: orderRow.SHIPPING_CARRIER_NAME || ''
  };
}

function buildConnectorPayloadByOrderId_(orderId, overrides) {
  const orderRow = getOrderRowById_(orderId);
  if (!orderRow) throw new Error('Pedido não encontrado na aba ORDERS: ' + orderId);

  const itemRows = getItemsByOrderId_(orderId);
  const destinatario = buildDestinatarioPayload_(orderRow);
  const frete = buildFretePayload_(orderRow);
  const fiscal = buildFiscalPayload_(orderRow, itemRows);
  const items = buildItemsPayload_(itemRows);
  const embalagem = buildPackagingSuggestion_(orderRow, itemRows);
  const ov = overrides || {};

  const valorDeclarado = fiscal.invoice
    ? money2_(toNumber_(orderRow.TOTAL))
    : money2_(toNumber_(fiscal.declaration ? fiscal.declaration.totalValue : orderRow.TOTAL));

  const payloadAppPostagens = {
    destinatarioNome: destinatario.nome,
    destinatarioCpfCnpj: destinatario.documento,
    destinatarioCelular: destinatario.telefone,
    destinatarioEmail: destinatario.email,
    destinatarioCep: destinatario.cep,
    destinatarioEndereco: destinatario.endereco,
    destinatarioNumero: destinatario.numero,
    destinatarioComplemento: destinatario.complemento,
    destinatarioBairro: destinatario.bairro,
    destinatarioCidade: destinatario.cidade,
    destinatarioUf: destinatario.uf,

    servico: ov.servico || frete.service || '',
    tipoObjeto: ov.tipoObjeto || embalagem.tipoObjeto,
    pesoG: ov.pesoG != null ? ov.pesoG : embalagem.pesoG,
    comprimentoCm: ov.comprimentoCm != null ? ov.comprimentoCm : embalagem.comprimentoCm,
    larguraCm: ov.larguraCm != null ? ov.larguraCm : embalagem.larguraCm,
    alturaCm: ov.alturaCm != null ? ov.alturaCm : embalagem.alturaCm,
    diametroCm: ov.diametroCm != null ? ov.diametroCm : embalagem.diametroCm,
    valorDeclarado: ov.valorDeclarado != null ? ov.valorDeclarado : valorDeclarado,

    ar: ov.ar || 'NAO',
    maoPropria: ov.maoPropria || 'NAO',
    observacao: ov.observacao || ('Pedido Nuvemshop #' + (orderRow.ORDER_NUMBER || orderRow.ORDER_ID)),
    tipoRotulo: ov.tipoRotulo || 'PADRAO',
    formatoRotulo: ov.formatoRotulo || 'PDF',

    documentoTipo: fiscal.docType,
    documentoChave: fiscal.invoice ? (fiscal.invoice.key || '') : '',
    documentoLink: fiscal.invoice ? (fiscal.invoice.link || '') : '',
    notaFiscalJson: fiscal.invoice ? JSON.stringify(fiscal.invoice.raw || []) : '[]',
    declaracaoConteudoJson: fiscal.declaration ? JSON.stringify(fiscal.declaration) : '[]',

    pedidoOrigem: 'NUVEMSHOP',
    pedidoNuvemshopId: String(orderRow.ORDER_ID || ''),
    pedidoNuvemshopNumero: String(orderRow.ORDER_NUMBER || ''),
    shippingOptionCode: frete.optionCode,
    shippingOptionName: frete.optionName,
    shippingCarrierCode: frete.carrierCode,
    shippingCarrierName: frete.carrierName,
    shippingMethodRaw: frete.raw
  };

  return {
    source: 'NUVEMSHOP',
    external: {
      storeId: String(orderRow.STORE_ID || ''),
      orderId: String(orderRow.ORDER_ID || ''),
      orderNumber: String(orderRow.ORDER_NUMBER || ''),
      createdAt: orderRow.CREATED_AT || '',
      updatedAt: orderRow.UPDATED_AT || '',
      status: orderRow.STATUS || '',
      paymentStatus: orderRow.PAYMENT_STATUS || '',
      shippingStatus: orderRow.SHIPPING_STATUS || ''
    },
    destinatario: destinatario,
    frete: frete,
    fiscal: fiscal,
    items: items,
    embalagem: embalagem,
    payloadAppPostagens: payloadAppPostagens
  };
}

function buildConnectorPayloadLatestOrder_() {
  const latest = getLatestOrderRow_();
  if (!latest) throw new Error('Nenhum pedido encontrado na aba ORDERS.');
  return buildConnectorPayloadByOrderId_(latest.ORDER_ID);
}

function runBuildFinalPayloadLatestOrder() {
  const payload = buildConnectorPayloadLatestOrder_();
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}
