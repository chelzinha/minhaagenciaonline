/**
 * CAIXA À VISTA V2
 * Biblioteca parametrizada, unidades, lotes, caixa físico, sangrias,
 * PDFs no Drive e fila de lançamento no Conta Azul.
 */

var CAIXA_V2_CFG = Object.freeze({
  TIMEZONE: 'America/Fortaleza',
  DB_PROP: 'CAIXA_AVISTA_SPREADSHEET_ID',
  CONTA_AZUL_API: 'https://api-v2.contaazul.com',
  CONTA_AZUL_TOKEN_URL: 'https://api-v2.contaazul.com/oauth/token',
  PROPS: Object.freeze({
    CA_CLIENT_ID: 'CAIXA_CONTA_AZUL_CLIENT_ID',
    CA_CLIENT_SECRET: 'CAIXA_CONTA_AZUL_CLIENT_SECRET',
    CA_ACCESS_TOKEN: 'CAIXA_CONTA_AZUL_ACCESS_TOKEN',
    CA_REFRESH_TOKEN: 'CAIXA_CONTA_AZUL_REFRESH_TOKEN',
    CA_EXPIRES_AT: 'CAIXA_CONTA_AZUL_EXPIRES_AT',
    CA_REDIRECT_URI: 'CAIXA_CONTA_AZUL_REDIRECT_URI'
  }),
  SHEETS: Object.freeze({
    UNITS: 'Biblioteca_Unidades',
    USERS: 'Biblioteca_Usuarios',
    ACCOUNTS: 'Biblioteca_Contas',
    PAYMENTS: 'Biblioteca_Pagamentos',
    REVENUES: 'Biblioteca_Receitas',
    EXPENSES: 'Biblioteca_Despesas',
    CLIENTS: 'Clientes',
    ENTRIES: 'Lancamentos_V2',
    DAILY_BALANCES: 'Saldos_Diarios',
    WITHDRAWALS: 'Sangrias',
    CLOSURES: 'Fechamentos_V2',
    CA_QUEUE: 'ContaAzul_Fila',
    CA_CATEGORIES: 'CA_Categorias',
    CA_COST_CENTERS: 'CA_Centros_Custo',
    CA_ACCOUNTS: 'CA_Contas_Financeiras',
    CA_CONTACTS: 'CA_Contatos'
  }),
  HEADERS: Object.freeze({
    UNITS: ['unit_id','name','cost_center_name','cost_center_ca_id','default_revenue_contact_ca_id','default_expense_contact_ca_id','drive_root_folder_id','active'],
    USERS: ['username','unit_id','can_revenue','can_expense','can_close','can_withdraw','active'],
    ACCOUNTS: ['account_id','unit_id','name_front','name_conta_azul','conta_azul_id','active','sort_order'],
    PAYMENTS: ['payment_id','unit_id','name_front','conta_azul_method','account_id','allow_revenue','allow_expense','allow_batch','generate_pix','icon','color','active','sort_order'],
    REVENUES: ['revenue_type_id','unit_id','name_front','description_default','category_name','category_ca_id','allow_attendance','allow_single','allow_batch','require_client','require_description','icon','color','active','sort_order'],
    EXPENSES: ['expense_type_id','unit_id','name_front','description_default','category_name','category_ca_id','default_payment_id','default_account_id','allow_batch','require_description','icon','color','active','sort_order'],
    CLIENTS: ['client_id','name','normalized_name','created_at','created_by','active'],
    ENTRIES: [
      'entry_id','batch_id','batch_index','date_iso','created_at','type','mode','unit_id','operator_id','operator_name',
      'client_id','client_name','client_source','object_count','amount_cents','payment_id','payment_name','payment_ca_method',
      'account_id','account_ca_id_snapshot','account_ca_name_snapshot','category_id','category_ca_id_snapshot','category_ca_name_snapshot',
      'cost_center_ca_id_snapshot','cost_center_ca_name_snapshot','description','pix_status','pix_txid','pix_e2eid','pix_received_at',
      'pix_provider','status','closure_id','conta_azul_status','conta_azul_protocol','conta_azul_last_error','conta_azul_attempts','conta_azul_synced_at'
    ],
    DAILY_BALANCES: ['unit_id','date_iso','opening_cash_cents','opening_source','created_at','created_by','expected_cash_cents','counted_cash_cents','difference_cents','closing_withdrawal_cents','carryover_cents','status'],
    WITHDRAWALS: ['withdrawal_id','date_iso','created_at','unit_id','operator_id','operator_name','amount_cents','destination','notes','balance_before_cents','balance_after_cents','declaration_version','declaration_text','confirmed','confirmed_at','closure_id','pdf_status','pdf_file_id','pdf_url'],
    CLOSURES: [
      'closure_id','date_iso','unit_id','unit_name','cost_center_ca_id_snapshot','cost_center_ca_name_snapshot','created_at','created_by','created_by_name','status',
      'revenue_cents','expense_cents','net_cents','payment_totals_json','payment_counts_json','opening_cash_cents','cash_revenue_cents','cash_expense_cents',
      'withdrawals_before_close_cents','expected_cash_cents','counted_cash_cents','difference_cents','closing_withdrawal_cents','carryover_cents','notes',
      'declaration_version','declaration_text','declaration_confirmed','declaration_confirmed_at','pdf_status','pdf_file_id','pdf_url','conta_azul_status'
    ],
    CA_QUEUE: ['queue_id','closure_id','entry_id','unit_id','entry_type','status','attempts','protocol','payload_json','last_error','created_at','updated_at'],
    CA_CATEGORIES: ['id','codigo','nome','tipo','ativo','synced_at'],
    CA_COST_CENTERS: ['id','codigo','nome','ativo','synced_at'],
    CA_ACCOUNTS: ['id','nome','tipo','ativo','synced_at'],
    CA_CONTACTS: ['id','nome','documento','tipo','ativo','synced_at']
  }),
  CASH_DECLARATION_VERSION: 'v1',
  CASH_DECLARATION: 'Declaro que conferi e contei o numerário físico deste caixa. Confirmo que o valor informado corresponde ao dinheiro efetivamente encontrado na gaveta e, quando aplicável, que o valor separado para sangria corresponde ao valor registrado.',
  WITHDRAWAL_DECLARATION_VERSION: 'v1',
  WITHDRAWAL_DECLARATION: 'Confirmo que conferi e contei o valor separado para sangria e que ele corresponde ao valor informado neste registro.',
  MAX_BATCH: 100
});

