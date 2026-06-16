/***************************************
 * CAIXA METRO - MODELO PLANILHA FIXA
 * RECEITAS + DESPESAS
 * + EXPORTAÇÃO APPEND-ONLY PARA PLUGA
 ***************************************/

const CFG = {
  TIMEZONE: 'America/Fortaleza',

  RECEITAS_SPREADSHEET_ID: '1cEin_BQog_CmqGKfJBuypYN-dzFvByISmJGlP2j9_BU',
  DESPESAS_SPREADSHEET_ID: '1nT8_d1I4WgAusROD7CyulGDtsrymSd1fuulKZYBAsUk',

  CLOSE_EMAIL_TO: 'agfjosebonifacio@gmail.com',

  SHEET_NAME: 'Lancamentos',
  HISTORY_SHEET: '_historico',
  META_SHEET: '_meta',
  CONTROL_SHEET: '_controle',

  // Aba append-only para o Pluga.
  // Configure a automação do Pluga para monitorar esta aba,
  // e NÃO a aba "Lancamentos".
  PLUGA_SHEET: 'Pluga_Export',

  DEFAULT_CLIENT_NAME: 'GAS SHOPPING METRO',
  COST_CENTER: 'Metro (Projeto Rachel)',

  RECEITAS: {
    EMPTY_DESCRIPTION: 'Venda Metro',
    CATEGORY: '1.3.3. Balcao (Shopping Metro)',
    PAYMENT_OPTIONS: ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito'],
    ACCOUNT_OPTIONS: ['Caixa', 'InfinitePay', 'Santander', 'BTG'],
    ACCOUNT_MAP: {
      'Caixa': 'CAIXA À VISTA',
      'Santander': 'SANTANDER AGUANAMBI',
      'InfinitePay': 'Cloudwalk Instituição de Pagamento',
      'BTG': 'BTG Pactual Conta Corrente'
    },
    HEADERS: [
      'Identificador do cliente',
      'Nome do cliente',
      'Código de referência',
      'Data de competência',
      'Data de vencimento',
      'Data prevista',
      'Recorrência',
      'Quantidade de recorrência',
      'Descrição',
      'Origem do lançamento',
      'Situação',
      'Agendado',
      'Valor original da parcela (R$)',
      'Forma de recebimento',
      'Valor recebido da parcela (R$)',
      'Juros realizado (R$)',
      'Multa realizado (R$)',
      'Desconto realizado (R$)',
      'Valor total recebido da parcela (R$)',
      'Valor da parcela em aberto (R$)',
      'Juros previsto (R$)',
      'Multa previsto (R$)',
      'Desconto previsto (R$)',
      'Valor total da parcela em aberto (R$)',
      'Conta bancária',
      'Data do último pagamento',
      'Nota fiscal',
      'Observações',
      'Categoria 1',
      'Valor na Categoria 1',
      'Centro de Custo 1',
      'Valor no Centro de Custo 1'
    ]
  },

  DESPESAS: {
    EMPTY_DESCRIPTION: 'Despesa administrativa',
    FIXED_PAYMENT: 'Dinheiro',
    FIXED_BANK_ACCOUNT: 'CAIXA À VISTA',
    CATEGORY_OPTIONS: ['Copa', 'Escritório', 'Taxi', 'Outros'],
    CATEGORY_MAP: {
      'Copa': '3.6.3. Copa e Cozinha',
      'Escritório': '3.6.4. Material de Escritório',
      'Taxi': '3.4.6. Terceirizados coletas',
      'Outros': '3.6.6. Outras despesas administrativas'
    },
    HEADERS: [
      'Identificador do fornecedor',
      'Nome do fornecedor',
      'Código de referência',
      'Data de competência',
      'Data de vencimento',
      'Data prevista',
      'Recorrência',
      'Quantidade de recorrência',
      'Descrição',
      'Origem do lançamento',
      'Situação',
      'Agendado',
      'Valor original da parcela (R$)',
      'Forma de pagamento',
      'Valor pago da parcela (R$)',
      'Juros pago (R$)',
      'Multa paga (R$)',
      'Desconto pago (R$)',
      'Valor total pago da parcela (R$)',
      'Valor da parcela em aberto (R$)',
      'Juros previsto (R$)',
      'Multa previsto (R$)',
      'Desconto previsto (R$)',
      'Valor total da parcela em aberto (R$)',
      'Conta bancária',
      'Data do último pagamento',
      'Nota fiscal',
      'Observações',
      'Categoria 1',
      'Valor na Categoria 1',
      'Centro de Custo 1',
      'Valor no Centro de Custo 1'
    ]
  },

  META_HEADERS: ['entry_id', 'mode', 'sheet_row', 'date_iso'],
  CONTROL_HEADERS: ['current_date_iso', 'last_rotation_at']
};


