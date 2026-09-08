/**
 * CAIXA V3 - ponte de migração para Cloudflare D1.
 *
 * Este arquivo não muda a fonte operacional atual. Ele apenas expõe snapshots
 * autenticados para a homologação D1 importar o estado já existente no Sheets.
 * Nenhum segredo do PropertiesService é exportado.
 */

function v3D1SafeValue_(value) {
  if (
    Object.prototype.toString.call(value) === '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return value.toISOString();
  }

  if (value == null) {
    return '';
  }

  return value;
}

function v3D1Rows_(sheet, headers) {
  return v2ReadObjects_(sheet, headers).map(function(item) {
    var out = {};

    headers.forEach(function(header) {
      out[header] = v3D1SafeValue_(item[header]);
    });

    return out;
  });
}

function v3D1SupplementRows_(env) {
  var sheet = v3SupplementSheet_(env);
  var last = sheet.getLastRow();

  if (last < 2) {
    return [];
  }

  return sheet
    .getRange(
      2,
      1,
      last - 1,
      CAIXA_V3_SUPPLEMENT_HEADERS.length
    )
    .getValues()
    .map(function(row) {
      var out = {};

      CAIXA_V3_SUPPLEMENT_HEADERS.forEach(function(header, index) {
        out[header] = v3D1SafeValue_(row[index]);
      });

      return out;
    });
}

function v3D1FullSnapshot_() {
  var env = v2Environment_();
  var h = CAIXA_V2_CFG.HEADERS;

  return {
    ok: true,
    snapshot: {
      version: 'caixa-d1-v1',
      generatedAt: new Date().toISOString(),
      units: v3D1Rows_(env.units, h.UNITS),
      users: v3D1Rows_(env.users, h.USERS),
      accounts: v3D1Rows_(env.accounts, h.ACCOUNTS),
      payments: v3D1Rows_(env.payments, h.PAYMENTS),
      revenues: v3D1Rows_(env.revenues, h.REVENUES),
      expenses: v3D1Rows_(env.expenses, h.EXPENSES),
      clients: v3D1Rows_(env.clients, h.CLIENTS),
      entries: v3D1Rows_(env.entries, h.ENTRIES),
      dailyBalances: v3D1Rows_(env.dailyBalances, h.DAILY_BALANCES),
      withdrawals: v3D1Rows_(env.withdrawals, h.WITHDRAWALS),
      closures: v3D1Rows_(env.closures, h.CLOSURES),
      contaAzulQueue: v3D1Rows_(env.caQueue, h.CA_QUEUE),
      supplements: v3D1SupplementRows_(env)
    }
  };
}

function v3D1UnitSnapshot_(user) {
  var env = v2Environment_();
  var context = v2ResolveContext_(env, user);
  var unitId = String(context.unit.unit_id || '').trim();
  var date = v2Today_();
  var h = CAIXA_V2_CFG.HEADERS;

  var entries = v3D1Rows_(env.entries, h.ENTRIES).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === unitId &&
      v2SheetDateIso_(item.date_iso) === date
    );
  });

  var dailyBalances = v3D1Rows_(
    env.dailyBalances,
    h.DAILY_BALANCES
  ).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === unitId &&
      v2SheetDateIso_(item.date_iso) === date
    );
  });

  var withdrawals = v3D1Rows_(
    env.withdrawals,
    h.WITHDRAWALS
  ).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === unitId &&
      v2SheetDateIso_(item.date_iso) === date
    );
  });

  var closures = v3D1Rows_(env.closures, h.CLOSURES).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === unitId &&
      v2SheetDateIso_(item.date_iso) === date
    );
  });

  var closureIds = {};
  closures.forEach(function(item) {
    if (item.closure_id) {
      closureIds[String(item.closure_id)] = true;
    }
  });

  var supplements = v3D1SupplementRows_(env).filter(function(item) {
    var keep = (
      String(item.unit_id || '').trim() === unitId &&
      v2SheetDateIso_(item.date_iso) === date
    );

    if (keep && item.supplement_id) {
      closureIds[String(item.supplement_id)] = true;
    }

    return keep;
  });

  var queue = v3D1Rows_(env.caQueue, h.CA_QUEUE).filter(function(item) {
    return (
      String(item.unit_id || '').trim() === unitId &&
      Boolean(closureIds[String(item.closure_id || '')])
    );
  });

  return {
    ok: true,
    snapshot: {
      version: 'caixa-d1-v1-unit',
      generatedAt: new Date().toISOString(),
      unitId: unitId,
      date: date,
      entries: entries,
      dailyBalances: dailyBalances,
      withdrawals: withdrawals,
      closures: closures,
      contaAzulQueue: queue,
      supplements: supplements
    }
  };
}
