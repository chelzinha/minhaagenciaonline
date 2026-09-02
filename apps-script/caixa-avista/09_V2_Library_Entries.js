function v2ResolveContext_(env, user) {
  var requestedUnitId = String(
    user && user.requestedUnitId || ''
  ).trim();

  var selection = v2ResolveUnitSelection_(
    env,
    user,
    requestedUnitId
  );

  if (!selection.ok) {
    throw appError_(
      selection.message ||
        'Não foi possível resolver a unidade do usuário.',
      selection.code || 'UNIT_CONTEXT_ERROR'
    );
  }

  if (
    selection.requiresSelection ||
    !selection.selectedUnit
  ) {
    throw appError_(
      'Escolha a unidade antes de continuar.',
      'UNIT_SELECTION_REQUIRED'
    );
  }

  var selectedUnitId = String(
    selection.selectedUnit.id || ''
  ).trim();

  var unit = v2ReadObjects_(
    env.units,
    CAIXA_V2_CFG.HEADERS.UNITS
  ).filter(function(item) {
    return (
      String(item.unit_id) === selectedUnitId &&
      v2Bool_(item.active)
    );
  })[0];

  if (!unit) {
    throw appError_(
      'Unidade selecionada não encontrada ou inativa.',
      'UNIT_NOT_FOUND'
    );
  }

  var permissions =
    selection.selectedUnit.permissions || {};

  return {
    user: user,
    unit: unit,
    permissions: {
      revenue: Boolean(permissions.revenue),
      expense: Boolean(permissions.expense),
      close: Boolean(permissions.close),
      withdraw: Boolean(permissions.withdraw)
    }
  };
}
function v2Library_(env, context) {
  var unitId = String(context.unit.unit_id);
  var accounts = v2ActiveForUnit_(v2ReadObjects_(env.accounts, CAIXA_V2_CFG.HEADERS.ACCOUNTS), unitId);
  var payments = v2ActiveForUnit_(
  v2ReadObjects_(
    env.payments,
    CAIXA_V2_CFG.HEADERS.PAYMENTS
  ),
  unitId
);
  var revenues = v2ActiveForUnit_(v2ReadObjects_(env.revenues, CAIXA_V2_CFG.HEADERS.REVENUES), unitId);
  var expenses = v2ActiveForUnit_(v2ReadObjects_(env.expenses, CAIXA_V2_CFG.HEADERS.EXPENSES), unitId);
  return {
    unit: {
      id: unitId, name: String(context.unit.name || unitId),
      costCenterName: String(context.unit.cost_center_name || ''),
      costCenterContaAzulId: String(context.unit.cost_center_ca_id || '')
    },
    permissions: context.permissions,
    accounts: accounts.map(function(x){ return { id:String(x.account_id), name:String(x.name_front), contaAzulName:String(x.name_conta_azul || ''), contaAzulId:String(x.conta_azul_id || '') }; }),
    payments: payments.map(function(x){ return {
      id:String(x.payment_id),
      name:String(x.name_front),
      contaAzulMethod:String(x.conta_azul_method || ''),
      accountId:String(x.account_id || ''),
      allowRevenue:v2Bool_(x.allow_revenue),
      allowExpense:v2Bool_(x.allow_expense),
      allowBatch:v2Bool_(x.allow_batch),
      generatePix:v2Bool_(x.generate_pix),
      pixMode:String(x.pix_mode || ''),
      pixKey:String(x.pix_key || ''),
      pixReceiverName:String(x.pix_receiver_name || ''),
      pixCity:String(x.pix_city || ''),
      pixActive:v2Bool_(x.pix_active),
      pixShareMessage:String(x.pix_share_message || ''),
      icon:String(x.icon || 'payments'),
      color:String(x.color || '#1677ff')
    }; }),
    revenueTypes: revenues.map(function(x){ return {
      id:String(x.revenue_type_id), name:String(x.name_front), descriptionDefault:String(x.description_default || ''), categoryName:String(x.category_name || ''),
      categoryContaAzulId:String(x.category_ca_id || ''), allowAttendance:v2Bool_(x.allow_attendance), allowSingle:v2Bool_(x.allow_single), allowBatch:v2Bool_(x.allow_batch),
      requireClient:v2Bool_(x.require_client), requireDescription:v2Bool_(x.require_description), icon:String(x.icon || 'point_of_sale'), color:String(x.color || '#1677ff')
    }; }),
    expenseTypes: expenses.map(function(x){ return {
      id:String(x.expense_type_id), name:String(x.name_front), descriptionDefault:String(x.description_default || ''), categoryName:String(x.category_name || ''),
      categoryContaAzulId:String(x.category_ca_id || ''), defaultPaymentId:String(x.default_payment_id || ''), defaultAccountId:String(x.default_account_id || ''),
      allowBatch:v2Bool_(x.allow_batch), requireDescription:v2Bool_(x.require_description), icon:String(x.icon || 'remove_circle'), color:String(x.color || '#ef4444')
    }; })
  };
}