function setupCaixaAvistaV2() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CAIXA_V2_CFG.DB_PROP);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('CAIXA A VISTA - BASE V2');
  if (!id) props.setProperty(CAIXA_V2_CFG.DB_PROP, ss.getId());
  var env = v2PrepareEnvironment_(ss);
  v2SeedLibrary_(env);
  v2EnsureTriggers_();
  return { ok: true, spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl() };
}

function v2EnsureTriggers_() {
  var wanted = {
    processContaAzulQueueV2: { minutes: 5 },
    retryPendingPdfsV2: { minutes: 30 }
  };
  var current = ScriptApp.getProjectTriggers();
  Object.keys(wanted).forEach(function(handler) {
    var exists = current.some(function(trigger) { return trigger.getHandlerFunction() === handler; });
    if (!exists) ScriptApp.newTrigger(handler).timeBased().everyMinutes(wanted[handler].minutes).create();
  });
}

function v2PrepareEnvironment_(ss) {
  var h = CAIXA_V2_CFG.HEADERS;
  var s = CAIXA_V2_CFG.SHEETS;
  return {
    ss: ss,
    units: v2Sheet_(ss, s.UNITS, h.UNITS),
    users: v2Sheet_(ss, s.USERS, h.USERS),
    accounts: v2Sheet_(ss, s.ACCOUNTS, h.ACCOUNTS),
    payments: v2Sheet_(ss, s.PAYMENTS, h.PAYMENTS),
    revenues: v2Sheet_(ss, s.REVENUES, h.REVENUES),
    expenses: v2Sheet_(ss, s.EXPENSES, h.EXPENSES),
    clients: v2Sheet_(ss, s.CLIENTS, h.CLIENTS),
    entries: v2Sheet_(ss, s.ENTRIES, h.ENTRIES),
    dailyBalances: v2Sheet_(ss, s.DAILY_BALANCES, h.DAILY_BALANCES),
    withdrawals: v2Sheet_(ss, s.WITHDRAWALS, h.WITHDRAWALS),
    closures: v2Sheet_(ss, s.CLOSURES, h.CLOSURES),
    caQueue: v2Sheet_(ss, s.CA_QUEUE, h.CA_QUEUE),
    caCategories: v2Sheet_(ss, s.CA_CATEGORIES, h.CA_CATEGORIES),
    caCostCenters: v2Sheet_(ss, s.CA_COST_CENTERS, h.CA_COST_CENTERS),
    caAccounts: v2Sheet_(ss, s.CA_ACCOUNTS, h.CA_ACCOUNTS),
    caContacts: v2Sheet_(ss, s.CA_CONTACTS, h.CA_CONTACTS)
  };
}