/* =====================================
 * ENTRYPOINTS
 * ===================================== */

function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || '').trim();

  if (action === 'init') return jsonOutput_(init_());
  if (action === 'summary') return jsonOutput_(getSummary_(String(p.date || '').trim() || todayISO_()));
  if (action === 'ping') return jsonOutput_(ping_());

  return jsonOutput_({
    ok: true,
    message: 'API Caixa Metro online.',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const data = parseRequestBody_(e);
    const action = String(data.action || '').trim();

    switch (action) {
      case 'init':
        return jsonOutput_(init_());
      case 'save':
        return jsonOutput_(saveEntry_(data.payload));
      case 'summary':
        return jsonOutput_(getSummary_(data.date));
      case 'close':
        return jsonOutput_(closeCash_(data.date));
      case 'delete':
        return jsonOutput_(deleteEntry_(data));
      case 'ping':
        return jsonOutput_(ping_());
      default:
        return jsonOutput_(errorResponse_('Ação inválida ou não informada.'));
    }
  } catch (err) {
    return jsonOutput_(errorResponse_(err.message || String(err), 'doPost'));
  }
}


/* =====================================
 * SUPPORT
 * ===================================== */

function autorizar() {
  DriveApp.getRootFolder();
  GmailApp.getAliases();
  SpreadsheetApp.openById(CFG.RECEITAS_SPREADSHEET_ID);
  SpreadsheetApp.openById(CFG.DESPESAS_SPREADSHEET_ID);
  return 'OK';
}

function ping_() {
  return {
    ok: true,
    today: todayISO_(),
    receitasSpreadsheetId: CFG.RECEITAS_SPREADSHEET_ID,
    despesasSpreadsheetId: CFG.DESPESAS_SPREADSHEET_ID,
    plugaSheet: CFG.PLUGA_SHEET
  };
}


/* =====================================
 * INIT
 * ===================================== */

function init_() {
  const today = todayISO_();

  return {
    ok: true,
    today: today,

    paymentOptions: CFG.RECEITAS.PAYMENT_OPTIONS,
    accountOptions: CFG.RECEITAS.ACCOUNT_OPTIONS,
    expenseCategoryOptions: CFG.DESPESAS.CATEGORY_OPTIONS,

    payments: CFG.RECEITAS.PAYMENT_OPTIONS,
    accounts: CFG.RECEITAS.ACCOUNT_OPTIONS,
    expenseCategories: CFG.DESPESAS.CATEGORY_OPTIONS,

    summary: getSummary_(today)
  };
}


/* =====================================
 * CORE
 * ===================================== */

function saveEntry_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    validatePayload_(payload);

    const mode = normalizeMode_(payload.mode);
    const dateIso = normalizeIsoDate_(payload.date);
    const entryId = normalizeText_(payload.entryId || '');

    const env = prepareEnvironment_(mode, dateIso);

    if (entryId) {
      updateEntry_(env, payload, entryId);
    } else {
      insertEntry_(env, payload);
    }

    return getSummary_(dateIso);
  } finally {
    lock.releaseLock();
  }
}

function deleteEntry_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const mode = normalizeMode_(data.mode);
    const dateIso = normalizeIsoDate_(data.date);
    const entryId = normalizeText_(data.entryId || '');

    if (!entryId) {
      throw new Error('Entry ID não informado.');
    }

    const env = prepareEnvironment_(mode, dateIso);
    const metaRows = getMetaObjects_(env.metaSheet);
    const meta = metaRows.find(r => r.entryId === entryId);

    if (!meta) {
      throw new Error('Registro não encontrado.');
    }

    const lastRow = env.lancSheet.getLastRow();
    if (meta.sheetRow >= 2 && meta.sheetRow <= lastRow) {
      env.lancSheet.deleteRow(meta.sheetRow);
    }

    rebuildMetaSheetAfterDelete_(env.metaSheet, entryId);

    return getSummary_(dateIso);
  } finally {
    lock.releaseLock();
  }
}