function v2Init_(dateValue, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var env = v2Environment_();
    v2SeedLibrary_(env);

    var context = v2ResolveContext_(env, user);
    var date = v2Today_();
    var unitId = String(context.unit.unit_id);

    return {
      ok: true,
      serverDate: date,
      timezone: CAIXA_V2_CFG.TIMEZONE,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      },
      library: v2Library_(env, context),
      clients: v2ListClients_(env),
      entries: v2EntriesByDate_(env, date, unitId),
      withdrawals: v2WithdrawalsByDate_(env, date, unitId),
      summary: v2BuildSummary_(env, date, unitId),
      closure: v2FindClosure_(env, date, unitId)
    };
  } finally {
    lock.releaseLock();
  }
}

function v2ListClients_(env) {
  return v2ReadObjects_(env.clients, CAIXA_V2_CFG.HEADERS.CLIENTS).filter(function(x){ return v2Bool_(x.active); }).map(function(x){
    return { id:String(x.client_id), name:String(x.name) };
  });
}

function v2SaveClient_(nameValue, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var env = v2Environment_();
    var name = String(nameValue || '').replace(/\s+/g,' ').trim();

    if (name.length < 2 || name.length > 120) {
      throw appError_('Nome de cliente inválido.', 'INVALID_CLIENT');
    }

    var normalized = v2Normalize_(name);
    var clients = v2ReadObjects_(
      env.clients,
      CAIXA_V2_CFG.HEADERS.CLIENTS
    );

    var existing = clients.filter(function(x){
      return String(x.normalized_name) === normalized && v2Bool_(x.active);
    })[0];

    if (existing) {
      return {
        ok:true,
        client:{
          id:String(existing.client_id),
          name:String(existing.name)
        }
      };
    }

    var id = Utilities.getUuid();
    env.clients.appendRow([id,name,normalized,new Date(),user.id,true]);

    return { ok:true, client:{ id:id, name:name } };
  } finally {
    lock.releaseLock();
  }
}

function v2FindEntryRecordById_(env, entryId) {
  var wanted = String(entryId || '').trim();
  if (!wanted) return null;

  return v2ReadObjects_(
    env.entries,
    CAIXA_V2_CFG.HEADERS.ENTRIES
  ).filter(function(item){
    return String(item.entry_id || '').trim() === wanted;
  })[0] || null;
}

function v2AssertIdempotentEntry_(record, draft) {
  var entry = v2RowEntry_(record._row);

  var same = (
    entry.id === draft.entryId &&
    entry.date === draft.date &&
    entry.unitId === draft.unitId &&
    entry.type === draft.type &&
    entry.mode === draft.mode &&
    entry.amountCents === draft.amountCents &&
    entry.paymentId === draft.payment.id &&
    entry.categoryId === draft.category.id &&
    String(entry.clientName || '') === String(draft.clientName || '') &&
    Number(entry.objectCount || 0) === Number(draft.objectCount || 0)
  );

  if (!same) {
    throw appError_(
      'O identificador deste lançamento já foi usado com dados diferentes. Atualize o caixa antes de tentar novamente.',
      'IDEMPOTENCY_CONFLICT'
    );
  }

  return entry;
}

function v2SaveEntry_(payload, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var library = v2Library_(env, context);
    var draft = v2ValidateDraft_(payload, context, library);

    var existingRecord = v2FindEntryRecordById_(env, draft.entryId);

    if (existingRecord) {
      var existingEntry = v2AssertIdempotentEntry_(existingRecord, draft);
      return {
        ok: true,
        idempotent: true,
        entry: existingEntry,
        summary: v2BuildSummary_(env, draft.date, draft.unitId)
      };
    }

    v2AssertOpen_(env, draft.date, draft.unitId);

    var entry = v2BuildEntry_(draft, user, context, library, '', 1);
    env.entries.appendRow(v2EntryRow_(entry));

    return {
      ok:true,
      entry:entry,
      summary:v2BuildSummary_(env,draft.date,draft.unitId)
    };
  } finally {
    lock.releaseLock();
  }
}