function v2Environment_() {
  var id = PropertiesService.getScriptProperties().getProperty(CAIXA_V2_CFG.DB_PROP);
  if (!id) throw appError_('Execute setupCaixaAvistaV2() antes de publicar.', 'SETUP_REQUIRED');
  return v2PrepareEnvironment_(SpreadsheetApp.openById(id));
}

function v2Sheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (JSON.stringify(current) !== JSON.stringify(headers)) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function v2SeedLibrary_(env) {
  if (env.units.getLastRow() < 2) env.units.appendRow(['PADRAO','Unidade padrão','','','','','',true]);
  if (env.users.getLastRow() < 2) env.users.appendRow(['*','PADRAO',true,true,true,true,true]);
  if (env.accounts.getLastRow() < 2) {
    env.accounts.getRange(2,1,3,7).setValues([
      ['CAIXA','*','Caixa','','',true,10],
      ['BANCO_PIX','*','Banco Pix','','',true,20],
      ['CARTAO','*','Cartões','','',true,30]
    ]);
  }
  if (env.payments.getLastRow() < 2) {
    env.payments.getRange(2,1,4,13).setValues([
      ['DINHEIRO','*','Dinheiro','DINHEIRO','CAIXA',true,true,true,false,'payments','#1677ff',true,10],
      ['PIX','*','Pix','PIX_PAGAMENTO_INSTANTANEO','BANCO_PIX',true,true,true,true,'qr_code_2','#00a99d',true,20],
      ['DEBITO','*','Débito','CARTAO_DEBITO','CARTAO',true,true,true,false,'credit_card','#3b82f6',true,30],
      ['CREDITO','*','Crédito','CARTAO_CREDITO','CARTAO',true,true,true,false,'credit_card','#7c3aed',true,40]
    ]);
  }
  if (env.revenues.getLastRow() < 2) {
    env.revenues.appendRow(['ATENDIMENTO_BALCAO','*','Balcão','Atendimento de balcão','','',true,true,true,false,false,'point_of_sale','#1677ff',true,10]);
  }
  if (env.expenses.getLastRow() < 2) {
    env.expenses.getRange(2,1,4,14).setValues([
      ['COPA','*','Copa','Despesa de copa','','','DINHEIRO','CAIXA',true,false,'coffee','#ef4444',true,10],
      ['ESCRITORIO','*','Escritório','Material de escritório','','','DINHEIRO','CAIXA',true,false,'edit_note','#ef4444',true,20],
      ['TRANSPORTE','*','Transporte','Despesa de transporte','','','DINHEIRO','CAIXA',true,true,'local_taxi','#ef4444',true,30],
      ['OUTROS','*','Outros','','','','DINHEIRO','CAIXA',true,true,'more_horiz','#ef4444',true,40]
    ]);
  }
  if (env.clients.getLastRow() < 2) env.clients.appendRow(['cliente-balcao','Cliente de Balcão',v2Normalize_('Cliente de Balcão'),new Date(),'sistema',true]);
}

function v2ReadObjects_(sheet, headers) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2,1,last-1,headers.length).getValues().map(function(row,rowIndex){
    var obj = {};
    headers.forEach(function(key,index){ obj[key] = row[index]; });
    obj._row = row;
    obj._sheetRow = rowIndex + 2;
    return obj;
  });
}

function v2Bool_(value) {
  if (typeof value === 'boolean') return value;
  return ['true','sim','1','yes','ativo'].indexOf(String(value || '').toLowerCase().trim()) >= 0;
}

function v2ActiveForUnit_(items, unitId) {
  return items.filter(function(item){
    var itemUnit = String(item.unit_id || '*').trim();
    return v2Bool_(item.active) && (itemUnit === '*' || itemUnit === unitId);
  }).sort(function(a,b){ return Number(a.sort_order || 999) - Number(b.sort_order || 999); });
}

