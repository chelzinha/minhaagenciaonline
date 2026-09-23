/**
 * CAIXA BALCÃO - AJUSTES OPERACIONAIS 2026-09-23
 *
 * 1. Pix de maquininha (Pix Infinity): funciona como cartão.
 *    - pix_mode = MAQUININHA na Biblioteca_Pagamentos.
 *    - Nasce CONFIRMADO, aceita Atender, Avulso e Em lote, não gera QR Code.
 *    - A regra do Pix Santander (QR local, pendente, só Atender) não muda.
 * 2. Exclusão em Mov.: lançamentos ainda não consolidados (sem closure_id)
 *    podem ser excluídos também depois do fechamento principal, antes do
 *    complemento. Consolidado ou já no Conta Azul continua bloqueado.
 * 3. Grupos de receita ATENDE e SARA (tipos de receita na Biblioteca_Receitas).
 * 4. Recálculo administrativo do saldo inicial do dia.
 *
 * Funções de configuração (executar manualmente no editor, uma vez):
 *   habilitarPixInfinityCaixaV2()
 *   configurarGruposReceitaAtendeSaraV2()
 *   reverterGruposReceitaAtendeSaraV2()      (rollback dos grupos)
 *   recalcularSaldoInicialHojeV2('SHOPPING_METRO')
 */

var CAIXA_AJUSTES_CFG = Object.freeze({
  TERMINAL_PIX_IDS: ['PIX_INFINITY'],
  LEGACY_REVENUE_ID: 'ATENDIMENTO_BALCAO',
  REVENUE_GROUPS: [
    {
      id: 'ATENDE',
      name: 'Atende',
      description: 'Atendimento de balcão - Atende',
      icon: 'local_post_office',
      color: '#0f6ee8',
      sort: 10
    },
    {
      id: 'SARA',
      name: 'SARA',
      description: 'Atendimento de balcão - SARA',
      icon: 'storefront',
      color: '#f08c00',
      sort: 20
    }
  ],
  /*
   * Categoria do Conta Azul por grupo e unidade.
   * Vazio = copia a categoria atual do tipo ATENDIMENTO_BALCAO da unidade.
   * Exemplo:
   *   SARA: { AGF: { category_name: '1.3.x ...', category_ca_id: 'uuid' } }
   */
  CATEGORY_OVERRIDES: {
    ATENDE: {},
    SARA: {}
  }
});

/* EXCLUSÃO */

function v3DeleteEntry_(payload, user) {
  var result = v2DeleteEntry_(
    payload || {},
    user,
    { allowAfterBaseClosure: true }
  );

  try {
    var env = v2Environment_();
    var context = v2ResolveContext_(env, user);
    var date = v2Today_();
    var unitId = String(context.unit.unit_id || '');

    /* Resumo V3: mantém Pix pendente nos totais, igual ao salvar. */
    result.summary = v3BuildSummary_(env, date, unitId);
    result.supplementState = v3SupplementState_(
      env,
      date,
      unitId,
      v2FindClosure_(env, date, unitId)
    );
  } catch (error) {
    console.warn(
      '[CAIXA_DELETE_V3] Resumo pós-exclusão indisponível: ' +
      (error && error.message ? error.message : error)
    );
  }

  return result;
}

/* HELPERS DE PLANILHA */

function caixaAjustesIndex_(headers) {
  var index = {};
  headers.forEach(function(name, position) {
    index[name] = position;
  });
  return index;
}

function caixaAjustesBackup_(env, sheet, prefix) {
  var stamp = Utilities.formatDate(
    new Date(),
    CAIXA_V2_CFG.TIMEZONE,
    'yyyyMMdd_HHmm'
  );
  var name = prefix + '_' + stamp;

  if (!env.ss.getSheetByName(name)) {
    sheet.copyTo(env.ss).setName(name);
  }

  return name;
}

function caixaAjustesInvalidateCache_() {
  if (typeof v3InvalidateFastCaches_ === 'function') {
    v3InvalidateFastCaches_();
  }
}

/* PIX INFINITY */

