/**
 * CAIXA BALCÃO - PDFs com layout AGF (2026-09-23)
 *
 * Mesmo contrato das rotinas anteriores:
 *   v2GenerateWithdrawalPdf_(env, withdrawalId, context) -> {status, id, url}
 *   v2GenerateClosingPdf_(env, closureId, context)       -> {status, id, url}
 *   v3GenerateSupplementPdf_(env, supplementId, context) -> {status, id, url}
 *
 * O PDF é gerado a partir de HTML (sem Documento temporário no Drive).
 * Se a conversão HTML falhar, a rotina anterior (DocumentApp) é usada como
 * contingência, para nunca bloquear fechamento, sangria ou retry.
 *
 * Correções incluídas:
 * - "Receitas por forma de pagamento" usa as formas reais (PIX_SANTANDER,
 *   DEBITO_CIELO...). Antes só DINHEIRO aparecia; o resto saía R$ 0,00.
 * - Lista de lançamentos inclui todas as formas, não só Dinheiro.
 * - O fechamento principal lista somente os lançamentos do próprio closure_id
 *   (os complementos têm PDF próprio).
 * - date_iso normalizado (evita nome de arquivo/pasta quebrado quando a
 *   planilha converte a data em Date).
 */

var CAIXA_PDF = Object.freeze({
  BRAND: 'AGF JOSÉ BONIFÁCIO',
  NAVY: '#0B2D58',
  BLUE: '#0078D4',
  YELLOW: '#FFD100',
  INK: '#1F2937',
  MUTED: '#6B7280',
  LINE: '#E5E7EB',
  SOFT: '#F5F7FA',
  GREEN: '#15803D',
  RED: '#B91C1C',
  ORANGE: '#C2410C',
  MODE_LABELS: {
    ATENDIMENTO: 'Atender',
    AVULSO: 'Avulso',
    LOTE: 'Lote',
    INDIVIDUAL: 'Individual'
  }
});

/* FORMATADORES (puros) */

function caixaPdfEsc_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function caixaPdfMoney_(cents) {
  var value = Math.round(Number(cents || 0));
  var negative = value < 0;
  var abs = Math.abs(value);
  var reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  var centavos = ('0' + String(abs % 100)).slice(-2);
  return (negative ? '- ' : '') + 'R$ ' + reais + ',' + centavos;
}

function caixaPdfBrDate_(iso) {
  var parts = String(iso || '').split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : String(iso || '');
}