function closeCash_(dateIso) {
  const date = normalizeIsoDate_(dateIso);
  const summary = getSummary_(date);

  const subject = 'Caixa METRO Data ' + isoToBR_(date);
  const body = [
    'Fechamento de caixa',
    '',
    'Data: ' + summary.date,
    'Receitas: R$ ' + summary.receitas.total,
    'Despesas: R$ ' + summary.despesas.total,
    'Saldo: R$ ' + summary.saldo
  ].join('\n');

  GmailApp.sendEmail(CFG.CLOSE_EMAIL_TO, subject, body);

  return summary;
}

function getSummary_(dateIso) {
  const date = normalizeIsoDate_(dateIso);

  const receitas = summarizeMode_('receitas', date);
  const despesas = summarizeMode_('despesas', date);

  return {
    ok: true,
    date: isoToBR_(date),
    dateIso: date,
    receitas: receitas,
    despesas: despesas,
    saldo: formatMoney_(receitas.totalNumber + despesas.totalNumber)
  };
}


/* =====================================
 * SAVE HELPERS
 * ===================================== */

function insertEntry_(env, payload) {
  const entryId = Utilities.getUuid();
  const row = buildRow_(env.mode, payload, env.dateIso);

  env.lancSheet.appendRow(row);

  const sheetRow = env.lancSheet.getLastRow();
  appendMetaRow_(env.metaSheet, entryId, env.mode, sheetRow, env.dateIso);

  // Exportação append-only para o Pluga.
  appendPlugaExportRow_(env.plugaSheet, entryId, env.mode, payload, env.dateIso);
}

function updateEntry_(env, payload, entryId) {
  const metaRows = getMetaObjects_(env.metaSheet);
  const meta = metaRows.find(r => r.entryId === entryId);

  if (!meta) {
    throw new Error('Registro não encontrado para edição.');
  }

  const row = buildRow_(env.mode, payload, env.dateIso);
  env.lancSheet.getRange(meta.sheetRow, 1, 1, row.length).setValues([row]);

  // IMPORTANTE:
  // Não atualizamos a aba do Pluga em edição para evitar que a automação
  // interprete a alteração como um novo lançamento.
}

function buildRow_(mode, payload, dateIso) {
  const dateBR = isoToBR_(dateIso);
  const value = Math.abs(parseValue_(payload.value));

  if (mode === 'receitas') {
    const description = buildReceitaDescription_(payload.description, payload.payment);
    const payment = normalizeText_(payload.payment);
    const account = normalizeText_(payload.account);
    const bank = mapReceitaBankAccount_(account);
    const money = formatMoney_(value);

    return [
      '',                         // Identificador do cliente
      CFG.DEFAULT_CLIENT_NAME,    // Nome do cliente
      '',                         // Código de referência
      dateBR,                     // Data de competência
      dateBR,                     // Data de vencimento
      dateBR,                     // Data prevista
      'Sem recorrência',          // Recorrência
      '',                         // Quantidade de recorrência
      description,                // Descrição
      'Lançamento Financeiro',    // Origem do lançamento
      'Em aberto',                // Situação
      '-',                        // Agendado
      money,                      // Valor original da parcela (R$)
      payment,                    // Forma de recebimento
      money,                      // Valor recebido da parcela (R$)
      '0,00',                     // Juros realizado (R$)
      '0,00',                     // Multa realizado (R$)
      '0,00',                     // Desconto realizado (R$)
      '0,00',                     // Valor total recebido da parcela (R$)
      money,                      // Valor da parcela em aberto (R$)
      '0,00',                     // Juros previsto (R$)
      '0,00',                     // Multa previsto (R$)
      '0,00',                     // Desconto previsto (R$)
      money,                      // Valor total da parcela em aberto (R$)
      bank,                       // Conta bancária
      dateBR,                     // Data do último pagamento
      '',                         // Nota fiscal
      description,                // Observações
      CFG.RECEITAS.CATEGORY,      // Categoria 1
      money,                      // Valor na Categoria 1
      CFG.COST_CENTER,            // Centro de Custo 1
      money                       // Valor no Centro de Custo 1
    ];
  }

  const description = normalizeText_(payload.description) || CFG.DESPESAS.EMPTY_DESCRIPTION;
  const category = mapDespesaCategory_(normalizeText_(payload.expenseCategory));
  const money = formatMoney_(-value);

  return [
    '',                         // Identificador do fornecedor
    CFG.DEFAULT_CLIENT_NAME,    // Nome do fornecedor
    '',                         // Código de referência
    dateBR,                     // Data de competência
    dateBR,                     // Data de vencimento
    dateBR,                     // Data prevista
    'Sem recorrência',          // Recorrência
    '',                         // Quantidade de recorrência
    description,                // Descrição
    'Lançamento Financeiro',    // Origem do lançamento
    'Em aberto',                // Situação
    '-',                        // Agendado
    money,                      // Valor original da parcela (R$)
    CFG.DESPESAS.FIXED_PAYMENT, // Forma de pagamento
    money,                      // Valor pago da parcela (R$)
    '0,00',                     // Juros pago (R$)
    '0,00',                     // Multa paga (R$)
    '0,00',                     // Desconto pago (R$)
    '0,00',                     // Valor total pago da parcela (R$)
    money,                      // Valor da parcela em aberto (R$)
    '0,00',                     // Juros previsto (R$)
    '0,00',                     // Multa previsto (R$)
    '0,00',                     // Desconto previsto (R$)
    money,                      // Valor total da parcela em aberto (R$)
    CFG.DESPESAS.FIXED_BANK_ACCOUNT, // Conta bancária
    dateBR,                     // Data do último pagamento
    '',                         // Nota fiscal
    description,                // Observações
    category,                   // Categoria 1
    money,                      // Valor na Categoria 1
    CFG.COST_CENTER,            // Centro de Custo 1
    money                       // Valor no Centro de Custo 1
  ];
}