function habilitarPixInfinityCaixaV2() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var headers = CAIXA_V2_CFG.HEADERS.PAYMENTS;
    var idx = caixaAjustesIndex_(headers);
    var backup = caixaAjustesBackup_(env, env.payments, 'BACKUP_Pagamentos_pre_pix_infinity');
    var changed = [];

    v2ReadObjects_(env.payments, headers).forEach(function(item) {
      var paymentId = String(item.payment_id || '').trim();

      if (CAIXA_AJUSTES_CFG.TERMINAL_PIX_IDS.indexOf(paymentId) < 0) {
        return;
      }

      var row = item._row.slice();
      row[idx.active] = true;
      row[idx.allow_revenue] = true;
      row[idx.allow_expense] = false;
      row[idx.allow_batch] = true;
      row[idx.generate_pix] = false;
      row[idx.pix_mode] = 'MAQUININHA';
      row[idx.pix_key] = '';
      row[idx.pix_receiver_name] = '';
      row[idx.pix_active] = false;
      row[idx.icon] = 'qr_code_scanner';

      env.payments
        .getRange(item._sheetRow, 1, 1, headers.length)
        .setValues([row]);

      changed.push(String(item.unit_id || '') + ':' + paymentId);
    });

    SpreadsheetApp.flush();
    caixaAjustesInvalidateCache_();

    return {
      ok: changed.length > 0,
      backup: backup,
      updated: changed,
      message: changed.length
        ? 'Pix Infinity ativo como Pix de maquininha.'
        : 'Nenhuma linha PIX_INFINITY encontrada em Biblioteca_Pagamentos.'
    };
  } finally {
    lock.releaseLock();
  }
}

/* GRUPOS DE RECEITA ATENDE / SARA */

function configurarGruposReceitaAtendeSaraV2() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var headers = CAIXA_V2_CFG.HEADERS.REVENUES;
    var idx = caixaAjustesIndex_(headers);
    var rows = v2ReadObjects_(env.revenues, headers);
    var backup = caixaAjustesBackup_(env, env.revenues, 'BACKUP_Receitas_pre_grupos');

    var legacy = rows.filter(function(item) {
      return String(item.revenue_type_id || '') === CAIXA_AJUSTES_CFG.LEGACY_REVENUE_ID;
    });

    if (!legacy.length) {
      throw new Error('Tipo ' + CAIXA_AJUSTES_CFG.LEGACY_REVENUE_ID + ' não encontrado em Biblioteca_Receitas.');
    }

    var created = [];
    var updated = [];

    legacy.forEach(function(base) {
      var unitId = String(base.unit_id || '*');

      CAIXA_AJUSTES_CFG.REVENUE_GROUPS.forEach(function(group) {
        var override =
          (CAIXA_AJUSTES_CFG.CATEGORY_OVERRIDES[group.id] || {})[unitId] || {};

        var row = base._row.slice();
        row[idx.revenue_type_id] = group.id;
        row[idx.unit_id] = unitId;
        row[idx.name_front] = group.name;
        row[idx.description_default] = group.description;
        row[idx.category_name] = override.category_name || base.category_name;
        row[idx.category_ca_id] = override.category_ca_id || base.category_ca_id;
        row[idx.allow_attendance] = true;
        row[idx.allow_single] = true;
        row[idx.allow_batch] = true;
        row[idx.require_client] = false;
        row[idx.require_description] = false;
        row[idx.icon] = group.icon;
        row[idx.color] = group.color;
        row[idx.active] = true;
        row[idx.sort_order] = group.sort;

        var existing = rows.filter(function(item) {
          return (
            String(item.revenue_type_id || '') === group.id &&
            String(item.unit_id || '*') === unitId
          );
        })[0];

        if (existing) {
          env.revenues
            .getRange(existing._sheetRow, 1, 1, headers.length)
            .setValues([row]);
          updated.push(unitId + ':' + group.id);
        } else {
          env.revenues.appendRow(row);
          created.push(unitId + ':' + group.id);
        }
      });

      env.revenues
        .getRange(base._sheetRow, idx.active + 1)
        .setValue(false);
    });

    SpreadsheetApp.flush();
    caixaAjustesInvalidateCache_();

    return {
      ok: true,
      backup: backup,
      created: created,
      updated: updated,
      legacyDisabled: legacy.length,
      message: 'Grupos ATENDE e SARA ativos. ATENDIMENTO_BALCAO desativado (histórico preservado).'
    };
  } finally {
    lock.releaseLock();
  }
}