function v2SaveBatch_(payloads, user) {
  if (!Array.isArray(payloads) || !payloads.length) {
    throw appError_('Lote vazio.', 'EMPTY_BATCH');
  }

  if (payloads.length > CAIXA_V2_CFG.MAX_BATCH) {
    throw appError_('O lote aceita no máximo 100 itens.', 'BATCH_TOO_LARGE');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var library = v2Library_(env, context);

    var drafts = payloads.map(function(payload){
      return v2ValidateDraft_(payload, context, library);
    });

    var date = drafts[0].date;
    var unitId = drafts[0].unitId;

    drafts.forEach(function(draft){
      if (draft.date !== date || draft.unitId !== unitId) {
        throw appError_(
          'Todos os itens do lote devem ter a mesma data e unidade.',
          'MIXED_BATCH'
        );
      }
    });

    var existingById = {};
    v2ReadObjects_(
      env.entries,
      CAIXA_V2_CFG.HEADERS.ENTRIES
    ).forEach(function(item){
      var id = String(item.entry_id || '').trim();
      if (id) existingById[id] = item;
    });

    var batchId = '';
    var outputEntries = new Array(drafts.length);
    var missing = [];

    drafts.forEach(function(draft, index){
      var record = existingById[draft.entryId];

      if (record) {
        var existing = v2AssertIdempotentEntry_(record, draft);
        outputEntries[index] = existing;
        if (!batchId && existing.batchId) batchId = existing.batchId;
        return;
      }

      missing.push({ draft:draft, index:index });
    });

    if (missing.length) {
      v2AssertOpen_(env, date, unitId);
      if (!batchId) batchId = Utilities.getUuid();

      var newEntries = missing.map(function(item){
        var entry = v2BuildEntry_(
          item.draft,
          user,
          context,
          library,
          batchId,
          item.index + 1
        );
        outputEntries[item.index] = entry;
        return entry;
      });

      env.entries
        .getRange(
          env.entries.getLastRow()+1,
          1,
          newEntries.length,
          CAIXA_V2_CFG.HEADERS.ENTRIES.length
        )
        .setValues(newEntries.map(v2EntryRow_));
    }

    return {
      ok:true,
      idempotent: missing.length === 0,
      batchId: batchId || (outputEntries[0] && outputEntries[0].batchId) || '',
      entries: outputEntries,
      summary:v2BuildSummary_(env,date,unitId)
    };
  } finally {
    lock.releaseLock();
  }
}