function appendPlugaExportRow_(plugaSheet, entryId, mode, payload, dateIso) {
  const row = buildPlugaExportRow_(mode, payload, dateIso);
  plugaSheet.appendRow(row);
}

function buildPlugaExportRow_(mode, payload, dateIso) {
  const dateBR = isoToBR_(dateIso);
  const value = Math.abs(parseValue_(payload.value));

  if (mode === 'receitas') {
    return buildRow_(mode, payload, dateIso);
  }

  const description = normalizeText_(payload.description) || CFG.DESPESAS.EMPTY_DESCRIPTION;
  const category = mapDespesaCategory_(normalizeText_(payload.expenseCategory));
  const money = formatMoney_(value);

  return [
    '',                         // Identificador do fornecedor
    CFG.DEFAULT_CLIENT_NAME,    // Nome do fornecedor
    '',                         // Código de referência
    dateBR,                     // Data de competência
    dateBR,                     // Data de vencimento
    dateBR,                     // Data prevista
    'Sem recorrência',          // Recorrência
    '',                         // Quantidade de recorrência
    description,                // Descrição
    'Lançamento Financeiro',    // Origem do lançamento
    'Em aberto',                // Situação
    '-',                        // Agendado
    money,                      // Valor original da parcela (R$)
    CFG.DESPESAS.FIXED_PAYMENT, // Forma de pagamento
    money,                      // Valor pago da parcela (R$)
    '0,00',                     // Juros pago (R$)
    '0,00',                     // Multa paga (R$)
    '0,00',                     // Desconto pago (R$)
    '0,00',                     // Valor total pago da parcela (R$)
    money,                      // Valor da parcela em aberto (R$)
    '0,00',                     // Juros previsto (R$)
    '0,00',                     // Multa previsto (R$)
    '0,00',                     // Desconto previsto (R$)
    money,                      // Valor total da parcela em aberto (R$)
    CFG.DESPESAS.FIXED_BANK_ACCOUNT, // Conta bancária
    dateBR,                     // Data do último pagamento
    '',                         // Nota fiscal
    description,                // Observações
    category,                   // Categoria 1
    money,                      // Valor na Categoria 1
    CFG.COST_CENTER,            // Centro de Custo 1
    money                       // Valor no Centro de Custo 1
  ];
}


/* =====================================
 * SUMMARY HELPERS
 * ===================================== */

function summarizeMode_(mode, dateIso) {
  const env = prepareEnvironment_(mode, dateIso);
  const rows = env.lancSheet.getDataRange().getDisplayValues();
  const metaRows = getMetaObjects_(env.metaSheet);
  const metaMap = {};

  metaRows.forEach(m => {
    metaMap[m.sheetRow] = m.entryId;
  });

  let totalNumber = 0;
  const entries = [];

  for (let i = 1; i < rows.length; i++) {
    const sheetRow = i + 1;
    const row = rows[i];

    const valueStr = row[12] || '0,00';
    const valueNum = parseValue_(valueStr);
    totalNumber += valueNum;

    const payment = row[13] || '';
    const bank = row[24] || '';
    const category = row[28] || '';

    entries.push({
      entryId: metaMap[sheetRow] || '',
      sheetRow: sheetRow,
      mode: mode,
      dateIso: dateIso,
      description: row[8] || '',
      value: valueStr,
      payment: payment,
      account: mode === 'receitas' ? mapReceitaBankToAccountLabel_(bank) : (bank || CFG.DESPESAS.FIXED_BANK_ACCOUNT || 'Caixa'),
      category: mode === 'despesas' ? mapDespesaCategoryToShortLabel_(category) : ''
    });
  }

  return {
    total: formatMoney_(totalNumber),
    totalNumber: totalNumber,
    count: Math.max(0, rows.length - 1),
    entries: entries
  };
}