function reverterGruposReceitaAtendeSaraV2() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var headers = CAIXA_V2_CFG.HEADERS.REVENUES;
    var idx = caixaAjustesIndex_(headers);
    var groupIds = CAIXA_AJUSTES_CFG.REVENUE_GROUPS.map(function(group) {
      return group.id;
    });
    var count = 0;

    v2ReadObjects_(env.revenues, headers).forEach(function(item) {
      var id = String(item.revenue_type_id || '');
      var active = null;

      if (id === CAIXA_AJUSTES_CFG.LEGACY_REVENUE_ID) active = true;
      if (groupIds.indexOf(id) >= 0) active = false;
      if (active === null) return;

      env.revenues
        .getRange(item._sheetRow, idx.active + 1)
        .setValue(active);
      count += 1;
    });

    SpreadsheetApp.flush();
    caixaAjustesInvalidateCache_();

    return { ok: true, rowsUpdated: count };
  } finally {
    lock.releaseLock();
  }
}

/* SALDO INICIAL */

/**
 * Recalcula a linha de hoje em Saldos_Diarios com a regra nova.
 * Não altera dia fechado nem ajuste MANUAL.
 */
function recalcularSaldoInicialHojeV2(unitId) {
  var wantedUnit = String(unitId || '').trim();

  if (!wantedUnit) {
    throw new Error('Informe o unit_id. Ex.: recalcularSaldoInicialHojeV2("SHOPPING_METRO")');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var env = v2Environment_();
    var date = v2Today_();
    var headers = CAIXA_V2_CFG.HEADERS.DAILY_BALANCES;
    var rows = v2ReadObjects_(env.dailyBalances, headers);

    var current = rows.filter(function(item) {
      return (
        String(item.unit_id || '').trim() === wantedUnit &&
        v2SheetDateIso_(item.date_iso) === date
      );
    })[0];

    if (current && String(current.status || '') === 'FECHADO') {
      return { ok: false, message: 'O dia já foi fechado. Nada alterado.' };
    }

    if (current && String(current.opening_source || '') === 'MANUAL') {
      return { ok: false, message: 'O saldo de hoje foi ajustado manualmente. Nada alterado.' };
    }

    var others = rows.filter(function(item) { return item !== current; });
    var info = v2ComputeOpening_(
      others,
      v2ReadObjects_(env.entries, CAIXA_V2_CFG.HEADERS.ENTRIES),
      v2ReadObjects_(env.withdrawals, CAIXA_V2_CFG.HEADERS.WITHDRAWALS),
      date,
      wantedUnit
    );

    var before = current ? Number(current.opening_cash_cents || 0) : null;

    if (current) {
      env.dailyBalances
        .getRange(current._sheetRow, 3, 1, 4)
        .setValues([[info.cents, info.source, new Date(), 'recalculo']]);
    } else {
      env.dailyBalances.appendRow([
        wantedUnit, date, info.cents, info.source, new Date(), 'recalculo',
        '', '', '', '', '', 'ABERTO'
      ]);
    }

    SpreadsheetApp.flush();

    return {
      ok: true,
      unitId: wantedUnit,
      date: date,
      beforeCents: before,
      afterCents: info.cents,
      source: info.source,
      referenceDate: info.referenceDate,
      gapDays: info.gapDays
    };
  } finally {
    lock.releaseLock();
  }
}

/** Diagnóstico sem gravação: mostra o saldo que a regra nova calcularia hoje. */
function diagnosticarSaldoInicialV2() {
  var env = v2Environment_();
  var date = v2Today_();
  var balances = v2ReadObjects_(env.dailyBalances, CAIXA_V2_CFG.HEADERS.DAILY_BALANCES);
  var entries = v2ReadObjects_(env.entries, CAIXA_V2_CFG.HEADERS.ENTRIES);
  var withdrawals = v2ReadObjects_(env.withdrawals, CAIXA_V2_CFG.HEADERS.WITHDRAWALS);

  var report = v2ReadObjects_(env.units, CAIXA_V2_CFG.HEADERS.UNITS)
    .filter(function(unit) { return v2Bool_(unit.active); })
    .map(function(unit) {
      var unitId = String(unit.unit_id || '');
      var current = balances.filter(function(item) {
        return (
          String(item.unit_id || '') === unitId &&
          v2SheetDateIso_(item.date_iso) === date
        );
      })[0];
      var others = balances.filter(function(item) { return item !== current; });
      var info = v2ComputeOpening_(others, entries, withdrawals, date, unitId);

      return {
        unitId: unitId,
        registradoHoje: current ? Number(current.opening_cash_cents || 0) : null,
        origemRegistrada: current ? String(current.opening_source || '') : '',
        regraNova: info.cents,
        origemRegraNova: info.source,
        ultimoFechamento: info.referenceDate,
        diasSemFechamento: info.gapDays
      };
    });

  console.log(JSON.stringify(report, null, 2));
  return report;
}