function v2ValidateDraft_(payload, context, library) {
  if (!payload || typeof payload !== 'object') {
    throw appError_('Dados ausentes.', 'INVALID_PAYLOAD');
  }

  var type = String(payload.type || '').toUpperCase();

  if (type !== 'RECEITA' && type !== 'DESPESA') {
    throw appError_('Tipo inválido.', 'INVALID_TYPE');
  }

  if (type === 'RECEITA' && !context.permissions.revenue) {
    throw appError_('Usuário sem permissão para receitas.', 'FORBIDDEN');
  }

  if (type === 'DESPESA' && !context.permissions.expense) {
    throw appError_('Usuário sem permissão para despesas.', 'FORBIDDEN');
  }

  var entryId = String(payload.entryId || '').trim();

  if (!entryId || entryId.length > 100) {
    throw appError_(
      'Identificador seguro do lançamento ausente.',
      'ENTRY_ID_REQUIRED'
    );
  }

  var date = v2Today_();
  var amountCents = Math.round(Number(payload.amountCents || 0));

  if (!(amountCents > 0)) {
    throw appError_('Valor inválido.', 'INVALID_AMOUNT');
  }

  var payment = library.payments.filter(function(x){
    return x.id === String(payload.paymentId || '');
  })[0];

  if (!payment) {
    throw appError_('Forma de pagamento não configurada.', 'PAYMENT_REQUIRED');
  }

  if (type === 'RECEITA' && !payment.allowRevenue) {
    throw appError_('Pagamento não permitido para receita.', 'PAYMENT_NOT_ALLOWED');
  }

  if (type === 'DESPESA' && !payment.allowExpense) {
    throw appError_('Pagamento não permitido para despesa.', 'PAYMENT_NOT_ALLOWED');
  }

  var categoryId = String(payload.categoryId || '');

  var category = type === 'RECEITA'
    ? library.revenueTypes.filter(function(x){ return x.id === categoryId; })[0]
    : library.expenseTypes.filter(function(x){ return x.id === categoryId; })[0];

  if (!category) {
    throw appError_('Categoria não configurada.', 'CATEGORY_REQUIRED');
  }

  var mode = String(
    payload.mode || (type === 'RECEITA' ? 'AVULSO' : 'INDIVIDUAL')
  ).toUpperCase();

  if (mode === 'LOTE' && !payment.allowBatch) {
    throw appError_(
      'Esta forma de pagamento não permite lançamento em lote.',
      'BATCH_PAYMENT_NOT_ALLOWED'
    );
  }

  if (type === 'RECEITA') {
    if (mode === 'ATENDIMENTO' && !category.allowAttendance) {
      throw appError_('Esta receita não permite atendimento.', 'MODE_NOT_ALLOWED');
    }
    if (mode === 'AVULSO' && !category.allowSingle) {
      throw appError_('Esta receita não permite lançamento avulso.', 'MODE_NOT_ALLOWED');
    }
    if (mode === 'LOTE' && !category.allowBatch) {
      throw appError_('Esta receita não permite lote.', 'MODE_NOT_ALLOWED');
    }
  } else if (mode === 'LOTE' && !category.allowBatch) {
    throw appError_('Esta despesa não permite lote.', 'MODE_NOT_ALLOWED');
  }

  var isPix = payment.contaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO';
  var pixStatus = String(payload.pixStatus || '').toUpperCase().trim();
  var pixTxid = String(payload.pixTxid || '').trim();
  var pixProvider = String(payload.pixProvider || '').trim();

  if (isPix) {
    if (type !== 'RECEITA' || mode !== 'ATENDIMENTO') {
      throw appError_(
        'Pix Santander só pode ser usado no atendimento individual de receita.',
        'PIX_MODE_NOT_ALLOWED'
      );
    }

    if (
      payment.pixActive !== true ||
      String(payment.pixMode || '').toUpperCase() !== 'LOCAL_STATIC' ||
      !String(payment.pixKey || '').trim() ||
      !String(payment.pixReceiverName || '').trim() ||
      !String(payment.pixCity || '').trim()
    ) {
      throw appError_(
        'A configuração Pix desta unidade está incompleta.',
        'PIX_CONFIG_REQUIRED'
      );
    }

    if (pixStatus !== 'PENDENTE') {
      throw appError_(
        'Uma nova cobrança Pix deve nascer como pendente.',
        'PIX_INITIAL_STATUS_INVALID'
      );
    }

    if (!/^[A-Za-z0-9]{1,25}$/.test(pixTxid)) {
      throw appError_(
        'TXID Pix inválido.',
        'INVALID_PIX_TXID'
      );
    }

    if (pixProvider !== 'local') {
      throw appError_(
        'Provedor Pix inválido.',
        'INVALID_PIX_PROVIDER'
      );
    }
  } else {
    pixStatus = '';
    pixTxid = '';
    pixProvider = '';
  }

  var clientName = String(payload.clientName || '')
    .replace(/\s+/g,' ')
    .trim();

  var clientId = String(payload.clientId || '').trim();

  if (type === 'RECEITA' && mode === 'ATENDIMENTO' && !clientName) {
    throw appError_(
      'Selecione ou cadastre o cliente do atendimento.',
      'CLIENT_REQUIRED'
    );
  }

  if (type === 'RECEITA' && category.requireClient && !clientName) {
    throw appError_('Cliente obrigatório para esta categoria.', 'CLIENT_REQUIRED');
  }

  var description = String(payload.description || '')
    .replace(/\s+/g,' ')
    .trim() || String(category.descriptionDefault || '');

  if (category.requireDescription && !description) {
    throw appError_('Descrição obrigatória.', 'DESCRIPTION_REQUIRED');
  }

  var accountId = String(
    payload.accountId ||
    payment.accountId ||
    (category.defaultAccountId || '')
  ).trim();

  var account = library.accounts.filter(function(x){
    return x.id === accountId;
  })[0];

  if (!account) {
    throw appError_('Conta financeira não configurada.', 'ACCOUNT_REQUIRED');
  }

  return {
    entryId: entryId,
    type: type,
    mode: mode,
    date: date,
    unitId: String(context.unit.unit_id),
    amountCents: amountCents,
    clientId: clientId,
    clientName: clientName,
    clientSource: clientName
      ? (clientId ? 'CADASTRADO' : 'INFORMADO')
      : 'SEM_CLIENTE',
    objectCount: Math.max(
      0,
      Math.min(999, parseInt(payload.objectCount,10) || 0)
    ),
    payment: payment,
    account: account,
    category: category,
    description: description,
    pixStatus: pixStatus,
    pixTxid: pixTxid,
    pixProvider: pixProvider
  };
}

