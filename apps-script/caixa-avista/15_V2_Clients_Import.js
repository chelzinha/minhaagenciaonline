/**
 * Importação segura da base de clientes do Caixa Balcão.
 *
 * Fluxo:
 * 1. Execute prepararImportacaoClientesV2().
 * 2. Cole os nomes na coluna A da aba Importar_Clientes.
 * 3. Execute importarClientesV2().
 * 4. Execute auditarClientesV2().
 */

function prepararImportacaoClientesV2() {
  var env = v2Environment_();
  var sheetName = 'Importar_Clientes';

  var sheet =
    env.ss.getSheetByName(sheetName) ||
    env.ss.insertSheet(sheetName);

  sheet.clearContents();

  sheet
    .getRange(1, 1, 1, 2)
    .setValues([
      [
        'name',
        'status'
      ]
    ]);

  sheet.setFrozenRows(1);

  sheet
    .getRange('A1:B1')
    .setFontWeight('bold');

  sheet.setColumnWidth(1, 340);
  sheet.setColumnWidth(2, 220);

  return {
    ok: true,
    sheet: sheetName,
    message:
      'Cole os nomes dos clientes na coluna A, a partir da linha 2.'
  };
}

function importarClientesV2() {
  var env = v2Environment_();

  var importSheet =
    env.ss.getSheetByName('Importar_Clientes');

  if (!importSheet) {
    throw appError_(
      'Execute prepararImportacaoClientesV2() primeiro.',
      'IMPORT_SHEET_NOT_FOUND'
    );
  }

  var lastRow = importSheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      imported: 0,
      skipped: 0,
      invalid: 0,
      message: 'Nenhum nome encontrado para importar.'
    };
  }

  var input = importSheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues();

  var existingClients = v2ReadObjects_(
    env.clients,
    CAIXA_V2_CFG.HEADERS.CLIENTS
  );

  var knownNames = {};

  existingClients.forEach(function(client) {
    var normalized = String(
      client.normalized_name || ''
    ).trim();

    if (normalized) {
      knownNames[normalized] = true;
    }
  });

  var rowsToInsert = [];
  var statuses = [];

  var imported = 0;
  var skipped = 0;
  var invalid = 0;

  input.forEach(function(row) {
    var name = String(row[0] || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name) {
      statuses.push(['']);
      return;
    }

    if (
      name.length < 2 ||
      name.length > 120
    ) {
      invalid++;
      statuses.push([
        'INVÁLIDO: nome entre 2 e 120 caracteres'
      ]);
      return;
    }

    var normalized = v2Normalize_(name);

    if (!normalized) {
      invalid++;
      statuses.push([
        'INVÁLIDO: nome não reconhecido'
      ]);
      return;
    }

    if (knownNames[normalized]) {
      skipped++;
      statuses.push([
        'JÁ EXISTE'
      ]);
      return;
    }

    var id = Utilities.getUuid();

    rowsToInsert.push([
      id,
      name,
      normalized,
      new Date(),
      'importacao-clientes',
      true
    ]);

    knownNames[normalized] = true;
    imported++;

    statuses.push([
      'IMPORTADO'
    ]);
  });

  if (rowsToInsert.length) {
    env.clients
      .getRange(
        env.clients.getLastRow() + 1,
        1,
        rowsToInsert.length,
        CAIXA_V2_CFG.HEADERS.CLIENTS.length
      )
      .setValues(rowsToInsert);
  }

  importSheet
    .getRange(
      2,
      2,
      statuses.length,
      1
    )
    .setValues(statuses);

  return {
    ok: true,
    imported: imported,
    skipped: skipped,
    invalid: invalid,
    totalRead: input.length
  };
}

function auditarClientesV2() {
  var env = v2Environment_();

  var clients = v2ReadObjects_(
    env.clients,
    CAIXA_V2_CFG.HEADERS.CLIENTS
  );

  var ids = {};
  var names = {};

  var errors = [];
  var warnings = [];

  var active = 0;
  var inactive = 0;

  clients.forEach(function(client) {
    var row = client._sheetRow;

    var id = String(
      client.client_id || ''
    ).trim();

    var name = String(
      client.name || ''
    ).replace(/\s+/g, ' ').trim();

    var normalized = String(
      client.normalized_name || ''
    ).trim();

    var expectedNormalized =
      name ? v2Normalize_(name) : '';

    if (v2Bool_(client.active)) {
      active++;
    } else {
      inactive++;
    }

    if (!id) {
      errors.push(
        'Linha ' + row + ': client_id vazio.'
      );
    } else if (ids[id]) {
      errors.push(
        'Linhas ' +
        ids[id] +
        ' e ' +
        row +
        ': client_id duplicado.'
      );
    } else {
      ids[id] = row;
    }

    if (!name) {
      errors.push(
        'Linha ' + row + ': name vazio.'
      );
    }

    if (!normalized) {
      errors.push(
        'Linha ' +
        row +
        ': normalized_name vazio.'
      );
    } else if (
      expectedNormalized &&
      normalized !== expectedNormalized
    ) {
      warnings.push(
        'Linha ' +
        row +
        ': normalized_name diferente do esperado.'
      );
    }

    if (normalized) {
      if (names[normalized]) {
        warnings.push(
          'Linhas ' +
          names[normalized] +
          ' e ' +
          row +
          ': cliente possivelmente duplicado.'
        );
      } else {
        names[normalized] = row;
      }
    }
  });

  return {
    ok: errors.length === 0,
    seguroParaProducao:
      errors.length === 0,
    total: clients.length,
    active: active,
    inactive: inactive,
    errors: errors,
    warnings: warnings
  };
}