/* =====================================
 * PREPARE ENVIRONMENT
 * ===================================== */

function prepareEnvironment_(mode, dateIso) {
  const spreadsheetId = mode === 'receitas'
    ? CFG.RECEITAS_SPREADSHEET_ID
    : CFG.DESPESAS_SPREADSHEET_ID;

  const headers = mode === 'receitas'
    ? CFG.RECEITAS.HEADERS
    : CFG.DESPESAS.HEADERS;

  const ss = SpreadsheetApp.openById(spreadsheetId);

  const lancSheet = getOrCreateSheet_(ss, CFG.SHEET_NAME, headers);
  const historySheet = getOrCreateSheet_(ss, CFG.HISTORY_SHEET, headers);
  const metaSheet = getOrCreateSheet_(ss, CFG.META_SHEET, CFG.META_HEADERS);
  const controlSheet = getOrCreateSheet_(ss, CFG.CONTROL_SHEET, CFG.CONTROL_HEADERS);
  const plugaSheet = getOrCreateSheet_(ss, CFG.PLUGA_SHEET, headers);

  const controlDate = String(controlSheet.getRange(2, 1).getDisplayValue() || '').trim();

  if (controlDate !== dateIso) {
    rotateDailyBatch_(lancSheet, historySheet, metaSheet, controlSheet, dateIso);
  }

  return {
    mode: mode,
    dateIso: dateIso,
    ss: ss,
    lancSheet: lancSheet,
    historySheet: historySheet,
    metaSheet: metaSheet,
    controlSheet: controlSheet,
    plugaSheet: plugaSheet
  };
}

function rotateDailyBatch_(lancSheet, historySheet, metaSheet, controlSheet, dateIso) {
  const data = lancSheet.getDataRange().getValues();

  if (data.length > 1) {
    const body = data.slice(1);
    const startRow = historySheet.getLastRow() + 1;
    historySheet.getRange(startRow, 1, body.length, body[0].length).setValues(body);
  }

  resetDataBody_(lancSheet);
  resetDataBody_(metaSheet);

  controlSheet.getRange(2, 1, 1, 2).setValues([[dateIso, new Date()]]);
}


/* =====================================
 * SHEET HELPERS
 * ===================================== */

function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
  }

  ensureSheetStructure_(sh, headers);
  return sh;
}

function ensureSheetStructure_(sheet, headers) {
  const neededCols = headers.length;

  if (sheet.getMaxColumns() < neededCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededCols - sheet.getMaxColumns());
  }

  const currentHeader = sheet.getRange(1, 1, 1, neededCols).getValues()[0];
  if (JSON.stringify(currentHeader) !== JSON.stringify(headers)) {
    sheet.getRange(1, 1, 1, neededCols).setValues([headers]);
  }

  sheet.setFrozenRows(1);
}

function resetDataBody_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
}


/* =====================================
 * META HELPERS
 * ===================================== */

function appendMetaRow_(metaSheet, entryId, mode, sheetRow, dateIso) {
  const nextRow = metaSheet.getLastRow() + 1;
  metaSheet.getRange(nextRow, 1, 1, 4).setValues([[entryId, mode, sheetRow, dateIso]]);
}

function getMetaObjects_(metaSheet) {
  const lastRow = metaSheet.getLastRow();
  if (lastRow < 2) return [];

  const values = metaSheet.getRange(2, 1, lastRow - 1, 4).getValues();
  return values
    .filter(r => r[0] && r[2])
    .map(r => ({
      entryId: String(r[0]),
      mode: String(r[1]),
      sheetRow: Number(r[2]),
      dateIso: String(r[3] || '')
    }));
}

function rebuildMetaSheetAfterDelete_(metaSheet, deletedEntryId) {
  const rows = getMetaObjects_(metaSheet).filter(r => r.entryId !== deletedEntryId);

  resetDataBody_(metaSheet);

  if (!rows.length) return;

  const values = rows
    .sort((a, b) => a.sheetRow - b.sheetRow)
    .map((r, idx) => [r.entryId, r.mode, idx + 2, r.dateIso]);

  metaSheet.getRange(2, 1, values.length, 4).setValues(values);
}