function v2BuildEntry_(draft, user, context, library, batchId, batchIndex) {
  var pixStatus = draft.payment.contaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO'
    ? draft.pixStatus
    : '';

  return {
    id:draft.entryId,
    batchId:batchId || '',
    batchIndex:batchIndex || 1,
    date:draft.date,
    createdAt:new Date().toISOString(),
    type:draft.type,
    mode:draft.mode,
    unitId:draft.unitId,
    operatorId:user.id,
    operatorName:user.name,
    clientId:draft.clientId,
    clientName:draft.clientName,
    clientSource:draft.clientSource,
    objectCount:draft.type === 'RECEITA' ? (draft.objectCount || 0) : 0,
    amountCents:draft.amountCents,
    paymentId:draft.payment.id,
    paymentName:draft.payment.name,
    paymentContaAzulMethod:draft.payment.contaAzulMethod,
    accountId:draft.account.id,
    accountContaAzulId:draft.account.contaAzulId,
    accountContaAzulName:draft.account.contaAzulName,
    categoryId:draft.category.id,
    categoryContaAzulId:draft.category.categoryContaAzulId,
    categoryContaAzulName:draft.category.categoryName,
    costCenterContaAzulId:String(context.unit.cost_center_ca_id || ''),
    costCenterContaAzulName:String(context.unit.cost_center_name || ''),
    description:draft.description,
    pixStatus:pixStatus,
    pixTxid:draft.pixTxid,
    pixE2eid:'',
    pixReceivedAt:'',
    pixProvider:draft.pixProvider,
    status:'ATIVO',
    closureId:'',
    contaAzulStatus:'NAO_ENVIADO',
    contaAzulProtocol:'',
    contaAzulLastError:'',
    contaAzulAttempts:0,
    contaAzulSyncedAt:''
  };
}

function v2EntryRow_(e) {
  return [
    e.id,
    e.batchId,
    e.batchIndex,
    e.date,
    new Date(e.createdAt),
    e.type,
    e.mode,
    e.unitId,
    e.operatorId,
    e.operatorName,
    e.clientId,
    e.clientName,
    e.clientSource,
    e.objectCount,
    e.amountCents,
    e.paymentId,
    e.paymentName,
    e.paymentContaAzulMethod,
    e.accountId,
    e.accountContaAzulId,
    e.accountContaAzulName,
    e.categoryId,
    e.categoryContaAzulId,
    e.categoryContaAzulName,
    e.costCenterContaAzulId,
    e.costCenterContaAzulName,
    e.description,
    e.pixStatus,
    e.pixTxid,
    e.pixE2eid,
    e.pixReceivedAt,
    e.pixProvider,
    e.status,
    e.closureId,
    e.contaAzulStatus,
    e.contaAzulProtocol,
    e.contaAzulLastError,
    e.contaAzulAttempts,
    e.contaAzulSyncedAt,
    e.deletedAt || '',
    e.deletedBy || '',
    e.deletedByName || '',
    e.deleteReason || ''
  ];
}

