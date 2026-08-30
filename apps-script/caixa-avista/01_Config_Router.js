/**
 * CAIXA À VISTA V1
 * Backend independente do caixa legado.
 * Data de arquitetura: 2026-08-30
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
  SHEETS: {
    CLIENTS: 'Clientes',
    ENTRIES: 'Lancamentos',
    CLOSURES: 'Fechamentos',
    EXPORT_REVENUE: 'Export_ContaAzul_Receitas',
    EXPORT_EXPENSE: 'Export_ContaAzul_Despesas',
    EXPORT_CONTROL: '_Export_Control'
  },
  CLIENT_HEADERS: ['client_id', 'nome', 'nome_normalizado', 'criado_em', 'criado_por', 'ativo'],
  ENTRY_HEADERS: [
    'entry_id', 'date_iso', 'created_at', 'type', 'client_id', 'client_name', 'object_count',
    'amount_cents', 'payment_method', 'pix_status', 'expense_category', 'description',
    'operator_id', 'operator_name', 'status', 'deleted_at', 'deleted_by', 'closure_id',
    'pix_txid', 'pix_e2eid', 'pix_received_at', 'pix_provider'
  ],
  CLOSURE_HEADERS: [
    'closure_id', 'date_iso', 'created_at', 'created_by', 'status', 'revenue_cents',
    'expense_cents', 'balance_cents', 'pix_pending_cents', 'cash_expected_cents',
    'pix_confirmed_expected_cents', 'cash_counted_cents', 'pix_counted_cents',
    'cash_difference_cents', 'pix_difference_cents', 'notes', 'reconciled_at'
  ],
  EXPORT_CONTROL_HEADERS: ['closure_id', 'entry_id', 'mode', 'exported_at'],
  PAYMENT_OPTIONS: ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito'],
  PIX_STATUSES: ['CRIANDO', 'ATIVA', 'PENDENTE', 'CONFIRMADO', 'EXPIRADO', 'CANCELADO', 'ERRO'],
  EXPENSE_CATEGORIES: ['Copa', 'Escritório', 'Taxi', 'Outros'],
  REVENUE_CATEGORY: '1.3.3. Balcao (Shopping Metro)',
  EXPENSE_CATEGORY_MAP: {
    'Copa': '3.6.3. Copa e Cozinha',
    'Escritório': '3.6.4. Material de Escritório',
    'Taxi': '3.4.6. Terceirizados coletas',
    'Outros': '3.6.6. Outras despesas administrativas'
  },
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
  if (String(params.action || '') === 'ping') return jsonOutput_({ ok: true, service: 'caixa-avista', date: todayIso_() });
  return jsonOutput_({ ok: true, service: 'caixa-avista', message: 'Use POST para operações do caixa.' });
}

function doPost(e) {
  try {
    var request = parseRequest_(e);
    var action = cleanText_(request.action);

    if (action === 'internalPixWebhook') {
      return jsonOutput_(internalPixWebhook_(request));
    }

    var gate = agfGateCheck_(request.st, 'POST ' + action);
    if (!gate.allowed) return jsonOutput_(agfGateDeniedResponse_());
    var user = normalizeUser_(gate.user);

    switch (action) {
      case 'init': return jsonOutput_(init_(request.date, user));
      case 'saveClient': return jsonOutput_(saveClient_(request.name, user));
      case 'saveEntry': return jsonOutput_(saveEntry_(request.payload, user));
      case 'saveBatch': return jsonOutput_(saveBatch_(request.payloads, user));
      case 'updatePixStatus': return jsonOutput_(updatePixStatus_(request.entryId, request.pixStatus, request.date, user));
      case 'syncPixPayment': return jsonOutput_(syncPixPayment_(request.payload, request.date, user));
      case 'deleteEntry': return jsonOutput_(deleteEntry_(request.entryId, request.date, user));
      case 'summary': return jsonOutput_(summaryResponse_(normalizeDate_(request.date || todayIso_())));
      case 'closeOperational': return jsonOutput_(closeOperational_(request.date, user));
      case 'reconcile': return jsonOutput_(reconcile_(request.payload, user));
      case 'ping': return jsonOutput_({ ok: true, service: 'caixa-avista', date: todayIso_(), authMode: gate.mode });
      default: return jsonOutput_(fail_('Ação inválida ou ausente.', 'INVALID_ACTION'));
    }
  } catch (error) {
    console.error('[CAIXA_AVISTA][doPost] ' + (error && error.stack ? error.stack : error));
    return jsonOutput_(fail_(error.message || String(error), error.code || 'INTERNAL_ERROR'));
  }
}
