/**
 * CAIXA À VISTA V3 - Router
 */

var CFG = {
  TIMEZONE: 'America/Fortaleza',
  SPREADSHEET_ID_PROP: 'CAIXA_AVISTA_SPREADSHEET_ID',
  PIX_KEY_PROP: 'CAIXA_AVISTA_PIX_KEY',
  PIX_NAME_PROP: 'CAIXA_AVISTA_PIX_NAME',
  PIX_CITY_PROP: 'CAIXA_AVISTA_PIX_CITY',
  INTERNAL_SECRET_PROP: 'CAIXA_INTERNAL_SECRET',
  ACCOUNT_CASH_PROP: 'CAIXA_AVISTA_ACCOUNT_CASH',
  ACCOUNT_PIX_PROP: 'CAIXA_AVISTA_ACCOUNT_PIX',
  ACCOUNT_CARD_PROP: 'CAIXA_AVISTA_ACCOUNT_CARD',
  COST_CENTER_PROP: 'CAIXA_AVISTA_COST_CENTER',
  CACHE_CLIENTS_KEY: 'CAIXA_AVISTA_CLIENTS_V1',
  CACHE_SECONDS: 300,
  MAX_BATCH_SIZE: 100,
  SHEETS: { CLIENTS:'Clientes', ENTRIES:'Lancamentos', CLOSURES:'Fechamentos', EXPORT_REVENUE:'Export_ContaAzul_Receitas', EXPORT_EXPENSE:'Export_ContaAzul_Despesas', EXPORT_CONTROL:'_Export_Control' },
  CLIENT_HEADERS: ['client_id','nome','nome_normalizado','criado_em','criado_por','ativo'],
  ENTRY_HEADERS: ['entry_id','date_iso','created_at','type','client_id','client_name','object_count','amount_cents','payment_method','pix_status','expense_category','description','operator_id','operator_name','status','deleted_at','deleted_by','closure_id','pix_txid','pix_e2eid','pix_received_at','pix_provider'],
  CLOSURE_HEADERS: ['closure_id','date_iso','created_at','created_by','status','revenue_cents','expense_cents','balance_cents','pix_pending_cents','cash_expected_cents','pix_confirmed_expected_cents','cash_counted_cents','pix_counted_cents','cash_difference_cents','pix_difference_cents','notes','reconciled_at'],
  EXPORT_CONTROL_HEADERS: ['closure_id','entry_id','mode','exported_at'],
  PAYMENT_OPTIONS: ['Dinheiro','PIX','Cartão de débito','Cartão de crédito'],
  PIX_STATUSES: ['CRIANDO','ATIVA','PENDENTE','CONFIRMADO','EXPIRADO','CANCELADO','ERRO'],
  EXPENSE_CATEGORIES: ['Copa','Escritório','Taxi','Outros'],
  REVENUE_CATEGORY: '1.3.3. Balcao (Shopping Metro)',
  EXPENSE_CATEGORY_MAP: {'Copa':'3.6.3. Copa e Cozinha','Escritório':'3.6.4. Material de Escritório','Taxi':'3.4.6. Terceirizados coletas','Outros':'3.6.6. Outras despesas administrativas'},
  DEFAULT_SUPPLIER: 'GAS SHOPPING METRO',
  REVENUE_HEADERS: [
    'Identificador do cliente', 'Nome do cliente', 'Código de referência', 'Data de competência',
    'Data de vencimento', 'Data prevista', 'Recorrência', 'Quantidade de recorrência', 'Descrição',
    'Origem do lançamento', 'Situação', 'Agendado', 'Valor original da parcela (R$)',
    'Forma de recebimento', 'Valor recebido da parcela (R$)', 'Juros realizado (R$)',
    'Multa realizado (R$)', 'Desconto realizado (R$)', 'Valor total recebido da parcela (R$)',
    'Valor da parcela em aberto (R$)', 'Juros previsto (R$)', 'Multa previsto (R$)',
    'Desconto previsto (R$)', 'Valor total da parcela em aberto (R$)', 'Conta bancária',
    'Data do último pagamento', 'Nota fiscal', 'Observações', 'Categoria 1',
    'Valor na Categoria 1', 'Centro de Custo 1', 'Valor no Centro de Custo 1'
  ],
  EXPENSE_HEADERS: [
    'Identificador do fornecedor', 'Nome do fornecedor', 'Código de referência', 'Data de competência',
    'Data de vencimento', 'Data prevista', 'Recorrência', 'Quantidade de recorrência', 'Descrição',
    'Origem do lançamento', 'Situação', 'Agendado', 'Valor original da parcela (R$)',
    'Forma de pagamento', 'Valor pago da parcela (R$)', 'Juros pago (R$)', 'Multa paga (R$)',
    'Desconto pago (R$)', 'Valor total pago da parcela (R$)', 'Valor da parcela em aberto (R$)',
    'Juros previsto (R$)', 'Multa previsto (R$)', 'Desconto previsto (R$)',
    'Valor total da parcela em aberto (R$)', 'Conta bancária', 'Data do último pagamento',
    'Nota fiscal', 'Observações', 'Categoria 1', 'Valor na Categoria 1',
    'Centro de Custo 1', 'Valor no Centro de Custo 1'
  ]
};

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || '').trim();

  try {
    if (action === 'publicPix') {
      return jsonOutput_(v2PublicPix_(params.txid));
    }

    if (action === 'ping') {
      return jsonOutput_({
        ok:true,
        service:'caixa-avista-v3',
        date:v2Today_()
      });
    }

    return jsonOutput_({
      ok:true,
      service:'caixa-avista-v3',
      message:'Use POST para operações do caixa.'
    });
  } catch (error) {
    console.error(
      '[CAIXA_AVISTA_V3][doGet] ' +
      (error && error.stack ? error.stack : error)
    );

    return jsonOutput_(
      fail_(
        error.message || String(error),
        error.code || 'INTERNAL_ERROR'
      )
    );
  }
}

