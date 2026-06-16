/**
 * AGF SUPERFRETE — 32_SF_SHEETS.gs
 * Helpers de planilha específicos do módulo SuperFrete.
 */

function sfGetSpreadsheetId_() {
  const id = sanitize_(CFG.SF_SPREADSHEET_ID || '');
  if (!id || id === 'COLE_AQUI_O_ID_DA_PLANILHA_SUPERFRETE') {
    throw new Error('CFG.SF_SPREADSHEET_ID não configurado. Cole o ID da planilha exclusiva do SuperFrete em 00_CFG.js. Não use CFG.SPREADSHEET_ID, pois ele é do /app e /balcao.');
  }
  return id;
}

function sfGetSs_() {
  return SpreadsheetApp.openById(sfGetSpreadsheetId_());
}

function sfGetSheet_(sheetName) {
  const sh = sfGetSs_().getSheetByName(sheetName);
  if (!sh) throw new Error('Aba SuperFrete não encontrada: ' + sheetName + '. Execute sfInstallIntoConfiguredSpreadsheet().');
  return sh;
}

function sfReadObjects_(sheetName) {
  return sfReadObjectsFromSheet_(sfGetSheet_(sheetName));
}

function sfReadObjectsFromSheet_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const values = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const headers = values[0].map(function (h) { return sanitize_(h); });
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row.some(function (v) { return sanitize_(v) !== ''; })) continue;
    const obj = { _row: r + 1 };
    headers.forEach(function (h, idx) {
      if (h) obj[h] = row[idx] || '';
    });
    out.push(obj);
  }
  return out;
}

function sfHeaderMap_(sh) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = {};
  headers.forEach(function (h, idx) {
    const key = sanitize_(h);
    if (key) map[key] = idx + 1;
  });
  return map;
}

function sfAppendByHeaders_(sheetName, obj) {
  return sfAppendByHeadersToSheet_(sfGetSheet_(sheetName), obj);
}

function sfAppendByHeadersToSheet_(sh, obj) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return sanitize_(h); });
  const row = headers.map(function (h) {
    return h && Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : '';
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

function sfUpdateRowByHeaders_(sheetName, rowNumber, patch) {
  const sh = sfGetSheet_(sheetName);
  const map = sfHeaderMap_(sh);
  Object.keys(patch).forEach(function (k) {
    if (map[k]) sh.getRange(rowNumber, map[k]).setValue(patch[k]);
  });
}

function sfFindBy_(sheetName, header, value) {
  const needle = sanitize_(value);
  const rows = sfReadObjects_(sheetName);
  return rows.find(function (r) { return sanitize_(r[header]) === needle; }) || null;
}

function sfToMoney_(v) {
  // Parser próprio do módulo SuperFrete para não depender do toNumber_ global.
  // Motivo: toNumber_ assume padrão brasileiro e transforma número JS 35.50 em 355.
  // Aqui aceitamos: 35.5, '35.50', '35,50', '1.234,56' e '1,234.56'.
  if (typeof v === 'number') {
    return isFinite(v) ? Math.round(v * 100) / 100 : 0;
  }

  let s = sanitize_(v);
  if (!s) return 0;

  s = s.replace(/\s/g, '').replace(/R\$/gi, '').replace(/[^0-9,.-]/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Se a vírgula vem depois do ponto: pt-BR -> 1.234,56.
    // Se o ponto vem depois da vírgula: en-US -> 1,234.56.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    const decimals = parts[parts.length - 1] || '';
    // Vários pontos ou exatamente 3 casas após o ponto normalmente indicam milhar.
    if (parts.length > 2 || decimals.length === 3) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function sfNormalizeDoc_(v) {
  return digitsOnly_(v);
}

function sfWithLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(SYS.LOCK_TIMEOUT_MS);
  } catch (e) {
    throw new Error('Sistema ocupado. Tente novamente em alguns segundos.');
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function sfLog_(nivel, modulo, acao, ctx) {
  try {
    sfAppendByHeaders_(SF.SHEETS.LOGS, {
      LOG_ID: uid_('SFLOG'),
      NIVEL: nivel || 'INFO',
      MODULO: modulo || '',
      ACAO: acao || '',
      CLIENTE_ID: ctx && ctx.CLIENTE_ID || '',
      USUARIO_ID: ctx && ctx.USUARIO_ID || '',
      MENSAGEM: ctx && ctx.MENSAGEM || '',
      PAYLOAD_JSON: safeJsonStringify_(redactSensitive_(ctx || {})),
      CRIADO_EM: nowIso_()
    });
  } catch (e) {
    console.warn('sfLog_ falhou: ' + e.message);
  }
}
