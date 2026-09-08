'use strict';

import { normalizedUsername } from './auth.js';

const TIMEZONE = 'America/Fortaleza';

const TABLE_SPECS = Object.freeze({
  units: {
    table: 'caixa_units',
    keys: ['unit_id'],
    columns: [
      'unit_id','name','cost_center_name','cost_center_ca_id',
      'default_revenue_contact_ca_id','default_expense_contact_ca_id',
      'drive_root_folder_id','active'
    ]
  },
  users: {
    table: 'caixa_user_units',
    keys: ['username','unit_id'],
    columns: [
      'username','unit_id','can_revenue','can_expense',
      'can_close','can_withdraw','active'
    ]
  },
  accounts: {
    table: 'caixa_accounts',
    keys: ['account_id','unit_id'],
    columns: [
      'account_id','unit_id','name_front','name_conta_azul',
      'conta_azul_id','active','sort_order'
    ]
  },
  payments: {
    table: 'caixa_payments',
    keys: ['payment_id','unit_id'],
    columns: [
      'payment_id','unit_id','name_front','conta_azul_method','account_id',
      'allow_revenue','allow_expense','allow_batch','generate_pix','icon','color',
      'active','sort_order','pix_mode','pix_key','pix_receiver_name','pix_city',
      'pix_active','pix_share_message'
    ]
  },
  revenues: {
    table: 'caixa_revenue_types',
    keys: ['revenue_type_id','unit_id'],
    columns: [
      'revenue_type_id','unit_id','name_front','description_default','category_name',
      'category_ca_id','allow_attendance','allow_single','allow_batch','require_client',
      'require_description','icon','color','active','sort_order'
    ]
  },
  expenses: {
    table: 'caixa_expense_types',
    keys: ['expense_type_id','unit_id'],
    columns: [
      'expense_type_id','unit_id','name_front','description_default','category_name',
      'category_ca_id','default_payment_id','default_account_id','allow_batch',
      'require_description','icon','color','active','sort_order'
    ]
  },
  clients: {
    table: 'caixa_clients',
    keys: ['client_id'],
    columns: ['client_id','name','normalized_name','created_at','created_by','active']
  },
  entries: {
    table: 'caixa_entries',
    keys: ['entry_id'],
    columns: [
      'entry_id','batch_id','batch_index','date_iso','created_at','type','mode','unit_id',
      'operator_id','operator_name','client_id','client_name','client_source','object_count',
      'amount_cents','payment_id','payment_name','payment_ca_method','account_id',
      'account_ca_id_snapshot','account_ca_name_snapshot','category_id','category_ca_id_snapshot',
      'category_ca_name_snapshot','cost_center_ca_id_snapshot','cost_center_ca_name_snapshot',
      'description','pix_status','pix_txid','pix_e2eid','pix_received_at','pix_provider','status',
      'closure_id','conta_azul_status','conta_azul_protocol','conta_azul_last_error',
      'conta_azul_attempts','conta_azul_synced_at','deleted_at','deleted_by',
      'deleted_by_name','delete_reason'
    ]
  },
  dailyBalances: {
    table: 'caixa_daily_balances',
    keys: ['unit_id','date_iso'],
    columns: [
      'unit_id','date_iso','opening_cash_cents','opening_source','created_at','created_by',
      'expected_cash_cents','counted_cash_cents','difference_cents','closing_withdrawal_cents',
      'carryover_cents','status'
    ]
  },
  withdrawals: {
    table: 'caixa_withdrawals',
    keys: ['withdrawal_id'],
    columns: [
      'withdrawal_id','date_iso','created_at','unit_id','operator_id','operator_name',
      'amount_cents','destination','notes','balance_before_cents','balance_after_cents',
      'declaration_version','declaration_text','confirmed','confirmed_at','closure_id',
      'pdf_status','pdf_file_id','pdf_url'
    ]
  },
  closures: {
    table: 'caixa_closures',
    keys: ['closure_id'],
    columns: [
      'closure_id','date_iso','unit_id','unit_name','cost_center_ca_id_snapshot',
      'cost_center_ca_name_snapshot','created_at','created_by','created_by_name','status',
      'revenue_cents','expense_cents','net_cents','payment_totals_json','payment_counts_json',
      'opening_cash_cents','cash_revenue_cents','cash_expense_cents',
      'withdrawals_before_close_cents','expected_cash_cents','counted_cash_cents',
      'difference_cents','closing_withdrawal_cents','carryover_cents','notes',
      'declaration_version','declaration_text','declaration_confirmed','declaration_confirmed_at',
      'pdf_status','pdf_file_id','pdf_url','conta_azul_status'
    ]
  },
  supplements: {
    table: 'caixa_closure_supplements',
    keys: ['supplement_id'],
    columns: [
      'supplement_id','date_iso','unit_id','unit_name','base_closure_id','sequence',
      'created_at','created_by','created_by_name','status','revenue_cents','expense_cents',
      'net_cents','cash_revenue_cents','cash_expense_cents','expected_cash_cents',
      'counted_cash_cents','closing_withdrawal_cents','carryover_cents','notes','entry_ids_json'
    ]
  },
  contaAzulQueue: {
    table: 'caixa_conta_azul_queue',
    keys: ['queue_id'],
    columns: [
      'queue_id','closure_id','entry_id','unit_id','entry_type','status','attempts',
      'protocol','payload_json','last_error','created_at','updated_at'
    ]
  }
});

