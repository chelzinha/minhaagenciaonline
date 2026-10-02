/**
 * CAIXA BALCÃO - RELATÓRIO CONSOLIDADO POR PERÍODO (2026-10-02)
 *
 * Ação: periodReport { startDate, endDate }  (somente role = admin)
 * Gera um PDF no Drive da unidade (Relatorios/AAAA/MM - Mês/UNIDADE) e
 * devolve { ok, url, fileName, summary }.
 *
 * Somente leitura: não grava nada na base do Caixa.
 * Leitura em bloco: cada aba é lida uma única vez por relatório.
 */

var CAIXA_REPORT_CFG = Object.freeze({
  MAX_DAYS: 92,
  PIX_PENDING: ['CRIANDO', 'ATIVA', 'PENDENTE'],
  RETRO_SHEET: 'Auditoria_Retroativa',
  WEEKDAYS: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  ACTION_LABELS: {
    saveEntry: 'Lançamento',
    saveBatch: 'Lançamento em lote',
    deleteEntry: 'Exclusão',
    closeCash: 'Fechamento',
    syncPixPayment: 'Pix confirmado/cancelado'
  }
});

/* HELPERS PUROS */

function caixaReportIsoDays_(start, end) {
  var days = [];
  var cursor = new Date(start + 'T12:00:00Z');
  var last = new Date(end + 'T12:00:00Z');

  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function caixaReportWeekday_(iso) {
  return CAIXA_REPORT_CFG.WEEKDAYS[new Date(iso + 'T12:00:00Z').getUTCDay()];
}

function caixaReportIsCash_(row) {
  return String(row.payment_id || '') === 'DINHEIRO' ||
    String(row.payment_ca_method || '') === 'DINHEIRO';
}

function caixaReportBump_(map, key, name, cents, extra) {
  if (!map[key]) {
    map[key] = { key: key, name: name || key, count: 0, cents: 0, objects: 0 };
  }
  map[key].count += 1;
  map[key].cents += cents;
  map[key].objects += Number(extra || 0);
}

function caixaReportSorted_(map) {
  return Object.keys(map)
    .map(function(key) { return map[key]; })
    .sort(function(a, b) { return b.cents - a.cents; });
}

/**
 * Monta o modelo do relatório a partir das linhas já lidas.
 * raw: { entries, withdrawals, closures, supplements, balances, queue, retro }
 * (objetos no formato de v2ReadObjects_)
 */
function caixaBuildPeriodModel_(raw, unitId, start, end, groupNames) {
  var unit = String(unitId || '');
  var inRange = function(iso) { return iso >= start && iso <= end; };
  var dateOf = function(row, field) { return v2SheetDateIso_(row[field || 'date_iso']); };
  var ofUnit = function(row) { return String(row.unit_id || '').trim() === unit; };

  var allEntries = (raw.entries || []).filter(ofUnit);
  var allWithdrawals = (raw.withdrawals || []).filter(ofUnit);
  var balances = (raw.balances || []).filter(ofUnit);

  var entries = allEntries.filter(function(row) {
    return inRange(dateOf(row)) && String(row.status || '').toUpperCase() !== 'EXCLUIDO';
  });
  var deleted = allEntries.filter(function(row) {
    return inRange(dateOf(row)) && String(row.status || '').toUpperCase() === 'EXCLUIDO';
  });
  var withdrawals = allWithdrawals.filter(function(row) { return inRange(dateOf(row)); });
  var closures = (raw.closures || []).filter(function(row) { return ofUnit(row) && inRange(dateOf(row)); });
  var supplements = (raw.supplements || []).filter(function(row) { return ofUnit(row) && inRange(dateOf(row)); });

  var closureByDay = {};
  closures.forEach(function(c) { closureByDay[dateOf(c)] = c; });
  var supplementsByDay = {};
  supplements.forEach(function(s) {
    var d = dateOf(s);
    (supplementsByDay[d] = supplementsByDay[d] || []).push(s);
  });
  var balanceByDay = {};
  balances.forEach(function(b) { balanceByDay[dateOf(b)] = b; });

  var byPayment = {};
  var byGroup = {};
  var byExpense = {};
  var dayMap = {};
  var pixPending = [];
  var totals = {
    revenueCents: 0, expenseCents: 0, netCents: 0, objects: 0,
    revenueCount: 0, expenseCount: 0, cashRevenueCents: 0, cashExpenseCents: 0,
    withdrawalCents: 0, withdrawalCount: 0, pixPendingCents: 0
  };

  function day(iso) {
    if (!dayMap[iso]) {
      dayMap[iso] = {
        date: iso, revenueCents: 0, expenseCents: 0, cashRevenueCents: 0,
        cashExpenseCents: 0, withdrawalCents: 0, objects: 0, count: 0, pixPendingCents: 0
      };
    }
    return dayMap[iso];
  }

  entries.forEach(function(row) {
    var iso = dateOf(row);
    var d = day(iso);
    var cents = Number(row.amount_cents || 0);
    var isExpense = String(row.type || '').toUpperCase() === 'DESPESA';
    var cash = caixaReportIsCash_(row);
    d.count += 1;

    if (isExpense) {
      d.expenseCents += cents;
      totals.expenseCents += cents;
      totals.expenseCount += 1;
      if (cash) { d.cashExpenseCents += cents; totals.cashExpenseCents += cents; }
      caixaReportBump_(byExpense, String(row.category_id || ''), String(row.category_ca_name_snapshot || row.category_id || ''), cents);
      return;
    }

    var objects = Number(row.object_count || 0);
    d.revenueCents += cents;
    d.objects += objects;
    totals.revenueCents += cents;
    totals.revenueCount += 1;
    totals.objects += objects;
    if (cash) { d.cashRevenueCents += cents; totals.cashRevenueCents += cents; }

    caixaReportBump_(byPayment, String(row.payment_id || ''), String(row.payment_name || row.payment_id || ''), cents);
    caixaReportBump_(byGroup, String(row.category_id || ''), groupNames[String(row.category_id || '')] || String(row.category_ca_name_snapshot || 'Balcão'), cents, objects);

    var pix = String(row.pix_status || '').toUpperCase();
    if (
      String(row.payment_ca_method || '') === 'PIX_PAGAMENTO_INSTANTANEO' &&
      CAIXA_REPORT_CFG.PIX_PENDING.indexOf(pix) >= 0
    ) {
      d.pixPendingCents += cents;
      totals.pixPendingCents += cents;
      pixPending.push(row);
    }
  });

  withdrawals.forEach(function(row) {
    var d = day(dateOf(row));
    var cents = Number(row.amount_cents || 0);
    d.withdrawalCents += cents;
    totals.withdrawalCents += cents;
    totals.withdrawalCount += 1;
  });

  Object.keys(closureByDay).forEach(day);
  Object.keys(supplementsByDay).forEach(day);

  var days = Object.keys(dayMap).sort().map(function(iso) {
    var d = dayMap[iso];
    var closure = closureByDay[iso] || null;
    var sup = supplementsByDay[iso] || [];
    var balance = balanceByDay[iso] || null;
    var opening = balance
      ? Number(balance.opening_cash_cents || 0)
      : v2ComputeOpening_(raw.balances || [], raw.entries || [], raw.withdrawals || [], iso, unit).cents;
    var expectedEnd = opening + d.cashRevenueCents - d.cashExpenseCents - d.withdrawalCents;
    var closedEnd = balance && String(balance.status || '') === 'FECHADO'
      ? Number(balance.carryover_cents || 0)
      : null;

    var status = closure
      ? (sup.length ? 'Fechado + ' + sup.length + ' compl.' : 'Fechado')
      : (d.count || d.withdrawalCents ? 'Sem fechamento' : 'Sem movimento');

    return {
      date: iso,
      weekday: caixaReportWeekday_(iso),
      status: status,
      closed: Boolean(closure),
      revenueCents: d.revenueCents,
      expenseCents: d.expenseCents,
      netCents: d.revenueCents - d.expenseCents,
      cashRevenueCents: d.cashRevenueCents,
      cashExpenseCents: d.cashExpenseCents,
      withdrawalCents: d.withdrawalCents,
      objects: d.objects,
      openingCents: opening,
      endCents: closedEnd === null ? expectedEnd : closedEnd,
      endIsClosed: closedEnd !== null,
      pixPendingCents: d.pixPendingCents,
      pdfUrl: closure ? String(closure.pdf_url || '') : '',
      supplementPdfs: sup.map(function(s) { return String(s.pdf_url || ''); }).filter(Boolean),
      closedBy: closure ? String(closure.created_by_name || '') : ''
    };
  });

  totals.netCents = totals.revenueCents - totals.expenseCents;

  var periodDays = caixaReportIsoDays_(start, end);
  var activeDays = days.filter(function(d) { return d.status !== 'Sem movimento'; });
  var unclosedDays = days.filter(function(d) { return d.status === 'Sem fechamento'; });

  var closureIds = {};
  closures.forEach(function(c) { closureIds[String(c.closure_id || '')] = true; });
  supplements.forEach(function(s) { closureIds[String(s.supplement_id || '')] = true; });
  var queueStatus = {};
  (raw.queue || []).forEach(function(q) {
    if (!closureIds[String(q.closure_id || '')]) return;
    var st = String(q.status || 'SEM_STATUS');
    queueStatus[st] = (queueStatus[st] || 0) + 1;
  });

  var retro = (raw.retro || []).filter(function(row) {
    return String(row.unit_id || '') === unit && inRange(v2SheetDateIso_(row.work_date));
  });

  var firstDay = days[0];
  var lastDay = days[days.length - 1];

  return {
    unitId: unit,
    start: start,
    end: end,
    totals: totals,
    days: days,
    periodDayCount: periodDays.length,
    activeDayCount: activeDays.length,
    unclosedDays: unclosedDays,
    openingCents: firstDay ? firstDay.openingCents : 0,
    endCents: lastDay ? lastDay.endCents : 0,
    byPayment: caixaReportSorted_(byPayment),
    byGroup: caixaReportSorted_(byGroup),
    byExpense: caixaReportSorted_(byExpense),
    withdrawals: withdrawals.sort(function(a, b) { return String(v2Iso_(a.created_at)).localeCompare(String(v2Iso_(b.created_at))); }),
    deleted: deleted,
    pixPending: pixPending,
    queueStatus: queueStatus,
    retro: retro
  };
}

/* HTML (puro) */

function caixaPeriodReportHtml_(m, meta) {
  var money = caixaPdfMoney_;
  var br = caixaPdfBrDate_;
  var esc = caixaPdfEsc_;
  var t = m.totals;
  var html = '';

  html += caixaPdfHeader_(
    'Relatório consolidado do caixa',
    '<b>' + esc(br(m.start)) + ' a ' + esc(br(m.end)) + '</b><br>' + esc(meta.unitName)
  );

  html += caixaPdfMeta_([
    ['Unidade', meta.unitName],
    ['Período', br(m.start) + ' a ' + br(m.end) + ' (' + m.periodDayCount + ' dias)'],
    ['Dias com movimento', String(m.activeDayCount)],
    ['Emitido por', meta.userName + ' em ' + caixaPdfDateTime_(meta.generatedAt)]
  ]);

  html += caixaPdfKpis_([
    { label: 'Receitas', value: money(t.revenueCents), tone: 'pos' },
    { label: 'Despesas', value: money(t.expenseCents), tone: 'neg' },
    { label: 'Resultado', value: money(t.netCents) },
    { label: 'Sangrias', value: money(t.withdrawalCents), highlight: true }
  ]);

  html += caixaPdfKpis_([
    { label: 'Lançamentos de receita', value: String(t.revenueCount) },
    { label: 'Objetos', value: String(t.objects) },
    { label: 'Ticket médio', value: money(t.revenueCount ? Math.round(t.revenueCents / t.revenueCount) : 0) },
    { label: 'Pix pendente', value: money(t.pixPendingCents), tone: t.pixPendingCents ? 'neg' : '' }
  ]);

  /* Pontos de atenção */
  var alerts = [];
  if (m.unclosedDays.length) {
    alerts.push(m.unclosedDays.length + ' dia(s) com movimento e sem fechamento: ' +
      m.unclosedDays.map(function(d) { return br(d.date).slice(0, 5); }).join(', ') + '.');
  }
  if (m.pixPending.length) {
    alerts.push(m.pixPending.length + ' Pix Santander pendente(s) de confirmação, total ' + money(t.pixPendingCents) + '.');
  }
  if (m.deleted.length) {
    alerts.push(m.deleted.length + ' lançamento(s) excluído(s) no período.');
  }
  if (m.retro.length) {
    alerts.push(m.retro.length + ' alteração(ões) feitas em dia anterior (retroativas).');
  }
  var queueErrors = (m.queueStatus.ERRO || 0) + (m.queueStatus.CONFIGURACAO_PENDENTE || 0);
  if (queueErrors) {
    alerts.push(queueErrors + ' lançamento(s) com erro no envio ao Conta Azul.');
  }

  html += '<h2>Pontos de atenção</h2>' + (alerts.length
    ? '<div class="box warn">' + alerts.map(function(a) { return '• ' + esc(a); }).join('<br>') + '</div>'
    : '<div class="box">Nenhuma pendência identificada no período.</div>');

  /* Dinheiro físico */
  html += '<h2>Dinheiro físico no período</h2>' + caixaPdfTable_(
    [{ label: 'Item' }, { label: 'Valor', align: 'r' }],
    [
      ['Saldo inicial do primeiro dia', money(m.openingCents)],
      ['+ Receitas em dinheiro', money(t.cashRevenueCents)],
      ['- Despesas em dinheiro', money(t.cashExpenseCents)],
      ['- Sangrias', money(t.withdrawalCents)],
      caixaPdfTagRow_(['= Saldo final do último dia', money(m.endCents)], 'strong')
    ]
  );

  /* Por dia */
  html += '<h2>Resumo por dia</h2>' + caixaPdfTable_(
    [
      { label: 'Dia' }, { label: 'Situação' }, { label: 'Receitas', align: 'r' },
      { label: 'Despesas', align: 'r' }, { label: 'Resultado', align: 'r' },
      { label: 'Sangrias', align: 'r' }, { label: 'Gaveta final', align: 'r' }, { label: 'PDF', align: 'c' }
    ],
    m.days.map(function(d) {
      var links = [];
      if (d.pdfUrl) links.push('<a href="' + esc(d.pdfUrl) + '">dia</a>');
      d.supplementPdfs.forEach(function(url, i) { links.push('<a href="' + esc(url) + '">c' + (i + 1) + '</a>'); });
      var row = [
        br(d.date).slice(0, 5) + ' ' + d.weekday,
        { __html: d.status === 'Sem fechamento' ? '<span class="tag exp">Sem fechamento</span>' : esc(d.status) },
        money(d.revenueCents),
        money(d.expenseCents),
        money(d.netCents),
        money(d.withdrawalCents),
        money(d.endCents) + (d.endIsClosed ? '' : ' *'),
        { __html: links.join(' ') || '-' }
      ];
      return row;
    }),
    ['Total', '', money(t.revenueCents), money(t.expenseCents), money(t.netCents), money(t.withdrawalCents), '', '']
  ) + '<div class="muted" style="font-size:7.5pt;margin-top:4px">* Gaveta final calculada (dia sem fechamento).</div>';

  /* Por grupo */
  if (m.byGroup.length) {
    html += '<h2>Receitas por grupo</h2>' + caixaPdfTable_(
      [{ label: 'Grupo' }, { label: 'Lançamentos', align: 'c' }, { label: 'Objetos', align: 'c' }, { label: '% receita', align: 'r' }, { label: 'Total', align: 'r' }],
      m.byGroup.map(function(g) {
        return [g.name, String(g.count), String(g.objects), (t.revenueCents ? (g.cents * 100 / t.revenueCents).toFixed(1).replace('.', ',') : '0,0') + '%', money(g.cents)];
      }),
      ['Total', String(t.revenueCount), String(t.objects), '100%', money(t.revenueCents)]
    );
  }

  /* Por forma */
  html += '<h2>Receitas por forma de pagamento</h2>' + (m.byPayment.length
    ? caixaPdfTable_(
        [{ label: 'Forma' }, { label: 'Lançamentos', align: 'c' }, { label: '% receita', align: 'r' }, { label: 'Total', align: 'r' }],
        m.byPayment.map(function(p) {
          return [p.name, String(p.count), (t.revenueCents ? (p.cents * 100 / t.revenueCents).toFixed(1).replace('.', ',') : '0,0') + '%', money(p.cents)];
        }),
        ['Total', String(t.revenueCount), '100%', money(t.revenueCents)]
      )
    : '<div class="box">Nenhuma receita no período.</div>');

  /* Despesas */
  if (m.byExpense.length) {
    html += '<h2>Despesas por categoria</h2>' + caixaPdfTable_(
      [{ label: 'Categoria' }, { label: 'Lançamentos', align: 'c' }, { label: 'Total', align: 'r' }],
      m.byExpense.map(function(e) { return [e.name, String(e.count), money(e.cents)]; }),
      ['Total', String(t.expenseCount), money(t.expenseCents)]
    );
  }

  /* Sangrias */
  if (m.withdrawals.length) {
    html += '<h2>Sangrias</h2>' + caixaPdfTable_(
      [{ label: 'Dia', align: 'c' }, { label: 'Hora', align: 'c' }, { label: 'Responsável' }, { label: 'Destino' }, { label: 'Valor', align: 'r' }],
      m.withdrawals.map(function(w) {
        return [br(v2SheetDateIso_(w.date_iso)).slice(0, 5), caixaPdfTime_(w.created_at), String(w.operator_name || ''), String(w.destination || 'Financeiro'), money(w.amount_cents)];
      }),
      ['Total', '', '', '', money(t.withdrawalCents)]
    );
  }

  /* Pix pendente */
  if (m.pixPending.length) {
    html += '<h2>Pix Santander pendente de confirmação</h2>' + caixaPdfTable_(
      [{ label: 'Dia', align: 'c' }, { label: 'Hora', align: 'c' }, { label: 'Operador' }, { label: 'Observação' }, { label: 'Valor', align: 'r' }],
      m.pixPending.map(function(e) {
        return [br(v2SheetDateIso_(e.date_iso)).slice(0, 5), caixaPdfTime_(e.created_at), String(e.operator_name || ''), String(e.description || ''), money(e.amount_cents)];
      }),
      ['Total', '', '', '', money(t.pixPendingCents)]
    );
  }

  /* Exclusões */
  if (m.deleted.length) {
    html += '<h2>Lançamentos excluídos</h2>' + caixaPdfTable_(
      [{ label: 'Dia', align: 'c' }, { label: 'Forma' }, { label: 'Excluído por' }, { label: 'Motivo' }, { label: 'Valor', align: 'r' }],
      m.deleted.map(function(e) {
        return [br(v2SheetDateIso_(e.date_iso)).slice(0, 5), String(e.payment_name || e.payment_id || ''), String(e.deleted_by_name || e.deleted_by || ''), String(e.delete_reason || ''), money(e.amount_cents)];
      })
    );
  }

  /* Retroativas */
  if (m.retro.length) {
    html += '<h2>Alterações feitas em dia anterior</h2>' + caixaPdfTable_(
      [{ label: 'Dia do caixa', align: 'c' }, { label: 'Feito em' }, { label: 'Usuário' }, { label: 'Ação' }, { label: 'Valor', align: 'r' }],
      m.retro.map(function(r) {
        return [br(v2SheetDateIso_(r.work_date)).slice(0, 5), caixaPdfDateTime_(r.created_at), String(r.user_name || r.user_id || ''), CAIXA_REPORT_CFG.ACTION_LABELS[String(r.action || '')] || String(r.action || ''), money(r.amount_cents)];
      })
    );
  }

  /* Conta Azul */
  var qKeys = Object.keys(m.queueStatus);
  html += '<h2>Envio ao Conta Azul</h2>' + (qKeys.length
    ? caixaPdfTable_(
        [{ label: 'Situação' }, { label: 'Lançamentos', align: 'r' }],
        qKeys.sort().map(function(k) { return [k, String(m.queueStatus[k])]; })
      )
    : '<div class="box">Nenhum lançamento do período entrou na fila do Conta Azul (dias sem fechamento não são enviados).</div>');

  html += '<h2>Validação da gestão</h2><div class="box">' +
    'Declaro que conferi os valores deste relatório com os fechamentos diários e os extratos das contas do período.' +
    '</div>';
  html += caixaPdfSignatures_(meta.userName, ' ', 'Emitido por', 'Validado por (gestão)');
  html += '<div class="foot">Relatório gerado pelo Caixa Balcão · ' + esc(meta.unitName) + ' · ' +
    esc(br(m.start)) + ' a ' + esc(br(m.end)) + ' · Emitido em ' + esc(caixaPdfDateTime_(meta.generatedAt)) + '</div>';

  return caixaPdfDocument_(html);
}

/* AÇÃO (Apps Script) */

function caixaReadOptionalSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim(); });
  return values.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function caixaPeriodReport_(request, user) {
  var role = String(user && user.role || '').toLowerCase();
  if (role !== 'admin') {
    throw appError_('Relatório por período disponível somente para administrador.', 'ADMIN_REQUIRED');
  }

  var start = String(request.startDate || '').trim();
  var end = String(request.endDate || '').trim();
  var isoRe = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoRe.test(start) || !isoRe.test(end)) {
    throw appError_('Informe a data inicial e a data final.', 'INVALID_PERIOD');
  }
  if (start > end) {
    throw appError_('A data inicial não pode ser depois da data final.', 'INVALID_PERIOD');
  }

  var today = typeof caixaRealToday_ === 'function' ? caixaRealToday_() : v2Today_();
  if (end > today) end = today;
  if (start > today) {
    throw appError_('O período não pode começar no futuro.', 'INVALID_PERIOD');
  }

  var dayCount = caixaReportIsoDays_(start, end).length;
  if (dayCount > CAIXA_REPORT_CFG.MAX_DAYS) {
    throw appError_('Escolha um período de até ' + CAIXA_REPORT_CFG.MAX_DAYS + ' dias.', 'PERIOD_TOO_LONG');
  }

  var env = v2Environment_();
  var context = v2ResolveContext_(env, user);
  var unitId = String(context.unit.unit_id || '');
  var H = CAIXA_V2_CFG.HEADERS;

  var supplementSheet = env.ss.getSheetByName(CAIXA_V3_SUPPLEMENT_SHEET);

  var raw = {
    entries: v2ReadObjects_(env.entries, H.ENTRIES),
    withdrawals: v2ReadObjects_(env.withdrawals, H.WITHDRAWALS),
    closures: v2ReadObjects_(env.closures, H.CLOSURES),
    supplements: supplementSheet ? v2ReadObjects_(supplementSheet, CAIXA_V3_SUPPLEMENT_HEADERS) : [],
    balances: v2ReadObjects_(env.dailyBalances, H.DAILY_BALANCES),
    queue: v2ReadObjects_(env.caQueue, H.CA_QUEUE),
    retro: caixaReadOptionalSheet_(env.ss, CAIXA_REPORT_CFG.RETRO_SHEET)
  };

  var model = caixaBuildPeriodModel_(raw, unitId, start, end, caixaPdfGroupNames_(env));
  var meta = {
    unitName: String(context.unit.name || unitId),
    userName: String(user.name || user.id || ''),
    generatedAt: new Date()
  };

  var html = caixaPeriodReportHtml_(model, meta);
  var folder = v2PdfFolder_(context.unit, 'Relatorios', start);
  var stamp = Utilities.formatDate(new Date(), CAIXA_V2_CFG.TIMEZONE, 'yyyyMMdd_HHmm');
  var fileName = unitId + '_Relatorio_Caixa_' + start + '_a_' + end + '_' + stamp + '.pdf';
  var pdf = caixaPdfSave_(html, folder, fileName);

  return {
    ok: true,
    url: pdf.url,
    fileName: fileName,
    period: { start: start, end: end, days: dayCount },
    summary: {
      revenueCents: model.totals.revenueCents,
      expenseCents: model.totals.expenseCents,
      netCents: model.totals.netCents,
      withdrawalCents: model.totals.withdrawalCents,
      activeDays: model.activeDayCount,
      unclosedDays: model.unclosedDays.length
    }
  };
}
