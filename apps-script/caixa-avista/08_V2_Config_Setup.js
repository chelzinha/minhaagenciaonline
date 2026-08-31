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
    PAYMENTS: ['payment_id','name_front','conta_azul_method','account_id','allow_revenue','allow_expense','allow_batch','generate_pix','icon','color','active','sort_order'],
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
    env.payments.getRange(2,1,4,12).setValues([
      ['DINHEIRO','Dinheiro','DINHEIRO','CAIXA',true,true,true,false,'payments','#1677ff',true,10],
      ['PIX','Pix','PIX_PAGAMENTO_INSTANTANEO','BANCO_PIX',true,true,true,true,'qr_code_2','#00a99d',true,20],
      ['DEBITO','Débito','CARTAO_DEBITO','CARTAO',true,true,true,false,'credit_card','#3b82f6',true,30],
      ['CREDITO','Crédito','CARTAO_CREDITO','CARTAO',true,true,true,false,'credit_card','#7c3aed',true,40]
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