const BOOLEAN_COLUMNS = new Set([
  'active','can_revenue','can_expense','can_close','can_withdraw',
  'allow_revenue','allow_expense','allow_batch','generate_pix','pix_active',
  'allow_attendance','allow_single','require_client','require_description',
  'confirmed','declaration_confirmed'
]);

const INTEGER_COLUMNS = new Set([
  'sort_order','batch_index','object_count','amount_cents','conta_azul_attempts',
  'opening_cash_cents','expected_cash_cents','counted_cash_cents','difference_cents',
  'closing_withdrawal_cents','carryover_cents','balance_before_cents','balance_after_cents',
  'revenue_cents','expense_cents','net_cents','cash_revenue_cents','cash_expense_cents',
  'withdrawals_before_close_cents','sequence','attempts'
]);

function bool(value) {
  if (value === true || value === 1 || value === '1') return 1;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return ['true','sim','yes','y'].includes(text) ? 1 : 0;
}

function valueForColumn(column, value) {
  if (BOOLEAN_COLUMNS.has(column)) return bool(value);
  if (INTEGER_COLUMNS.has(column)) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? Math.round(number) : 0;
  }
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function safeJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function batchStatements(db, statements, chunkSize = 75) {
  for (let start = 0; start < statements.length; start += chunkSize) {
    const chunk = statements.slice(start, start + chunkSize);
    if (chunk.length) await db.batch(chunk);
  }
}

async function upsertRows(db, spec, rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;

  const columns = spec.columns;
  const keys = new Set(spec.keys);
  const updateColumns = columns.filter(column => !keys.has(column));
  const placeholders = columns.map(() => '?').join(',');
  const conflict = spec.keys.join(',');
  const assignments = updateColumns
    .map(column => `${column}=excluded.${column}`)
    .concat(['updated_at=CURRENT_TIMESTAMP'])
    .join(',');

  const sql = `INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${placeholders}) ` +
    `ON CONFLICT(${conflict}) DO UPDATE SET ${assignments}`;

  const statements = rows.map(row =>
    db.prepare(sql).bind(
      ...columns.map(column => valueForColumn(column, row?.[column]))
    )
  );

  await batchStatements(db, statements);
  return rows.length;
}