function migrateBibliotecaPagamentosV2() {
  var env = v2Environment_();
  var sheet = env.payments;
  var headers = CAIXA_V2_CFG.HEADERS.PAYMENTS;

  sheet.clearContents();

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  sheet
    .getRange(2, 1, 4, headers.length)
    .setValues([
      ['DINHEIRO','*','Dinheiro','DINHEIRO','CAIXA',true,true,true,false,'payments','#1677ff',true,10],
      ['PIX','*','Pix','PIX_PAGAMENTO_INSTANTANEO','BANCO_PIX',true,true,true,true,'qr_code_2','#00a99d',true,20],
      ['DEBITO','*','Débito','CARTAO_DEBITO','CARTAO',true,true,true,false,'credit_card','#3b82f6',true,30],
      ['CREDITO','*','Crédito','CARTAO_CREDITO','CARTAO',true,true,true,false,'credit_card','#7c3aed',true,40]
    ]);

  sheet.setFrozenRows(1);

  return {
    ok: true,
    message: 'Biblioteca_Pagamentos migrada para configuração por unidade.',
    rows: 4
  };
}

function configurarFinanceiroCaixaV2() {
  var env = v2Environment_();

  var contas = [
    [
      'CAIXA',
      'AGF',
      'Dinheiro',
      'CAIXA BALCÃO AGF',
      'ecb9b2e2-f142-4c78-a055-cf4b70236fa6',
      true,
      10
    ],
    [
      'CAIXA',
      'SHOPPING_METRO',
      'Dinheiro',
      'CAIXA METRÔ',
      '7a5b1543-f749-4d2a-8f04-a4ce408c3bca',
      true,
      10
    ],
    [
      'SANTANDER',
      '*',
      'Santander',
      'SANTANDER AGUANAMBI',
      'c68b217b-c283-4c5e-9dcc-bc13c7681701',
      true,
      20
    ],
    [
      'CLOUDWALK',
      '*',
      'Infinity Pay',
      'Cloudwalk Instituição de Pagamento',
      'd321718d-f86c-4dee-8557-c857c42afffa',
      true,
      30
    ],
    [
      'BTG',
      'SHOPPING_METRO',
      'BTG Pactual',
      'BTG Pactual Conta Corrente',
      '33b80b1f-89fb-47c0-b87b-1d93fd747c1e',
      false,
      40
    ],
    [
      'CAIXA_AVISTA',
      'AGF',
      'Caixa à Vista - Despesas',
      'CAIXA À VISTA',
      '49108b28-40fe-4cb6-bbd1-bed9270650fd',
      false,
      50
    ]
  ];

  var pagamentos = [
    [
      'DINHEIRO',
      'AGF',
      'Dinheiro',
      'DINHEIRO',
      'CAIXA',
      true,
      true,
      true,
      false,
      'payments',
      '#1677ff',
      true,
      10
    ],
    [
      'PIX_SANTANDER',
      'AGF',
      'Pix Santander',
      'PIX_PAGAMENTO_INSTANTANEO',
      'SANTANDER',
      true,
      true,
      true,
      true,
      'qr_code_2',
      '#00a99d',
      true,
      20
    ],
    [
      'PIX_INFINITY',
      'AGF',
      'Pix Infinity',
      'PIX_PAGAMENTO_INSTANTANEO',
      'CLOUDWALK',
      true,
      true,
      true,
      false,
      'qr_code_2',
      '#00a99d',
      true,
      30
    ],
    [
      'DEBITO_CIELO',
      'AGF',
      'Débito Cielo',
      'CARTAO_DEBITO',
      'SANTANDER',
      true,
      false,
      true,
      false,
      'credit_card',
      '#3b82f6',
      true,
      40
    ],
    [
      'CREDITO_CIELO',
      'AGF',
      'Crédito Cielo',
      'CARTAO_CREDITO',
      'SANTANDER',
      true,
      false,
      true,
      false,
      'credit_card',
      '#7c3aed',
      true,
      50
    ],
    [
      'DEBITO_INFINITY',
      'AGF',
      'Débito Infinity',
      'CARTAO_DEBITO',
      'CLOUDWALK',
      true,
      false,
      true,
      false,
      'credit_card',
      '#3b82f6',
      true,
      60
    ],
    [
      'CREDITO_INFINITY',
      'AGF',
      'Crédito Infinity',
      'CARTAO_CREDITO',
      'CLOUDWALK',
      true,
      false,
      true,
      false,
      'credit_card',
      '#7c3aed',
      true,
      70
    ],

    [
      'DINHEIRO',
      'SHOPPING_METRO',
      'Dinheiro',
      'DINHEIRO',
      'CAIXA',
      true,
      true,
      true,
      false,
      'payments',
      '#1677ff',
      true,
      10
    ],
    [
      'PIX_SANTANDER',
      'SHOPPING_METRO',
      'Pix Santander',
      'PIX_PAGAMENTO_INSTANTANEO',
      'SANTANDER',
      true,
      true,
      true,
      true,
      'qr_code_2',
      '#00a99d',
      true,
      20
    ],
    [
      'PIX_INFINITY',
      'SHOPPING_METRO',
      'Pix Infinity',
      'PIX_PAGAMENTO_INSTANTANEO',
      'CLOUDWALK',
      true,
      true,
      true,
      false,
      'qr_code_2',
      '#00a99d',
      true,
      30
    ],
    [
      'DEBITO_CIELO',
      'SHOPPING_METRO',
      'Débito Cielo',
      'CARTAO_DEBITO',
      'SANTANDER',
      true,
      false,
      true,
      false,
      'credit_card',
      '#3b82f6',
      true,
      40
    ],
    [
      'CREDITO_CIELO',
      'SHOPPING_METRO',
      'Crédito Cielo',
      'CARTAO_CREDITO',
      'SANTANDER',
      true,
      false,
      true,
      false,
      'credit_card',
      '#7c3aed',
      true,
      50
    ],
    [
      'DEBITO_INFINITY',
      'SHOPPING_METRO',
      'Débito Infinity',
      'CARTAO_DEBITO',
      'CLOUDWALK',
      true,
      false,
      true,
      false,
      'credit_card',
      '#3b82f6',
      true,
      60
    ],
    [
      'CREDITO_INFINITY',
      'SHOPPING_METRO',
      'Crédito Infinity',
      'CARTAO_CREDITO',
      'CLOUDWALK',
      true,
      false,
      true,
      false,
      'credit_card',
      '#7c3aed',
      true,
      70
    ],
    [
      'PIX_BTG',
      'SHOPPING_METRO',
      'Pix BTG',
      'PIX_PAGAMENTO_INSTANTANEO',
      'BTG',
      true,
      true,
      true,
      false,
      'qr_code_2',
      '#00a99d',
      false,
      80
    ]
  ];

  env.accounts.clearContents();
  env.accounts
    .getRange(
      1,
      1,
      1,
      CAIXA_V2_CFG.HEADERS.ACCOUNTS.length
    )
    .setValues([
      CAIXA_V2_CFG.HEADERS.ACCOUNTS
    ]);

  env.accounts
    .getRange(
      2,
      1,
      contas.length,
      CAIXA_V2_CFG.HEADERS.ACCOUNTS.length
    )
    .setValues(contas);

  env.payments.clearContents();
  env.payments
    .getRange(
      1,
      1,
      1,
      CAIXA_V2_CFG.HEADERS.PAYMENTS.length
    )
    .setValues([
      CAIXA_V2_CFG.HEADERS.PAYMENTS
    ]);

  env.payments
    .getRange(
      2,
      1,
      pagamentos.length,
      CAIXA_V2_CFG.HEADERS.PAYMENTS.length
    )
    .setValues(pagamentos);

  env.accounts.setFrozenRows(1);
  env.payments.setFrozenRows(1);

  SpreadsheetApp.flush();

  return {
    ok: true,
    contasConfiguradas: contas.length,
    pagamentosConfigurados: pagamentos.length,
    mensagem: 'Bibliotecas financeiras configuradas com sucesso.'
  };
}