function caixaPdfDateTime_(value) {
  if (!value) return '';
  try {
    var date = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return Utilities.formatDate(date, CAIXA_V2_CFG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  } catch (_) {
    return String(value);
  }
}

function caixaPdfTime_(value) {
  if (!value) return '';
  try {
    var date = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    return Utilities.formatDate(date, CAIXA_V2_CFG.TIMEZONE, 'HH:mm');
  } catch (_) {
    return '';
  }
}

function caixaPdfModeLabel_(mode) {
  var key = String(mode || '').split('·')[0].trim().toUpperCase();
  return CAIXA_PDF.MODE_LABELS[key] || key || '';
}

/* BLOCOS HTML (puros) */

function caixaPdfStyles_() {
  var c = CAIXA_PDF;
  return [
    '<style>',
    '@page{size:A4;margin:14mm 12mm}',
    'body{font-family:Arial,Helvetica,sans-serif;color:' + c.INK + ';font-size:10.5pt;margin:0}',
    'table{border-collapse:collapse;width:100%}',
    '.band{background:' + c.NAVY + ';color:#fff}',
    '.band td{padding:14px 16px;vertical-align:middle}',
    '.brand{font-size:8.5pt;letter-spacing:2px;color:' + c.YELLOW + ';font-weight:bold}',
    '.title{font-size:17pt;font-weight:bold;margin-top:3px}',
    '.band-right{text-align:right;font-size:9.5pt;line-height:1.5}',
    '.band-right b{font-size:12pt}',
    '.accent{height:5px;background:' + c.YELLOW + '}',
    '.meta td{padding:8px 10px;border-bottom:1px solid ' + c.LINE + ';font-size:9pt;vertical-align:top}',
    '.meta .k{display:block;color:' + c.MUTED + ';font-size:7.5pt;text-transform:uppercase;letter-spacing:.6px}',
    '.meta .v{display:block;font-weight:bold;margin-top:2px}',
    '.kpis{margin-top:12px}',
    '.kpis td{width:25%;padding:0 4px}',
    '.kpi{border:1px solid ' + c.LINE + ';border-radius:8px;padding:9px 10px;background:' + c.SOFT + '}',
    '.kpi .k{color:' + c.MUTED + ';font-size:7.5pt;text-transform:uppercase;letter-spacing:.6px}',
    '.kpi .v{font-size:13.5pt;font-weight:bold;margin-top:3px}',
    '.kpi.hl{background:' + c.NAVY + ';border-color:' + c.NAVY + ';color:#fff}',
    '.kpi.hl .k{color:' + c.YELLOW + '}',
    'h2{font-size:10.5pt;color:' + c.NAVY + ';text-transform:uppercase;letter-spacing:.8px;margin:18px 0 6px;padding-bottom:4px;border-bottom:2px solid ' + c.YELLOW + '}',
    '.grid th{background:' + c.NAVY + ';color:#fff;font-size:8pt;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;text-align:left}',
    '.grid td{padding:5px 8px;border-bottom:1px solid ' + c.LINE + ';font-size:9pt}',
    '.grid tr.alt td{background:' + c.SOFT + '}',
    '.grid .r{text-align:right;white-space:nowrap}',
    '.grid .c{text-align:center}',
    '.grid tr.total td{font-weight:bold;border-top:2px solid ' + c.NAVY + ';border-bottom:0;background:#fff}',
    '.grid tr.strong td{font-weight:bold;background:#E6F1FB}',
    '.neg{color:' + c.RED + '}',
    '.pos{color:' + c.GREEN + '}',
    '.tag{display:inline-block;padding:1px 6px;border-radius:8px;font-size:7.5pt;font-weight:bold;background:#E6F1FB;color:' + c.NAVY + '}',
    '.tag.exp{background:#FDECEC;color:' + c.RED + '}',
    '.muted{color:' + c.MUTED + '}',
    '.box{border:1px solid ' + c.LINE + ';border-left:4px solid ' + c.NAVY + ';border-radius:6px;padding:10px 12px;margin-top:8px;font-size:9pt;line-height:1.45;background:' + c.SOFT + '}',
    '.box.warn{border-left-color:' + c.ORANGE + ';background:#FFF1E6}',
    '.sign{margin-top:34px}',
    '.sign td{width:50%;padding:0 18px;text-align:center;font-size:8.5pt;color:' + c.MUTED + '}',
    '.sign .line{border-top:1px solid ' + c.INK + ';padding-top:5px;color:' + c.INK + ';font-weight:bold}',
    '.foot{margin-top:18px;padding-top:6px;border-top:1px solid ' + c.LINE + ';font-size:7.5pt;color:' + c.MUTED + '}',
    '.big{font-size:26pt;font-weight:bold;color:' + c.NAVY + '}',
    '</style>'
  ].join('');
}

function caixaPdfHeader_(title, subtitleRight) {
  return (
    '<table class="band"><tr>' +
      '<td><div class="brand">' + caixaPdfEsc_(CAIXA_PDF.BRAND) + ' · CAIXA BALCÃO</div>' +
      '<div class="title">' + caixaPdfEsc_(title) + '</div></td>' +
      '<td class="band-right">' + subtitleRight + '</td>' +
    '</tr></table><div class="accent"></div>'
  );
}

function caixaPdfMeta_(pairs) {
  return (
    '<table class="meta"><tr>' +
    pairs.map(function(pair) {
      return '<td><span class="k">' + caixaPdfEsc_(pair[0]) + '</span><span class="v">' + caixaPdfEsc_(pair[1] || '-') + '</span></td>';
    }).join('') +
    '</tr></table>'
  );
}

function caixaPdfKpis_(items) {
  return (
    '<table class="kpis"><tr>' +
    items.map(function(item) {
      return '<td><div class="kpi' + (item.highlight ? ' hl' : '') + '"><div class="k">' +
        caixaPdfEsc_(item.label) + '</div><div class="v' + (item.tone ? ' ' + item.tone : '') + '">' +
        caixaPdfEsc_(item.value) + '</div></div></td>';
    }).join('') +
    '</tr></table>'
  );
}

/**
 * columns: [{label, align:'r'|'c'|''}]
 * rows: arrays de células já em texto; row.__class opcional
 */
function caixaPdfTable_(columns, rows, totalRow) {
  var head = '<tr>' + columns.map(function(col) {
    return '<th' + (col.align ? ' class="' + col.align + '"' : '') + '>' + caixaPdfEsc_(col.label) + '</th>';
  }).join('') + '</tr>';

  var body = rows.map(function(row, index) {
    var cls = row.__class || (index % 2 ? 'alt' : '');
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' +
      row.map(function(cell, cellIndex) {
        var align = columns[cellIndex] && columns[cellIndex].align;
        var html = cell && cell.__html ? cell.__html : caixaPdfEsc_(cell);
        return '<td' + (align ? ' class="' + align + '"' : '') + '>' + html + '</td>';
      }).join('') +
    '</tr>';
  }).join('');

  var total = totalRow
    ? '<tr class="total">' + totalRow.map(function(cell, cellIndex) {
        var align = columns[cellIndex] && columns[cellIndex].align;
        return '<td' + (align ? ' class="' + align + '"' : '') + '>' + caixaPdfEsc_(cell) + '</td>';
      }).join('') + '</tr>'
    : '';

  return '<table class="grid">' + head + body + total + '</table>';
}

function caixaPdfSignatures_(left, right) {
  return (
    '<table class="sign"><tr>' +
      '<td><div class="line">' + caixaPdfEsc_(left) + '</div>Responsável pelo caixa</td>' +
      '<td><div class="line">' + caixaPdfEsc_(right || ' ') + '</div>Conferência</td>' +
    '</tr></table>'
  );
}

function caixaPdfDocument_(inner) {
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    caixaPdfStyles_() + '</head><body>' + inner + '</body></html>';
}

/* MONTAGEM DOS DOCUMENTOS (puros: recebem modelos prontos) */

function caixaPdfPaymentRows_(revenueEntries) {
  var map = {};
  var order = [];

  revenueEntries.forEach(function(entry) {
    var key = String(entry.paymentId || 'OUTRO');
    if (!map[key]) {
      map[key] = { name: entry.paymentName || key, count: 0, cents: 0 };
      order.push(key);
    }
    map[key].count += 1;
    map[key].cents += Number(entry.amountCents || 0);
  });

  return order
    .sort(function(a, b) { return map[b].cents - map[a].cents; })
    .map(function(key) { return map[key]; });
}

function caixaPdfGroupRows_(revenueEntries, groupNames) {
  var map = {};
  var order = [];

  revenueEntries.forEach(function(entry) {
    var key = String(entry.categoryId || 'SEM_GRUPO');
    if (!map[key]) {
      map[key] = {
        name: groupNames[key] || entry.categoryContaAzulName || key,
        count: 0,
        objects: 0,
        cents: 0
      };
      order.push(key);
    }
    map[key].count += 1;
    map[key].objects += Number(entry.objectCount || 0);
    map[key].cents += Number(entry.amountCents || 0);
  });

  return order.map(function(key) { return map[key]; });
}

function caixaPdfEntriesSection_(model) {
  var revenue = model.entries.filter(function(e) { return e.type === 'RECEITA'; });
  var expense = model.entries.filter(function(e) { return e.type === 'DESPESA'; });
  var html = '';
  var groups = caixaPdfGroupRows_(revenue, model.groupNames || {});
  var showGroups = groups.length > 1 || (groups[0] && groups[0].name && model.forceGroups);

  if (showGroups) {
    html += '<h2>Receitas por grupo</h2>' + caixaPdfTable_(
      [{ label: 'Grupo' }, { label: 'Lançamentos', align: 'c' }, { label: 'Objetos', align: 'c' }, { label: 'Total', align: 'r' }],
      groups.map(function(g) { return [g.name, String(g.count), String(g.objects), caixaPdfMoney_(g.cents)]; }),
      ['Total', String(revenue.length), String(groups.reduce(function(t, g) { return t + g.objects; }, 0)), caixaPdfMoney_(revenue.reduce(function(t, e) { return t + Number(e.amountCents || 0); }, 0))]
    );
  }

  var payments = caixaPdfPaymentRows_(revenue);
  html += '<h2>Receitas por forma de pagamento</h2>' + (payments.length
    ? caixaPdfTable_(
        [{ label: 'Forma' }, { label: 'Lançamentos', align: 'c' }, { label: 'Total', align: 'r' }],
        payments.map(function(p) { return [p.name, String(p.count), caixaPdfMoney_(p.cents)]; }),
        ['Total', String(revenue.length), caixaPdfMoney_(revenue.reduce(function(t, e) { return t + Number(e.amountCents || 0); }, 0))]
      )
    : '<div class="box">Nenhuma receita neste documento.</div>');

  if (revenue.length) {
    var sorted = revenue.slice().sort(function(a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    html += '<h2>Receitas lançadas</h2>' + caixaPdfTable_(
      [{ label: 'Hora', align: 'c' }, { label: 'Grupo' }, { label: 'Forma' }, { label: 'Modo' }, { label: 'Obj.', align: 'c' }, { label: 'Observação' }, { label: 'Valor', align: 'r' }],
      sorted.map(function(e) {
        var pix = String(e.pixStatus || '').toUpperCase();
        var pixTag = (pix && pix !== 'CONFIRMADO' && String(e.pixProvider || '').toUpperCase() !== 'MAQUININHA')
          ? ' <span class="tag exp">Pix ' + caixaPdfEsc_(pix.toLowerCase()) + '</span>'
          : '';
        return [
          caixaPdfTime_(e.createdAt),
          (model.groupNames || {})[e.categoryId] || e.categoryContaAzulName || '',
          { __html: caixaPdfEsc_(e.paymentName || e.paymentId) + pixTag },
          caixaPdfModeLabel_(e.mode) + (e.batchId ? ' #' + String(e.batchIndex || '') : ''),
          String(e.objectCount || ''),
          e.description && e.description !== 'Atendimento de balcão' ? e.description : '',
          caixaPdfMoney_(e.amountCents)
        ];
      })
    );
  }

  if (expense.length) {
    html += '<h2>Despesas</h2>' + caixaPdfTable_(
      [{ label: 'Hora', align: 'c' }, { label: 'Categoria' }, { label: 'Descrição' }, { label: 'Forma' }, { label: 'Valor', align: 'r' }],
      expense.map(function(e) {
        return [caixaPdfTime_(e.createdAt), e.categoryContaAzulName || e.categoryId, e.description || '', e.paymentName || e.paymentId, caixaPdfMoney_(e.amountCents)];
      }),
      ['Total', '', '', '', caixaPdfMoney_(expense.reduce(function(t, e) { return t + Number(e.amountCents || 0); }, 0))]
    );
  }

  if (model.withdrawals && model.withdrawals.length) {
    html += '<h2>Sangrias</h2>' + caixaPdfTable_(
      [{ label: 'Hora', align: 'c' }, { label: 'Responsável' }, { label: 'Destino' }, { label: 'Saldo antes', align: 'r' }, { label: 'Valor', align: 'r' }, { label: 'Saldo após', align: 'r' }],
      model.withdrawals.map(function(w) {
        return [caixaPdfTime_(w.createdAt), String(w.operatorName || '').split('·')[0].trim(), w.destination || 'Financeiro', caixaPdfMoney_(w.balanceBeforeCents), caixaPdfMoney_(w.amountCents), caixaPdfMoney_(w.balanceAfterCents)];
      }),
      ['Total', '', '', '', caixaPdfMoney_(model.withdrawals.reduce(function(t, w) { return t + Number(w.amountCents || 0); }, 0)), '']
    );
  }

  return html;
}

function caixaPdfClosingHtml_(model) {
  var c = model.closure;
  var right = '<b>' + caixaPdfEsc_(caixaPdfBrDate_(c.date)) + '</b><br>' + caixaPdfEsc_(c.unitName);
  var difference = Number(c.differenceCents || 0);

  var html = caixaPdfHeader_(model.title || 'Fechamento diário de caixa', right);

  html += caixaPdfMeta_([
    ['Unidade', c.unitName],
    ['Centro de custo', c.costCenterName || 'Não parametrizado'],
    ['Responsável', c.createdByName],
    ['Registro', caixaPdfDateTime_(c.createdAt)]
  ]);

  html += caixaPdfKpis_([
    { label: 'Receitas', value: caixaPdfMoney_(c.revenueCents), tone: 'pos' },
    { label: 'Despesas', value: caixaPdfMoney_(c.expenseCents), tone: 'neg' },
    { label: 'Resultado', value: caixaPdfMoney_(c.netCents) },
    { label: 'Ficou na gaveta', value: caixaPdfMoney_(c.carryoverCents), highlight: true }
  ]);

  if (model.positionRows && model.positionRows.length) {
    html += '<h2>Posição do dinheiro físico</h2>' + caixaPdfTable_(
      [{ label: 'Item' }, { label: 'Valor', align: 'r' }],
      model.positionRows
    );
  }

  html += caixaPdfEntriesSection_(model);

  html += '<h2>Declaração de conferência</h2><div class="box">' +
    caixaPdfEsc_(c.declarationText || CAIXA_V2_CFG.CASH_DECLARATION) +
    '<br><br><b>☑ Confirmado no sistema</b> por ' + caixaPdfEsc_(c.createdByName) +
    ' (' + caixaPdfEsc_(c.createdBy) + ') em ' + caixaPdfEsc_(caixaPdfDateTime_(c.declarationAt || c.createdAt)) + '.</div>';

  if (difference !== 0) {
    html += '<div class="box warn"><b>Diferença identificada: ' + caixaPdfEsc_(caixaPdfMoney_(difference)) +
      '</b><br>Justificativa: ' + caixaPdfEsc_(c.notes || '-') + '</div>';
  }

  html += caixaPdfSignatures_(c.createdByName, '');
  html += '<div class="foot">Documento gerado pelo Caixa Balcão · ID ' + caixaPdfEsc_(c.id) +
    ' · Emitido em ' + caixaPdfEsc_(caixaPdfDateTime_(model.generatedAt || new Date())) + '</div>';

  return caixaPdfDocument_(html);
}

function caixaPdfWithdrawalHtml_(model) {
  var w = model.withdrawal;
  var right = '<b>' + caixaPdfEsc_(caixaPdfBrDate_(w.date)) + '</b><br>' + caixaPdfEsc_(model.unitName);

  var html = caixaPdfHeader_('Comprovante de sangria', right);
  html += caixaPdfMeta_([
    ['Unidade', model.unitName],
    ['Responsável', w.operatorName],
    ['Destino', w.destination || 'Financeiro'],
    ['Registro', caixaPdfDateTime_(w.createdAt)]
  ]);

  html += '<table style="margin-top:14px"><tr><td style="text-align:center;padding:16px;border:1px solid ' + CAIXA_PDF.LINE +
    ';border-radius:8px;background:' + CAIXA_PDF.SOFT + '"><div class="muted" style="font-size:8pt;text-transform:uppercase;letter-spacing:1px">Valor retirado</div>' +
    '<div class="big">' + caixaPdfEsc_(caixaPdfMoney_(w.amountCents)) + '</div></td></tr></table>';

  html += '<h2>Movimento do numerário</h2>' + caixaPdfTable_(
    [{ label: 'Item' }, { label: 'Valor', align: 'r' }],
    [
      ['Dinheiro em caixa antes', caixaPdfMoney_(w.balanceBeforeCents)],
      ['Valor da sangria', '- ' + caixaPdfMoney_(w.amountCents)],
      caixaPdfTagRow_(['Dinheiro em caixa após', caixaPdfMoney_(w.balanceAfterCents)], 'strong')
    ]
  );

  if (w.notes) {
    html += '<h2>Observação</h2><div class="box">' + caixaPdfEsc_(w.notes) + '</div>';
  }

  html += '<h2>Declaração</h2><div class="box">' + caixaPdfEsc_(w.declarationText || '') +
    '<br><br><b>☑ Confirmado no sistema</b> em ' + caixaPdfEsc_(caixaPdfDateTime_(w.confirmedAt || w.createdAt)) + '.</div>';

  html += caixaPdfSignatures_(w.operatorName, 'Recebido por');
  html += '<div class="foot">Documento gerado pelo Caixa Balcão · ID ' + caixaPdfEsc_(w.id) +
    ' · Emitido em ' + caixaPdfEsc_(caixaPdfDateTime_(model.generatedAt || new Date())) + '</div>';

  return caixaPdfDocument_(html);
}

/* COLETA DE DADOS (Apps Script) */

function caixaPdfGroupNames_(env) {
  var names = {};
  try {
    v2ReadObjects_(env.revenues, CAIXA_V2_CFG.HEADERS.REVENUES).forEach(function(item) {
      names[String(item.revenue_type_id || '')] = String(item.name_front || item.revenue_type_id || '');
    });
  } catch (_) {}
  return names;
}

function caixaPdfSave_(html, folder, fileName) {
  var blob = Utilities.newBlob(html, MimeType.HTML, fileName.replace(/\.pdf$/i, '.html'));
  var pdf = folder.createFile(blob.getAs(MimeType.PDF).setName(fileName));
  return { status: 'GERADO', id: pdf.getId(), url: pdf.getUrl() };
}

function caixaPdfWithFallback_(label, htmlBuilder, legacy) {
  try {
    return htmlBuilder();
  } catch (error) {
    console.warn('[CAIXA_PDF][' + label + '] Layout HTML falhou, usando contingência: ' +
      (error && error.message ? error.message : error));
    return legacy();
  }
}

function v2GenerateWithdrawalPdf_(env, withdrawalId, context) {
  return caixaPdfWithFallback_('SANGRIA', function() {
    var row = v2ReadObjects_(env.withdrawals, CAIXA_V2_CFG.HEADERS.WITHDRAWALS)
      .filter(function(x) { return String(x.withdrawal_id) === String(withdrawalId); })[0];
    if (!row) return { status: 'ERRO', error: 'Sangria não encontrada' };

    var date = v2SheetDateIso_(row.date_iso);
    var model = {
      unitName: String(context.unit.name || context.unit.unit_id || ''),
      generatedAt: new Date(),
      withdrawal: {
        id: String(row.withdrawal_id),
        date: date,
        createdAt: row.created_at,
        operatorName: String(row.operator_name || ''),
        amountCents: Number(row.amount_cents || 0),
        destination: String(row.destination || 'Financeiro'),
        notes: String(row.notes || ''),
        balanceBeforeCents: Number(row.balance_before_cents || 0),
        balanceAfterCents: Number(row.balance_after_cents || 0),
        declarationText: String(row.declaration_text || ''),
        confirmedAt: row.confirmed_at
      }
    };

    var folder = v2PdfFolder_(context.unit, 'Sangrias', date);
    var name = date + '_' + String(context.unit.unit_id) + '_Sangria_' + String(withdrawalId).slice(0, 8) + '.pdf';
    return caixaPdfSave_(caixaPdfWithdrawalHtml_(model), folder, name);
  }, function() {
    return v2GenerateWithdrawalPdfLegacy_(env, withdrawalId, context);
  });
}

function v2GenerateClosingPdf_(env, closureId, context) {
  return caixaPdfWithFallback_('FECHAMENTO', function() {
    var c = v2ReadObjects_(env.closures, CAIXA_V2_CFG.HEADERS.CLOSURES)
      .filter(function(x) { return String(x.closure_id) === String(closureId); })[0];
    if (!c) return { status: 'ERRO', error: 'Fechamento não encontrado' };

    var date = v2SheetDateIso_(c.date_iso);
    var unitId = String(c.unit_id);
    var dayEntries = v2EntriesByDate_(env, date, unitId);
    var own = dayEntries.filter(function(e) { return String(e.closureId || '') === String(closureId); });
    var entries = own.length ? own : dayEntries;
    var dayWithdrawals = v2WithdrawalsByDate_(env, date, unitId);
    var ownW = dayWithdrawals.filter(function(w) { return String(w.closureId || '') === String(closureId); });

    var model = {
      title: 'Fechamento diário de caixa',
      generatedAt: new Date(),
      groupNames: caixaPdfGroupNames_(env),
      entries: entries,
      withdrawals: ownW.length ? ownW : dayWithdrawals,
      closure: {
        id: String(c.closure_id),
        date: date,
        unitName: String(c.unit_name || unitId),
        costCenterName: String(c.cost_center_ca_name_snapshot || ''),
        createdAt: c.created_at,
        createdBy: String(c.created_by || ''),
        createdByName: String(c.created_by_name || ''),
        revenueCents: Number(c.revenue_cents || 0),
        expenseCents: Number(c.expense_cents || 0),
        netCents: Number(c.net_cents || 0),
        carryoverCents: Number(c.carryover_cents || 0),
        differenceCents: Number(c.difference_cents || 0),
        notes: String(c.notes || ''),
        declarationText: String(c.declaration_text || ''),
        declarationAt: c.declaration_confirmed_at
      },
      positionRows: [
        ['Saldo inicial', caixaPdfMoney_(c.opening_cash_cents)],
        ['+ Receitas em dinheiro', caixaPdfMoney_(c.cash_revenue_cents)],
        ['- Despesas em dinheiro', caixaPdfMoney_(c.cash_expense_cents)],
        ['- Sangrias durante o dia', caixaPdfMoney_(c.withdrawals_before_close_cents)],
        caixaPdfTagRow_(['= Esperado na gaveta', caixaPdfMoney_(c.expected_cash_cents)], 'strong'),
        ['Conferido', caixaPdfMoney_(c.counted_cash_cents)],
        ['Diferença', caixaPdfMoney_(c.difference_cents)],
        ['- Sangria no fechamento', caixaPdfMoney_(c.closing_withdrawal_cents)],
        caixaPdfTagRow_(['= Ficou na gaveta', caixaPdfMoney_(c.carryover_cents)], 'strong')
      ]
    };

    var folder = v2PdfFolder_(context.unit, 'Fechamentos', date);
    var name = date + '_' + unitId + '_Fechamento_Caixa.pdf';
    return caixaPdfSave_(caixaPdfClosingHtml_(model), folder, name);
  }, function() {
    return v2GenerateClosingPdfLegacy_(env, closureId, context);
  });
}

function v3GenerateSupplementPdf_(env, supplementId, context) {
  return caixaPdfWithFallback_('COMPLEMENTO', function() {
    var c = v3SupplementRecord_(env, supplementId);
    if (!c) return { status: 'ERRO', error: 'Fechamento complementar não encontrado' };

    var date = v2SheetDateIso_(c.date_iso);
    var unitId = String(c.unit_id);
    var sequence = Number(c.sequence || 1);
    var entries = v3EntriesForClosure_(env, supplementId);
    var withdrawals = v3WithdrawalsForClosure_(env, supplementId);
    var withdrawalTotal = withdrawals.reduce(function(t, w) { return t + Number(w.amountCents || 0); }, 0);

    var model = {
      title: 'Fechamento complementar nº ' + sequence,
      generatedAt: new Date(),
      groupNames: caixaPdfGroupNames_(env),
      entries: entries,
      withdrawals: withdrawals,
      closure: {
        id: String(c.supplement_id),
        date: date,
        unitName: String(c.unit_name || unitId),
        costCenterName: 'Complemento do fechamento ' + String(c.base_closure_id || '').slice(0, 8),
        createdAt: c.created_at,
        createdBy: String(c.created_by || ''),
        createdByName: String(c.created_by_name || ''),
        revenueCents: Number(c.revenue_cents || 0),
        expenseCents: Number(c.expense_cents || 0),
        netCents: Number(c.net_cents || 0),
        carryoverCents: Number(c.carryover_cents || 0),
        differenceCents: 0,
        notes: String(c.notes || ''),
        declarationText: CAIXA_V2_CFG.CASH_DECLARATION,
        declarationAt: c.created_at
      },
      positionRows: [
        ['+ Receitas em dinheiro (novas)', caixaPdfMoney_(c.cash_revenue_cents)],
        ['- Despesas em dinheiro (novas)', caixaPdfMoney_(c.cash_expense_cents)],
        ['- Sangrias consolidadas', caixaPdfMoney_(withdrawalTotal)],
        caixaPdfTagRow_(['= Dinheiro na gaveta após o complemento', caixaPdfMoney_(c.carryover_cents)], 'strong')
      ]
    };

    var folder = v2PdfFolder_(context.unit, 'Fechamentos', date);
    var seq = ('0' + String(sequence)).slice(-2);
    var name = date + '_' + unitId + '_Fechamento_Complementar_' + seq + '_' + String(supplementId).slice(0, 8) + '.pdf';
    return caixaPdfSave_(caixaPdfClosingHtml_(model), folder, name);
  }, function() {
    return v3GenerateSupplementPdfLegacy_(env, supplementId, context);
  });
}

function caixaPdfTagRow_(row, cls) {
  row.__class = cls;
  return row;
}

/** Teste manual no editor: gera um PDF de exemplo na raiz do Drive. */
function testarLayoutPdfCaixaV2() {
  var model = {
    title: 'Fechamento diário de caixa (TESTE)',
    generatedAt: new Date(),
    groupNames: { ATENDE: 'Atende', SARA: 'SARA' },
    entries: [
      { type: 'RECEITA', createdAt: new Date().toISOString(), categoryId: 'ATENDE', paymentId: 'DINHEIRO', paymentName: 'Dinheiro', mode: 'ATENDIMENTO', objectCount: 2, amountCents: 4590 },
      { type: 'RECEITA', createdAt: new Date().toISOString(), categoryId: 'SARA', paymentId: 'PIX_INFINITY', paymentName: 'Pix Infinity', pixStatus: 'CONFIRMADO', pixProvider: 'MAQUININHA', mode: 'AVULSO', objectCount: 1, amountCents: 1200 },
      { type: 'DESPESA', createdAt: new Date().toISOString(), categoryContaAzulName: '3.6.3. Copa e Cozinha', description: 'Café', paymentId: 'DINHEIRO', paymentName: 'Dinheiro', amountCents: 800 }
    ],
    withdrawals: [],
    closure: { id: 'teste', date: v2Today_(), unitName: 'AGF', createdByName: 'Teste', createdBy: 'teste', revenueCents: 5790, expenseCents: 800, netCents: 4990, carryoverCents: 3790, differenceCents: 0, createdAt: new Date() },
    positionRows: [['Saldo inicial', caixaPdfMoney_(0)], caixaPdfTagRow_(['= Ficou na gaveta', caixaPdfMoney_(3790)], 'strong')]
  };
  var blob = Utilities.newBlob(caixaPdfClosingHtml_(model), MimeType.HTML, 'teste.html');
  var file = DriveApp.createFile(blob.getAs(MimeType.PDF).setName('TESTE_Layout_Fechamento_Caixa.pdf'));
  return file.getUrl();
}