/* =====================================
 * VALIDATION
 * ===================================== */

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload inválido.');
  }

  const mode = normalizeMode_(payload.mode);
  normalizeIsoDate_(payload.date);

  const value = Math.abs(parseValue_(payload.value));
  if (!(value > 0)) {
    throw new Error('Informe um valor maior que zero.');
  }

  if (mode === 'receitas') {
    const payment = normalizeText_(payload.payment);
    const account = normalizeText_(payload.account);

    if (!CFG.RECEITAS.PAYMENT_OPTIONS.includes(payment)) {
      throw new Error('Forma de pagamento inválida.');
    }

    if (!CFG.RECEITAS.ACCOUNT_OPTIONS.includes(account)) {
      throw new Error('Conta inválida.');
    }
  }

  if (mode === 'despesas') {
    const expenseCategory = normalizeText_(payload.expenseCategory);
    if (!CFG.DESPESAS.CATEGORY_OPTIONS.includes(expenseCategory)) {
      throw new Error('Categoria de despesa inválida.');
    }
  }
}


/* =====================================
 * UTILS
 * ===================================== */

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Corpo da requisição ausente.');
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('JSON inválido no corpo da requisição.');
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(message, context) {
  Logger.log((context ? '[ERRO][' + context + '] ' : '[ERRO] ') + message);
  return { ok: false, error: message };
}

function normalizeText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeIsoDate_(iso) {
  const value = String(iso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Data inválida.');
  }
  return value;
}

function normalizeMode_(mode) {
  const value = normalizeText_(mode).toLowerCase();
  if (value !== 'receitas' && value !== 'despesas') {
    throw new Error('Modo inválido.');
  }
  return value;
}

function buildReceitaDescription_(description, payment) {
  const base = normalizeText_(description) || CFG.RECEITAS.EMPTY_DESCRIPTION;
  return (base + ' ' + normalizeText_(payment)).trim();
}

function mapReceitaBankAccount_(account) {
  const bank = CFG.RECEITAS.ACCOUNT_MAP[account];
  if (!bank) throw new Error('Conta sem mapeamento.');
  return bank;
}

function mapReceitaBankToAccountLabel_(bankAccount) {
  const normalizedBank = normalizeText_(bankAccount);

  for (const account in CFG.RECEITAS.ACCOUNT_MAP) {
    if (CFG.RECEITAS.ACCOUNT_MAP[account] === normalizedBank) {
      return account;
    }
  }
  return normalizedBank || '';
}

function mapDespesaCategory_(label) {
  const mapped = CFG.DESPESAS.CATEGORY_MAP[label];
  if (!mapped) throw new Error('Categoria de despesa sem mapeamento.');
  return mapped;
}

function mapDespesaCategoryToShortLabel_(mapped) {
  const normalized = normalizeText_(mapped);

  for (const label in CFG.DESPESAS.CATEGORY_MAP) {
    if (CFG.DESPESAS.CATEGORY_MAP[label] === normalized) {
      return label;
    }
  }
  return normalized || '';
}

function parseValue_(value) {
  if (typeof value === 'number') return value;

  const normalized = String(value == null ? '' : value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const num = Number(normalized);
  return isNaN(num) ? 0 : num;
}

function formatMoney_(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function todayISO_() {
  return Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd');
}

function isoToBR_(iso) {
  const value = normalizeIsoDate_(iso);
  const parts = value.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function nowDateTime_() {
  return Utilities.formatDate(new Date(), CFG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function forcarCabecalhoPluga() {
  forcePlugaHeaderForMode_('receitas');
  forcePlugaHeaderForMode_('despesas');
  return 'Cabeçalhos da aba Pluga_Export atualizados com sucesso.';
}

function forcePlugaHeaderForMode_(mode) {
  const spreadsheetId = mode === 'receitas'
    ? CFG.RECEITAS_SPREADSHEET_ID
    : CFG.DESPESAS_SPREADSHEET_ID;

  const headers = mode === 'receitas'
    ? CFG.RECEITAS.HEADERS
    : CFG.DESPESAS.HEADERS;

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const plugaSheet = getOrCreateSheet_(ss, CFG.PLUGA_SHEET, headers);

  ensureSheetStructure_(plugaSheet, headers);
}