function desativarGeracaoPixAutomaticaV2() {
  var env = v2Environment_();
  var headers = CAIXA_V2_CFG.HEADERS.PAYMENTS;
  var generatePixIndex = headers.indexOf('generate_pix');

  if (generatePixIndex < 0) {
    throw new Error('Coluna generate_pix não encontrada.');
  }

  var lastRow = env.payments.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      pagamentosAtualizados: 0
    };
  }

  var rows = env.payments
    .getRange(
      2,
      1,
      lastRow - 1,
      headers.length
    )
    .getValues();

  rows.forEach(function(row) {
    row[generatePixIndex] = false;
  });

  env.payments
    .getRange(
      2,
      1,
      rows.length,
      headers.length
    )
    .setValues(rows);

  SpreadsheetApp.flush();

  return {
    ok: true,
    pagamentosAtualizados: rows.length,
    mensagem: 'Geração automática de Pix desativada temporariamente.'
  };
}


function configurarCategoriasFinanceirasV2() {
  var env = v2Environment_();

  var receitas = [
    [
      'ATENDIMENTO_BALCAO',
      'AGF',
      'Balcão',
      'Atendimento de balcão',
      '1.3.1. Balcao (Jose Bonifacio)',
      'b137c4b0-9f9a-4369-885c-230ce8e49f5c',
      true,
      true,
      true,
      false,
      false,
      'point_of_sale',
      '#1677ff',
      true,
      10
    ],
    [
      'ATENDIMENTO_BALCAO',
      'SHOPPING_METRO',
      'Balcão',
      'Atendimento de balcão',
      '1.3.3. Balcao (Shopping Metro)',
      '4656acec-920f-401e-a923-fecf2e965a7e',
      true,
      true,
      true,
      false,
      false,
      'point_of_sale',
      '#1677ff',
      true,
      10
    ]
  ];

  var despesas = [
    [
      'COPA',
      '*',
      'Copa',
      'Despesa de copa',
      '3.6.3. Copa e Cozinha',
      '37392616-75f0-4d31-8b4a-2a5ce6c27dbb',
      'DINHEIRO',
      'CAIXA',
      true,
      false,
      'coffee',
      '#ef4444',
      true,
      10
    ],
    [
      'ESCRITORIO',
      '*',
      'Escritório',
      'Material de escritório',
      '3.6.4. Material de Escritório',
      '3c8c30dd-734a-41e1-a4cc-b98573edfe53',
      'DINHEIRO',
      'CAIXA',
      true,
      false,
      'edit_note',
      '#ef4444',
      true,
      20
    ],
    [
      'TRANSPORTE',
      '*',
      'Transporte',
      'Despesa de transporte',
      '3.4.6. Terceirizados coletas',
      '62afeb41-e971-4105-aba6-e2568b494562',
      'DINHEIRO',
      'CAIXA',
      true,
      true,
      'local_taxi',
      '#ef4444',
      true,
      30
    ],
    [
      'OUTROS',
      '*',
      'Outros',
      '',
      '3.6.6. Outras despesas administrativas',
      'e777425a-4c61-49b2-b24a-1ab27c4d71c3',
      'DINHEIRO',
      'CAIXA',
      true,
      true,
      'more_horiz',
      '#ef4444',
      true,
      40
    ]
  ];

  env.revenues.clearContents();

  env.revenues
    .getRange(
      1,
      1,
      1,
      CAIXA_V2_CFG.HEADERS.REVENUES.length
    )
    .setValues([
      CAIXA_V2_CFG.HEADERS.REVENUES
    ]);

  env.revenues
    .getRange(
      2,
      1,
      receitas.length,
      CAIXA_V2_CFG.HEADERS.REVENUES.length
    )
    .setValues(receitas);

  env.expenses.clearContents();

  env.expenses
    .getRange(
      1,
      1,
      1,
      CAIXA_V2_CFG.HEADERS.EXPENSES.length
    )
    .setValues([
      CAIXA_V2_CFG.HEADERS.EXPENSES
    ]);

  env.expenses
    .getRange(
      2,
      1,
      despesas.length,
      CAIXA_V2_CFG.HEADERS.EXPENSES.length
    )
    .setValues(despesas);

  env.revenues.setFrozenRows(1);
  env.expenses.setFrozenRows(1);

  SpreadsheetApp.flush();

  return {
    ok: true,
    receitasConfiguradas: receitas.length,
    despesasConfiguradas: despesas.length,
    mensagem:
      'Categorias financeiras configuradas com sucesso.'
  };
}