function v2SheetDateIso_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      CAIXA_V2_CFG.TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  var text = String(
    value == null ? '' : value
  ).trim();

  if (!text) {
    return '';
  }

  var isoMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (isoMatch) {
    return (
      isoMatch[1] +
      '-' +
      isoMatch[2] +
      '-' +
      isoMatch[3]
    );
  }

  var brMatch = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (brMatch) {
    return (
      brMatch[3] +
      '-' +
      brMatch[2] +
      '-' +
      brMatch[1]
    );
  }

  var parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(
      parsed,
      CAIXA_V2_CFG.TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  return text;
}
function v2RowEntry_(row) {
  var h = CAIXA_V2_CFG.HEADERS.ENTRIES;
  var o = {}; h.forEach(function(k,i){ o[k]=row[i]; });
  return {
    id:String(o.entry_id),batchId:String(o.batch_id||''),batchIndex:Number(o.batch_index||1),date:v2SheetDateIso_(o.date_iso),createdAt:v2Iso_(o.created_at),type:String(o.type),mode:String(o.mode),unitId:String(o.unit_id),operatorId:String(o.operator_id),operatorName:String(o.operator_name),clientId:String(o.client_id||''),clientName:String(o.client_name||''),clientSource:String(o.client_source||''),objectCount:Number(o.object_count||0),amountCents:Number(o.amount_cents||0),paymentId:String(o.payment_id),paymentName:String(o.payment_name),paymentContaAzulMethod:String(o.payment_ca_method||''),accountId:String(o.account_id||''),accountContaAzulId:String(o.account_ca_id_snapshot||''),accountContaAzulName:String(o.account_ca_name_snapshot||''),categoryId:String(o.category_id||''),categoryContaAzulId:String(o.category_ca_id_snapshot||''),categoryContaAzulName:String(o.category_ca_name_snapshot||''),costCenterContaAzulId:String(o.cost_center_ca_id_snapshot||''),costCenterContaAzulName:String(o.cost_center_ca_name_snapshot||''),description:String(o.description||''),pixStatus:String(o.pix_status||''),pixTxid:String(o.pix_txid||''),pixE2eid:String(o.pix_e2eid||''),pixReceivedAt:v2Iso_(o.pix_received_at),pixProvider:String(o.pix_provider||''),status:String(o.status||'ATIVO'),closureId:String(o.closure_id||''),contaAzulStatus:String(o.conta_azul_status||'NAO_ENVIADO'),contaAzulProtocol:String(o.conta_azul_protocol||''),contaAzulLastError:String(o.conta_azul_last_error||''),contaAzulAttempts:Number(o.conta_azul_attempts||0),contaAzulSyncedAt:v2Iso_(o.conta_azul_synced_at),
    deletedAt:v2Iso_(o.deleted_at),
    deletedBy:String(o.deleted_by||''),
    deletedByName:String(o.deleted_by_name||''),
    deleteReason:String(o.delete_reason||'')
  };
}

function v2EntriesByDate_(env,date,unitId) {
  var wantedDate = v2SheetDateIso_(date);

  var wantedUnit = String(
    unitId || ''
  ).trim();

  var last = env.entries.getLastRow();

  if (last < 2) {
    return [];
  }

  return env.entries
    .getRange(
      2,
      1,
      last - 1,
      CAIXA_V2_CFG.HEADERS.ENTRIES.length
    )
    .getValues()
    .map(v2RowEntry_)
    .filter(function(entry) {
      return (
        v2SheetDateIso_(entry.date) ===
          wantedDate &&
        String(entry.unitId || '').trim() ===
          wantedUnit &&
        entry.status !== 'EXCLUIDO'
      );
    });
}

function v2WithdrawalsByDate_(env,date,unitId) {
  var wantedDate = v2SheetDateIso_(date);

  var wantedUnit = String(
    unitId || ''
  ).trim();

  return v2ReadObjects_(
    env.withdrawals,
    CAIXA_V2_CFG.HEADERS.WITHDRAWALS
  )
    .filter(function(item) {
      return (
        v2SheetDateIso_(item.date_iso) ===
          wantedDate &&
        String(item.unit_id || '').trim() ===
          wantedUnit
      );
    })
    .map(function(item) {
      return {
        id: String(item.withdrawal_id),
        date: v2SheetDateIso_(item.date_iso),
        createdAt: v2Iso_(item.created_at),
        unitId: String(item.unit_id),
        operatorId: String(item.operator_id),
        operatorName: String(item.operator_name),
        amountCents:
          Number(item.amount_cents || 0),
        destination:
          String(item.destination || ''),
        notes:
          String(item.notes || ''),
        balanceBeforeCents:
          Number(
            item.balance_before_cents || 0
          ),
        balanceAfterCents:
          Number(
            item.balance_after_cents || 0
          ),
        confirmed:
          v2Bool_(item.confirmed),
        pdfStatus:
          String(item.pdf_status || ''),
        pdfUrl:
          String(item.pdf_url || '')
      };
    });
}