export async function importLegacySnapshot(db, snapshot) {
  const source = snapshot?.snapshot || snapshot || {};
  const counts = {};

  for (const [name, spec] of Object.entries(TABLE_SPECS)) {
    counts[name] = await upsertRows(db, spec, source[name] || []);
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO caixa_meta(key,value,updated_at) VALUES('legacy_snapshot_version',?,?) ` +
      `ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).bind(String(source.version || 'caixa-d1-v1'), now),
    db.prepare(
      `INSERT INTO caixa_meta(key,value,updated_at) VALUES('last_legacy_sync_at',?,?) ` +
      `ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).bind(String(source.generatedAt || now), now)
  ]);

  return { ok: true, counts, syncedAt: source.generatedAt || now };
}

export async function importLegacyUnitSnapshot(db, snapshot) {
  const source = snapshot?.snapshot || snapshot || {};
  const allowed = ['entries','dailyBalances','withdrawals','closures','supplements','contaAzulQueue'];
  const counts = {};

  for (const name of allowed) {
    counts[name] = await upsertRows(db, TABLE_SPECS[name], source[name] || []);
  }

  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO caixa_meta(key,value,updated_at) VALUES('last_unit_sync_at',?,?) ` +
    `ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).bind(String(source.generatedAt || now), now).run();

  return { ok: true, counts, syncedAt: source.generatedAt || now };
}

export async function upsertClientFromApi(db, client) {
  if (!client?.id) return;
  await upsertRows(db, TABLE_SPECS.clients, [{
    client_id: client.id,
    name: client.name || '',
    normalized_name: normalizeText(client.name || ''),
    created_at: client.createdAt || new Date().toISOString(),
    created_by: client.createdBy || '',
    active: true
  }]);
}

export async function upsertEntriesFromApi(db, entries) {
  const rows = (Array.isArray(entries) ? entries : [entries])
    .filter(Boolean)
    .map(entry => ({
      entry_id: entry.id,
      batch_id: entry.batchId || '',
      batch_index: entry.batchIndex || 1,
      date_iso: entry.date || '',
      created_at: entry.createdAt || '',
      type: entry.type || '',
      mode: entry.mode || '',
      unit_id: entry.unitId || '',
      operator_id: entry.operatorId || '',
      operator_name: entry.operatorName || '',
      client_id: entry.clientId || '',
      client_name: entry.clientName || '',
      client_source: entry.clientSource || '',
      object_count: entry.objectCount || 0,
      amount_cents: entry.amountCents || 0,
      payment_id: entry.paymentId || '',
      payment_name: entry.paymentName || '',
      payment_ca_method: entry.paymentContaAzulMethod || '',
      account_id: entry.accountId || '',
      account_ca_id_snapshot: entry.accountContaAzulId || '',
      account_ca_name_snapshot: entry.accountContaAzulName || '',
      category_id: entry.categoryId || '',
      category_ca_id_snapshot: entry.categoryContaAzulId || '',
      category_ca_name_snapshot: entry.categoryContaAzulName || '',
      cost_center_ca_id_snapshot: entry.costCenterContaAzulId || '',
      cost_center_ca_name_snapshot: entry.costCenterContaAzulName || '',
      description: entry.description || '',
      pix_status: entry.pixStatus || '',
      pix_txid: entry.pixTxid || '',
      pix_e2eid: entry.pixE2eid || '',
      pix_received_at: entry.pixReceivedAt || '',
      pix_provider: entry.pixProvider || '',
      status: entry.status || 'ATIVO',
      closure_id: entry.closureId || '',
      conta_azul_status: entry.contaAzulStatus || 'NAO_ENVIADO',
      conta_azul_protocol: entry.contaAzulProtocol || '',
      conta_azul_last_error: entry.contaAzulLastError || '',
      conta_azul_attempts: entry.contaAzulAttempts || 0,
      conta_azul_synced_at: entry.contaAzulSyncedAt || '',
      deleted_at: entry.deletedAt || '',
      deleted_by: entry.deletedBy || '',
      deleted_by_name: entry.deletedByName || '',
      delete_reason: entry.deleteReason || ''
    }));

  await upsertRows(db, TABLE_SPECS.entries, rows);
}

export async function upsertWithdrawalFromApi(db, withdrawal, unitId) {
  if (!withdrawal?.id) return;
  await upsertRows(db, TABLE_SPECS.withdrawals, [{
    withdrawal_id: withdrawal.id,
    date_iso: withdrawal.date || '',
    created_at: withdrawal.createdAt || '',
    unit_id: withdrawal.unitId || unitId || '',
    operator_id: withdrawal.operatorId || '',
    operator_name: withdrawal.operatorName || '',
    amount_cents: withdrawal.amountCents || 0,
    destination: withdrawal.destination || '',
    notes: withdrawal.notes || '',
    balance_before_cents: withdrawal.balanceBeforeCents || 0,
    balance_after_cents: withdrawal.balanceAfterCents || 0,
    declaration_version: withdrawal.declarationVersion || '',
    declaration_text: withdrawal.declarationText || '',
    confirmed: withdrawal.confirmed,
    confirmed_at: withdrawal.confirmedAt || '',
    closure_id: withdrawal.closureId || '',
    pdf_status: withdrawal.pdfStatus || '',
    pdf_file_id: withdrawal.pdfFileId || '',
    pdf_url: withdrawal.pdfUrl || ''
  }]);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function listAccessibleUnits(db, user) {
  const username = normalizedUsername(user);
  if (!username) return [];

  const result = await db.prepare(`
    SELECT
      u.unit_id AS id,
      u.name AS name,
      MAX(uu.can_revenue) AS can_revenue,
      MAX(uu.can_expense) AS can_expense,
      MAX(uu.can_close) AS can_close,
      MAX(uu.can_withdraw) AS can_withdraw
    FROM caixa_user_units uu
    JOIN caixa_units u ON u.unit_id = uu.unit_id
    WHERE lower(uu.username) = ?
      AND uu.active = 1
      AND u.active = 1
    GROUP BY u.unit_id, u.name
    ORDER BY u.name COLLATE NOCASE
  `).bind(username).all();

  return (result.results || []).map(row => ({
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    permissions: {
      revenue: Boolean(row.can_revenue),
      expense: Boolean(row.can_expense),
      close: Boolean(row.can_close),
      withdraw: Boolean(row.can_withdraw)
    }
  }));
}

export async function unitAccessResponse(db, user, requestedUnitId) {
  const username = normalizedUsername(user);
  const units = await listAccessibleUnits(db, user);
  const requested = String(requestedUnitId || '').trim();

  if (!units.length) {
    return {
      ok: false,
      code: 'UNIT_MAPPING_REQUIRED',
      message: 'Usuário sem unidade autorizada.',
      username,
      requiresUnitSelection: false,
      selectedUnit: null,
      units: []
    };
  }

  if (requested) {
    const selected = units.find(unit => unit.id === requested) || null;
    if (!selected) {
      return {
        ok: false,
        code: 'UNIT_NOT_ALLOWED',
        message: 'Usuário sem acesso à unidade solicitada.',
        username,
        requiresUnitSelection: units.length > 1,
        selectedUnit: null,
        units
      };
    }

    return {
      ok: true,
      code: '',
      message: '',
      username,
      requiresUnitSelection: false,
      selectedUnit: selected,
      units
    };
  }

  return {
    ok: true,
    code: '',
    message: '',
    username,
    requiresUnitSelection: units.length > 1,
    selectedUnit: units.length === 1 ? units[0] : null,
    units
  };
}

async function resolveContext(db, user, requestedUnitId) {
  const access = await unitAccessResponse(db, user, requestedUnitId);
  if (!access.ok) {
    const error = new Error(access.message || 'Unidade não autorizada.');
    error.code = access.code || 'UNIT_CONTEXT_ERROR';
    throw error;
  }
  if (!access.selectedUnit) {
    const error = new Error('Escolha a unidade antes de continuar.');
    error.code = 'UNIT_SELECTION_REQUIRED';
    throw error;
  }

  const unit = await db.prepare(`
    SELECT * FROM caixa_units WHERE unit_id = ? AND active = 1 LIMIT 1
  `).bind(access.selectedUnit.id).first();

  if (!unit) {
    const error = new Error('Unidade selecionada não encontrada ou inativa.');
    error.code = 'UNIT_NOT_FOUND';
    throw error;
  }

  return {
    unit,
    selected: access.selectedUnit,
    permissions: access.selectedUnit.permissions
  };
}

function preferUnitRows(rows, idField, unitId) {
  const chosen = new Map();
  for (const row of rows || []) {
    const id = String(row[idField] || '');
    if (!id) continue;
    const current = chosen.get(id);
    if (!current || String(row.unit_id) === unitId) chosen.set(id, row);
  }
  return [...chosen.values()].sort(
    (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
  );
}

async function queryUnitLibrary(db, table, idField, unitId) {
  const result = await db.prepare(
    `SELECT * FROM ${table} WHERE active = 1 AND unit_id IN (?, '*') ` +
    `ORDER BY CASE WHEN unit_id = ? THEN 0 ELSE 1 END, sort_order, ${idField}`
  ).bind(unitId, unitId).all();
  return preferUnitRows(result.results || [], idField, unitId);
}

async function buildLibrary(db, context) {
  const unitId = String(context.unit.unit_id);
  const [accounts, payments, revenues, expenses] = await Promise.all([
    queryUnitLibrary(db, 'caixa_accounts', 'account_id', unitId),
    queryUnitLibrary(db, 'caixa_payments', 'payment_id', unitId),
    queryUnitLibrary(db, 'caixa_revenue_types', 'revenue_type_id', unitId),
    queryUnitLibrary(db, 'caixa_expense_types', 'expense_type_id', unitId)
  ]);

  return {
    unit: {
      id: unitId,
      name: String(context.unit.name || unitId),
      costCenterName: String(context.unit.cost_center_name || ''),
      costCenterContaAzulId: String(context.unit.cost_center_ca_id || '')
    },
    permissions: context.permissions,
    accounts: accounts.map(row => ({
      id: String(row.account_id),
      name: String(row.name_front),
      contaAzulName: String(row.name_conta_azul || ''),
      contaAzulId: String(row.conta_azul_id || '')
    })),
    payments: payments.map(row => ({
      id: String(row.payment_id),
      name: String(row.name_front),
      contaAzulMethod: String(row.conta_azul_method || ''),
      accountId: String(row.account_id || ''),
      allowRevenue: Boolean(row.allow_revenue),
      allowExpense: Boolean(row.allow_expense),
      allowBatch: Boolean(row.allow_batch),
      generatePix: Boolean(row.generate_pix),
      pixMode: String(row.pix_mode || ''),
      pixKey: String(row.pix_key || ''),
      pixReceiverName: String(row.pix_receiver_name || ''),
      pixCity: String(row.pix_city || ''),
      pixActive: Boolean(row.pix_active),
      pixShareMessage: String(row.pix_share_message || ''),
      icon: String(row.icon || 'payments'),
      color: String(row.color || '#1677ff')
    })),
    revenueTypes: revenues.map(row => ({
      id: String(row.revenue_type_id),
      name: String(row.name_front),
      descriptionDefault: String(row.description_default || ''),
      categoryName: String(row.category_name || ''),
      categoryContaAzulId: String(row.category_ca_id || ''),
      allowAttendance: Boolean(row.allow_attendance),
      allowSingle: Boolean(row.allow_single),
      allowBatch: Boolean(row.allow_batch),
      requireClient: Boolean(row.require_client),
      requireDescription: Boolean(row.require_description),
      icon: String(row.icon || 'point_of_sale'),
      color: String(row.color || '#1677ff')
    })),
    expenseTypes: expenses.map(row => ({
      id: String(row.expense_type_id),
      name: String(row.name_front),
      descriptionDefault: String(row.description_default || ''),
      categoryName: String(row.category_name || ''),
      categoryContaAzulId: String(row.category_ca_id || ''),
      defaultPaymentId: String(row.default_payment_id || ''),
      defaultAccountId: String(row.default_account_id || ''),
      allowBatch: Boolean(row.allow_batch),
      requireDescription: Boolean(row.require_description),
      icon: String(row.icon || 'remove_circle'),
      color: String(row.color || '#ef4444')
    }))
  };
}

function rowToEntry(row) {
  return {
    id: String(row.entry_id),
    batchId: String(row.batch_id || ''),
    batchIndex: Number(row.batch_index || 1),
    date: String(row.date_iso || ''),
    createdAt: String(row.created_at || ''),
    type: String(row.type || ''),
    mode: String(row.mode || ''),
    unitId: String(row.unit_id || ''),
    operatorId: String(row.operator_id || ''),
    operatorName: String(row.operator_name || ''),
    clientId: String(row.client_id || ''),
    clientName: String(row.client_name || ''),
    clientSource: String(row.client_source || ''),
    objectCount: Number(row.object_count || 0),
    amountCents: Number(row.amount_cents || 0),
    paymentId: String(row.payment_id || ''),
    paymentName: String(row.payment_name || ''),
    paymentContaAzulMethod: String(row.payment_ca_method || ''),
    accountId: String(row.account_id || ''),
    accountContaAzulId: String(row.account_ca_id_snapshot || ''),
    accountContaAzulName: String(row.account_ca_name_snapshot || ''),
    categoryId: String(row.category_id || ''),
    categoryContaAzulId: String(row.category_ca_id_snapshot || ''),
    categoryContaAzulName: String(row.category_ca_name_snapshot || ''),
    costCenterContaAzulId: String(row.cost_center_ca_id_snapshot || ''),
    costCenterContaAzulName: String(row.cost_center_ca_name_snapshot || ''),
    description: String(row.description || ''),
    pixStatus: String(row.pix_status || ''),
    pixTxid: String(row.pix_txid || ''),
    pixE2eid: String(row.pix_e2eid || ''),
    pixReceivedAt: String(row.pix_received_at || ''),
    pixProvider: String(row.pix_provider || ''),
    status: String(row.status || 'ATIVO'),
    closureId: String(row.closure_id || ''),
    contaAzulStatus: String(row.conta_azul_status || 'NAO_ENVIADO'),
    contaAzulProtocol: String(row.conta_azul_protocol || ''),
    contaAzulLastError: String(row.conta_azul_last_error || ''),
    contaAzulAttempts: Number(row.conta_azul_attempts || 0),
    contaAzulSyncedAt: String(row.conta_azul_synced_at || ''),
    deletedAt: String(row.deleted_at || ''),
    deletedBy: String(row.deleted_by || ''),
    deletedByName: String(row.deleted_by_name || ''),
    deleteReason: String(row.delete_reason || '')
  };
}

function rowToWithdrawal(row) {
  return {
    id: String(row.withdrawal_id),
    date: String(row.date_iso || ''),
    createdAt: String(row.created_at || ''),
    unitId: String(row.unit_id || ''),
    operatorId: String(row.operator_id || ''),
    operatorName: String(row.operator_name || ''),
    amountCents: Number(row.amount_cents || 0),
    destination: String(row.destination || ''),
    notes: String(row.notes || ''),
    balanceBeforeCents: Number(row.balance_before_cents || 0),
    balanceAfterCents: Number(row.balance_after_cents || 0),
    confirmed: Boolean(row.confirmed),
    pdfStatus: String(row.pdf_status || ''),
    pdfUrl: String(row.pdf_url || '')
  };
}

function rowToClosure(row) {
  if (!row) return null;
  return {
    id: String(row.closure_id),
    date: String(row.date_iso || ''),
    unitId: String(row.unit_id || ''),
    unitName: String(row.unit_name || ''),
    status: String(row.status || ''),
    createdAt: String(row.created_at || ''),
    createdBy: String(row.created_by || ''),
    createdByName: String(row.created_by_name || ''),
    revenueCents: Number(row.revenue_cents || 0),
    expenseCents: Number(row.expense_cents || 0),
    netCents: Number(row.net_cents || 0),
    openingCashCents: Number(row.opening_cash_cents || 0),
    cashRevenueCents: Number(row.cash_revenue_cents || 0),
    cashExpenseCents: Number(row.cash_expense_cents || 0),
    withdrawalsBeforeCloseCents: Number(row.withdrawals_before_close_cents || 0),
    expectedCashCents: Number(row.expected_cash_cents || 0),
    countedCashCents: Number(row.counted_cash_cents || 0),
    differenceCents: Number(row.difference_cents || 0),
    closingWithdrawalCents: Number(row.closing_withdrawal_cents || 0),
    carryoverCents: Number(row.carryover_cents || 0),
    notes: String(row.notes || ''),
    declarationConfirmed: Boolean(row.declaration_confirmed),
    pdfStatus: String(row.pdf_status || ''),
    pdfUrl: String(row.pdf_url || ''),
    contaAzulStatus: String(row.conta_azul_status || '')
  };
}

async function openingCash(db, date, unitId) {
  const current = await db.prepare(`
    SELECT opening_cash_cents FROM caixa_daily_balances
    WHERE unit_id = ? AND date_iso = ? LIMIT 1
  `).bind(unitId, date).first();

  if (current) return Number(current.opening_cash_cents || 0);

  const previous = await db.prepare(`
    SELECT carryover_cents FROM caixa_daily_balances
    WHERE unit_id = ? AND date_iso < ? AND status = 'FECHADO'
    ORDER BY date_iso DESC LIMIT 1
  `).bind(unitId, date).first();

  return Number(previous?.carryover_cents || 0);
}

function buildSummary(entries, withdrawals, date, unitId, opening) {
  const summary = {
    date,
    unitId,
    revenueCents: 0,
    expenseCents: 0,
    netCents: 0,
    revenueCount: 0,
    expenseCount: 0,
    byPayment: {},
    countByPayment: {},
    cashRevenueCents: 0,
    cashExpenseCents: 0,
    pixPendingCents: 0,
    pixConfirmedCents: 0,
    withdrawalsCents: 0,
    openingCashCents: Number(opening || 0),
    expectedCashCents: 0
  };

  for (const entry of entries) {
    if (String(entry.status).toUpperCase() === 'EXCLUIDO') continue;

    if (entry.type === 'DESPESA') {
      summary.expenseCents += entry.amountCents;
      summary.expenseCount += 1;
      if (entry.paymentId === 'DINHEIRO') summary.cashExpenseCents += entry.amountCents;
      continue;
    }

    summary.revenueCents += entry.amountCents;
    summary.revenueCount += 1;
    summary.byPayment[entry.paymentId] =
      (summary.byPayment[entry.paymentId] || 0) + entry.amountCents;
    summary.countByPayment[entry.paymentId] =
      (summary.countByPayment[entry.paymentId] || 0) + 1;

    if (entry.paymentId === 'DINHEIRO') summary.cashRevenueCents += entry.amountCents;

    if (entry.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO') {
      if (String(entry.pixStatus).toUpperCase() === 'CONFIRMADO') {
        summary.pixConfirmedCents += entry.amountCents;
      } else {
        summary.pixPendingCents += entry.amountCents;
      }
    }
  }

  for (const withdrawal of withdrawals) {
    summary.withdrawalsCents += withdrawal.amountCents;
  }

  summary.netCents = summary.revenueCents - summary.expenseCents;
  summary.expectedCashCents =
    summary.openingCashCents +
    summary.cashRevenueCents -
    summary.cashExpenseCents -
    summary.withdrawalsCents;

  return summary;
}

async function supplementState(db, date, unitId, baseClosure, todayEntries) {
  if (!baseClosure) {
    return {
      hasBaseClosure: false,
      pendingCount: 0,
      pendingRevenueCents: 0,
      pendingExpenseCents: 0,
      pendingNetCents: 0,
      supplementCount: 0
    };
  }

  const pending = todayEntries.filter(entry =>
    String(entry.status).toUpperCase() !== 'EXCLUIDO' &&
    !String(entry.closureId || '').trim()
  );

  let pendingRevenueCents = 0;
  let pendingExpenseCents = 0;
  for (const entry of pending) {
    if (entry.type === 'DESPESA') pendingExpenseCents += entry.amountCents;
    else pendingRevenueCents += entry.amountCents;
  }

  const rows = await db.prepare(`
    SELECT s.*,
      COALESCE(q.total_count,0) AS queue_total,
      COALESCE(q.synced_count,0) AS queue_synced,
      COALESCE(q.error_count,0) AS queue_errors
    FROM caixa_closure_supplements s
    LEFT JOIN (
      SELECT closure_id,
        COUNT(*) AS total_count,
        SUM(CASE WHEN status = 'SINCRONIZADO' THEN 1 ELSE 0 END) AS synced_count,
        SUM(CASE WHEN status IN ('ERRO','CONFIGURACAO_PENDENTE') THEN 1 ELSE 0 END) AS error_count
      FROM caixa_conta_azul_queue
      GROUP BY closure_id
    ) q ON q.closure_id = s.supplement_id
    WHERE s.unit_id = ? AND s.date_iso = ?
    ORDER BY s.sequence
  `).bind(unitId, date).all();

  const history = (rows.results || []).map(row => {
    let contaAzulStatus = 'SEM_FILA';
    if (Number(row.queue_total) > 0) {
      if (Number(row.queue_synced) === Number(row.queue_total)) contaAzulStatus = 'SINCRONIZADO';
      else if (Number(row.queue_errors) > 0) contaAzulStatus = 'COM_ERRO';
      else contaAzulStatus = 'PENDENTE';
    }

    return {
      id: String(row.supplement_id),
      date: String(row.date_iso),
      unitId: String(row.unit_id),
      baseClosureId: String(row.base_closure_id || ''),
      sequence: Number(row.sequence || 0),
      createdAt: String(row.created_at || ''),
      createdByName: String(row.created_by_name || ''),
      revenueCents: Number(row.revenue_cents || 0),
      expenseCents: Number(row.expense_cents || 0),
      netCents: Number(row.net_cents || 0),
      expectedCashCents: Number(row.expected_cash_cents || 0),
      carryoverCents: Number(row.carryover_cents || 0),
      notes: String(row.notes || ''),
      contaAzulStatus
    };
  });

  return {
    hasBaseClosure: true,
    pendingCount: pending.length,
    pendingRevenueCents,
    pendingExpenseCents,
    pendingNetCents: pendingRevenueCents - pendingExpenseCents,
    supplementCount: history.length,
    history
  };
}

export async function buildInitResponse(db, user, requestedUnitId) {
  const startedAt = Date.now();
  const context = await resolveContext(db, user, requestedUnitId);
  const date = fortalezaToday();
  const unitId = String(context.unit.unit_id);

  const [library, clientsResult, todayResult, backlogResult, withdrawalsResult, closureRow, opening] =
    await Promise.all([
      buildLibrary(db, context),
      db.prepare(`SELECT client_id,name FROM caixa_clients WHERE active = 1 ORDER BY normalized_name`).all(),
      db.prepare(`SELECT * FROM caixa_entries WHERE unit_id = ? AND date_iso = ? AND status <> 'EXCLUIDO' ORDER BY created_at`).bind(unitId, date).all(),
      db.prepare(`
        SELECT * FROM caixa_entries
        WHERE unit_id = ?
          AND date_iso < ?
          AND status <> 'EXCLUIDO'
          AND payment_ca_method = 'PIX_PAGAMENTO_INSTANTANEO'
          AND pix_status IN ('CRIANDO','ATIVA','PENDENTE')
        ORDER BY date_iso DESC, created_at DESC
      `).bind(unitId, date).all(),
      db.prepare(`SELECT * FROM caixa_withdrawals WHERE unit_id = ? AND date_iso = ? ORDER BY created_at`).bind(unitId, date).all(),
      db.prepare(`SELECT * FROM caixa_closures WHERE unit_id = ? AND date_iso = ? ORDER BY created_at LIMIT 1`).bind(unitId, date).first(),
      openingCash(db, date, unitId)
    ]);

  const todayEntries = (todayResult.results || []).map(rowToEntry);
  const backlog = (backlogResult.results || []).map(rowToEntry);
  const withdrawals = (withdrawalsResult.results || []).map(rowToWithdrawal);
  const summary = buildSummary(todayEntries, withdrawals, date, unitId, opening);
  let closure = rowToClosure(closureRow);

  if (closure) {
    closure.originalCarryoverCents = Number(closure.carryoverCents || 0);
    closure.carryoverCents = Number(summary.expectedCashCents || 0);
  }

  const supplements = await supplementState(db, date, unitId, closure, todayEntries);

  return {
    ok: true,
    version: 'V3-D1-HYBRID',
    serverDate: date,
    timezone: TIMEZONE,
    user: {
      id: String(user.sub || ''),
      name: String(user.name || user.sub || ''),
      role: String(user.role || '')
    },
    library,
    clients: (clientsResult.results || []).map(row => ({
      id: String(row.client_id),
      name: String(row.name)
    })),
    entries: todayEntries.concat(backlog),
    withdrawals,
    summary,
    closure,
    supplementState: supplements,
    pendingPixBacklogCount: backlog.length,
    bootstrapMs: Date.now() - startedAt
  };
}

export function fortalezaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}