function auditarConfiguracaoCaixaV2() {
  var env = v2Environment_();

  var erros = [];
  var avisos = [];
  var detalhes = {};

  function erro(condicao, mensagem) {
    if (!condicao) {
      erros.push(mensagem);
    }
  }

  function aviso(condicao, mensagem) {
    if (!condicao) {
      avisos.push(mensagem);
    }
  }

  var unidades = v2ReadObjects_(
    env.units,
    CAIXA_V2_CFG.HEADERS.UNITS
  );

  var contas = v2ReadObjects_(
    env.accounts,
    CAIXA_V2_CFG.HEADERS.ACCOUNTS
  );

  var pagamentos = v2ReadObjects_(
    env.payments,
    CAIXA_V2_CFG.HEADERS.PAYMENTS
  );

  var receitas = v2ReadObjects_(
    env.revenues,
    CAIXA_V2_CFG.HEADERS.REVENUES
  );

  var despesas = v2ReadObjects_(
    env.expenses,
    CAIXA_V2_CFG.HEADERS.EXPENSES
  );

  var usuarios = v2ReadObjects_(
    env.users,
    CAIXA_V2_CFG.HEADERS.USERS
  );

  var fila = v2ReadObjects_(
    env.caQueue,
    CAIXA_V2_CFG.HEADERS.CA_QUEUE
  );

  var unidadesObrigatorias = [
    'AGF',
    'SHOPPING_METRO'
  ];

  function localizarUnidade(unitId) {
    return unidades.filter(function(item) {
      return (
        String(item.unit_id).trim() === unitId &&
        v2Bool_(item.active)
      );
    })[0];
  }

  function localizarConta(unitId, accountId) {
    return contas.filter(function(item) {
      var itemUnit = String(
        item.unit_id || '*'
      ).trim();

      return (
        String(item.account_id).trim() === accountId &&
        v2Bool_(item.active) &&
        (
          itemUnit === '*' ||
          itemUnit === unitId
        )
      );
    })[0];
  }

  unidadesObrigatorias.forEach(function(unitId) {
    var unidade = localizarUnidade(unitId);

    erro(
      Boolean(unidade),
      'Unidade ausente ou inativa: ' + unitId
    );

    if (!unidade) {
      return;
    }

    erro(
      Boolean(
        String(
          unidade.cost_center_ca_id || ''
        ).trim()
      ),
      'Centro de custo sem UUID: ' + unitId
    );

    erro(
      Boolean(
        String(
          unidade.default_revenue_contact_ca_id || ''
        ).trim()
      ),
      'Contato de receita sem UUID: ' + unitId
    );

    erro(
      Boolean(
        String(
          unidade.default_expense_contact_ca_id || ''
        ).trim()
      ),
      'Contato de despesa sem UUID: ' + unitId
    );

    var contasUnidade = contas.filter(function(item) {
      var itemUnit = String(
        item.unit_id || '*'
      ).trim();

      return (
        v2Bool_(item.active) &&
        (
          itemUnit === '*' ||
          itemUnit === unitId
        )
      );
    });

    var pagamentosUnidade =
      pagamentos.filter(function(item) {
        var itemUnit = String(
          item.unit_id || '*'
        ).trim();

        return (
          v2Bool_(item.active) &&
          (
            itemUnit === '*' ||
            itemUnit === unitId
          )
        );
      });

    erro(
      pagamentosUnidade.length > 0,
      'Nenhuma forma de pagamento ativa: ' +
        unitId
    );

    pagamentosUnidade.forEach(function(pagamento) {
      var accountId = String(
        pagamento.account_id || ''
      ).trim();

      erro(
        Boolean(accountId),
        'Pagamento sem conta financeira: ' +
          unitId +
          ' / ' +
          pagamento.payment_id
      );

      erro(
        Boolean(
          localizarConta(unitId, accountId)
        ),
        'Conta "' +
          accountId +
          '" não encontrada para o pagamento "' +
          pagamento.payment_id +
          '" em ' +
          unitId
      );

      erro(
        Boolean(
          String(
            pagamento.conta_azul_method || ''
          ).trim()
        ),
        'Método Conta Azul ausente: ' +
          unitId +
          ' / ' +
          pagamento.payment_id
      );

      aviso(
        !v2Bool_(pagamento.generate_pix),
        'Geração automática de Pix está ativa em: ' +
          unitId +
          ' / ' +
          pagamento.payment_id
      );
    });

    var receitasUnidade =
      receitas.filter(function(item) {
        var itemUnit = String(
          item.unit_id || '*'
        ).trim();

        return (
          v2Bool_(item.active) &&
          (
            itemUnit === '*' ||
            itemUnit === unitId
          )
        );
      });

    erro(
      receitasUnidade.length > 0,
      'Nenhuma categoria de receita ativa: ' +
        unitId
    );

    receitasUnidade.forEach(function(receita) {
      erro(
        Boolean(
          String(
            receita.category_ca_id || ''
          ).trim()
        ),
        'Receita sem UUID de categoria: ' +
          unitId +
          ' / ' +
          receita.revenue_type_id
      );
    });

    detalhes[unitId] = {
      unidade: unidade.name,
      centroCusto: unidade.cost_center_name,
      contasAtivas: contasUnidade.length,
      pagamentosAtivos: pagamentosUnidade.map(
        function(item) {
          return item.payment_id;
        }
      ),
      receitasAtivas: receitasUnidade.map(
        function(item) {
          return item.revenue_type_id;
        }
      )
    };
  });

  var despesasAtivas =
    despesas.filter(function(item) {
      return v2Bool_(item.active);
    });

  erro(
    despesasAtivas.length > 0,
    'Nenhuma categoria de despesa ativa.'
  );

  despesasAtivas.forEach(function(despesa) {
    erro(
      Boolean(
        String(
          despesa.category_ca_id || ''
        ).trim()
      ),
      'Despesa sem UUID de categoria: ' +
        despesa.expense_type_id
    );

    erro(
      Boolean(
        String(
          despesa.default_payment_id || ''
        ).trim()
      ),
      'Despesa sem pagamento padrão: ' +
        despesa.expense_type_id
    );

    erro(
      Boolean(
        String(
          despesa.default_account_id || ''
        ).trim()
      ),
      'Despesa sem conta padrão: ' +
        despesa.expense_type_id
    );
  });

  var usuariosAtivos =
    usuarios.filter(function(item) {
      return v2Bool_(item.active);
    });

  erro(
    usuariosAtivos.length > 0,
    'Nenhum usuário ativo configurado.'
  );

  usuariosAtivos.forEach(function(usuario) {
    var unitId = String(
      usuario.unit_id || ''
    ).trim();

    erro(
      Boolean(localizarUnidade(unitId)),
      'Usuário "' +
        usuario.username +
        '" aponta para unidade inválida: ' +
        unitId
    );
  });

  unidadesObrigatorias.forEach(function(unitId) {
    var vinculados =
      usuariosAtivos.filter(function(usuario) {
        return (
          String(
            usuario.unit_id || ''
          ).trim() === unitId
        );
      });

    aviso(
      vinculados.length > 0,
      'Nenhum usuário vinculado à unidade: ' +
        unitId
    );
  });

  var filaPendente =
    fila.filter(function(item) {
      return [
        'PENDENTE',
        'ERRO',
        'AGUARDANDO_PROTOCOLO',
        'CONFIGURACAO_PENDENTE'
      ].indexOf(
        String(item.status || '').trim()
      ) >= 0;
    });

  aviso(
    filaPendente.length === 0,
    'Existem ' +
      filaPendente.length +
      ' itens antigos ou pendentes na fila do Conta Azul.'
  );

  return {
    ok: erros.length === 0,
    seguroParaTeste:
      erros.length === 0 &&
      filaPendente.length === 0,
    erros: erros,
    avisos: avisos,
    usuarios: usuariosAtivos.map(function(item) {
      return {
        username: item.username,
        unitId: item.unit_id,
        receita: v2Bool_(item.can_revenue),
        despesa: v2Bool_(item.can_expense),
        fechamento: v2Bool_(item.can_close),
        sangria: v2Bool_(item.can_withdraw)
      };
    }),
    despesasAtivas: despesasAtivas.map(
      function(item) {
        return {
          id: item.expense_type_id,
          categoria: item.category_name
        };
      }
    ),
    detalhes: detalhes,
    filaPendente: filaPendente.length
  };
}


function mostrarAuditoriaCaixaV2() {
  var resultado = auditarConfiguracaoCaixaV2();

  var texto = JSON.stringify(
    resultado,
    null,
    2
  );

  console.log(texto);
  Logger.log(texto);

  return resultado;
}