function v2DeleteEntry_(payload, user) {
  payload = payload || {};

  var entryId = String(
    payload.entryId || ''
  ).trim();

  var reason = String(
    payload.reason || ''
  )
    .replace(/\s+/g, ' ')
    .trim();

  if (!entryId) {
    throw appError_(
      'Informe o lançamento que será excluído.',
      'ENTRY_REQUIRED'
    );
  }

  if (
    reason.length < 3 ||
    reason.length > 250
  ) {
    throw appError_(
      'Informe um motivo de exclusão entre 3 e 250 caracteres.',
      'DELETE_REASON_REQUIRED'
    );
  }

  var lock =
    LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    var env =
      v2Environment_();

    var context =
      v2ResolveContext_(
        env,
        user
      );

    var headers =
      CAIXA_V2_CFG
        .HEADERS
        .ENTRIES;

    var item =
      v2ReadObjects_(
        env.entries,
        headers
      ).filter(function(record) {
        return (
          String(record.entry_id) ===
          entryId
        );
      })[0];

    if (!item) {
      throw appError_(
        'Lançamento não encontrado.',
        'ENTRY_NOT_FOUND'
      );
    }

    var unitId = String(
      item.unit_id || ''
    ).trim();

    var contextUnitId = String(
      context.unit.unit_id || ''
    ).trim();

    if (
      unitId !== contextUnitId
    ) {
      throw appError_(
        'O lançamento pertence a outra unidade.',
        'UNIT_MISMATCH'
      );
    }

    var type = String(
      item.type || ''
    ).toUpperCase();

    if (
      type === 'RECEITA' &&
      !context.permissions.revenue
    ) {
      throw appError_(
        'Usuário sem permissão para excluir receitas.',
        'FORBIDDEN'
      );
    }

    if (
      type === 'DESPESA' &&
      !context.permissions.expense
    ) {
      throw appError_(
        'Usuário sem permissão para excluir despesas.',
        'FORBIDDEN'
      );
    }

    var status = String(
      item.status || 'ATIVO'
    ).toUpperCase();

    if (status === 'EXCLUIDO') {
      return {
        ok: true,
        alreadyDeleted: true,
        entry:
          v2RowEntry_(item._row),
        summary:
          v2BuildSummary_(
            env,
            v2SheetDateIso_(
              item.date_iso
            ),
            unitId
          )
      };
    }

    if (
      String(
        item.closure_id || ''
      ).trim()
    ) {
      throw appError_(
        'Este lançamento já pertence a um fechamento e não pode ser excluído.',
        'ENTRY_ALREADY_CLOSED'
      );
    }

    var contaAzulStatus = String(
      item.conta_azul_status ||
      'NAO_ENVIADO'
    ).toUpperCase();

    if (
      [
        '',
        'NAO_ENVIADO',
        'CANCELADO'
      ].indexOf(
        contaAzulStatus
      ) < 0
    ) {
      throw appError_(
        'Este lançamento já entrou no fluxo do Conta Azul e não pode ser excluído.',
        'ENTRY_ALREADY_SYNCED'
      );
    }

    var date =
      v2SheetDateIso_(
        item.date_iso
      );

    v2AssertOpen_(
      env,
      date,
      unitId
    );

    var row =
      item._row.slice();

    function setField(
      name,
      value
    ) {
      var index =
        headers.indexOf(name);

      if (index >= 0) {
        row[index] = value;
      }
    }

    setField(
      'status',
      'EXCLUIDO'
    );

    setField(
      'deleted_at',
      new Date()
    );

    setField(
      'deleted_by',
      String(user.id || '')
    );

    setField(
      'deleted_by_name',
      String(user.name || '')
    );

    setField(
      'delete_reason',
      reason
    );

    setField(
      'conta_azul_status',
      'CANCELADO'
    );

    var pixStatus = String(
      item.pix_status || ''
    ).toUpperCase();

    if (
      [
        'CRIANDO',
        'ATIVA',
        'PENDENTE'
      ].indexOf(
        pixStatus
      ) >= 0
    ) {
      setField(
        'pix_status',
        'CANCELADO'
      );
    }

    env.entries
      .getRange(
        item._sheetRow,
        1,
        1,
        headers.length
      )
      .setValues([row]);

    return {
      ok: true,
      entry:
        v2RowEntry_(row),
      summary:
        v2BuildSummary_(
          env,
          date,
          unitId
        )
    };
  } finally {
    lock.releaseLock();
  }
}