function doPost(e) {
  try {
    var request = parseRequest_(e);
    var action = cleanText_(request.action);

    if (action === 'internalPixWebhook') {
      verifyInternalRequest_(request);
      return jsonOutput_(v3SyncPix_(request.payload || {}));
    }

    var gate = agfGateCheck_(request.st, 'POST ' + action);
    if (!gate.allowed) return jsonOutput_(agfGateDeniedResponse_());

    if (gate.mode !== 'enforce') {
      return jsonOutput_(fail_(
        'O Caixa está bloqueado até a autenticação de produção ser ativada.',
        'AUTH_ENFORCE_REQUIRED'
      ));
    }

    var tokenApps = gate.user && Array.isArray(gate.user.apps)
      ? gate.user.apps.map(function(item){ return String(item || '').toLowerCase(); })
      : [];

    if (tokenApps.indexOf('caixa') < 0) {
      return jsonOutput_(fail_(
        'Seu usuário não possui acesso ao módulo Caixa.',
        'APP_ACCESS_REQUIRED'
      ));
    }

    var user = normalizeUser_(gate.user);
    user.requestedUnitId = cleanText_(request.unitId);

    var adminOnly = {
      processContaAzulQueue: true,
      syncContaAzulLibrary: true,
      retryPdfs: true
    };

    if (adminOnly[action] && user.role !== 'admin') {
      return jsonOutput_(fail_(
        'Ação disponível somente para administrador.',
        'ADMIN_REQUIRED'
      ));
    }

    switch (action) {
      case 'unitAccess': return jsonOutput_(v2UnitAccessResponse_(user, request.unitId));
      case 'init': return jsonOutput_(v3Init_(request.date, user));
      case 'saveClient': return jsonOutput_(v2SaveClient_(request.name, user));
      case 'saveEntry': return jsonOutput_(v3SaveEntry_(request.payload, user));
      case 'saveBatch': return jsonOutput_(v3SaveBatch_(request.payloads, user));
      case 'deleteEntry': return jsonOutput_(v2DeleteEntry_(request.payload || {}, user));
      case 'syncPixPayment': return jsonOutput_(v3SyncPix_(request.payload || {}, user));
      case 'summary': return jsonOutput_(v3Init_(request.date, user));
      case 'setOpeningBalance': return jsonOutput_(v2SetOpeningBalance_(request.date, request.amountCents, user));
      case 'createWithdrawal': return jsonOutput_(v2CreateWithdrawal_(request.payload, user));
      case 'closeCash': return jsonOutput_(v3CloseCashSafe_(request.payload, user));
      case 'processContaAzulQueue': return jsonOutput_(processContaAzulQueueV2(request.limit));
      case 'syncContaAzulLibrary': return jsonOutput_(syncContaAzulLibraryV2());
      case 'retryPdfs': return jsonOutput_(retryPendingPdfsV2());
      case 'ping': return jsonOutput_({ ok:true, service:'caixa-avista-v3', date:v2Today_(), authMode:gate.mode });
      default: return jsonOutput_(fail_('Ação inválida ou ausente.', 'INVALID_ACTION'));
    }
  } catch (error) {
    console.error('[CAIXA_AVISTA_V3][doPost] ' + (error && error.stack ? error.stack : error));
    return jsonOutput_(fail_(error.message || String(error), error.code || 'INTERNAL_ERROR'));
  }
}
