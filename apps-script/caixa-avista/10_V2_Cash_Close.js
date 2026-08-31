function v2BuildSummary_(env,date,unitId) {
  var entries = v2EntriesByDate_(env,date,unitId);
  var withdrawals = v2WithdrawalsByDate_(env,date,unitId);
  var s = { date:date,unitId:unitId,revenueCents:0,expenseCents:0,netCents:0,revenueCount:0,expenseCount:0,byPayment:{},countByPayment:{},cashRevenueCents:0,cashExpenseCents:0,pixPendingCents:0,pixConfirmedCents:0,withdrawalsCents:0,openingCashCents:0,expectedCashCents:0 };
  entries.forEach(function(e){
    if (e.type==='DESPESA') { s.expenseCents+=e.amountCents; s.expenseCount++; if (e.paymentId==='DINHEIRO') s.cashExpenseCents+=e.amountCents; }
    else {
      if (e.paymentId==='PIX' && ['ATIVA','PENDENTE','CRIANDO'].indexOf(e.pixStatus)>=0) { s.pixPendingCents+=e.amountCents; return; }
      s.revenueCents+=e.amountCents; s.revenueCount++; s.byPayment[e.paymentId]=(s.byPayment[e.paymentId]||0)+e.amountCents; s.countByPayment[e.paymentId]=(s.countByPayment[e.paymentId]||0)+1;
      if (e.paymentId==='DINHEIRO') s.cashRevenueCents+=e.amountCents;
      if (e.paymentId==='PIX') s.pixConfirmedCents+=e.amountCents;
    }
  });
  withdrawals.forEach(function(w){ s.withdrawalsCents += w.amountCents; });
  s.openingCashCents = v2OpeningBalance_(env,date,unitId);
  s.expectedCashCents = s.openingCashCents + s.cashRevenueCents - s.cashExpenseCents - s.withdrawalsCents;
  s.netCents = s.revenueCents - s.expenseCents;
  return s;
}

function v2OpeningBalance_(env,date,unitId) {
  var rows = v2ReadObjects_(env.dailyBalances,CAIXA_V2_CFG.HEADERS.DAILY_BALANCES);
  var current = rows.filter(function(x){ return String(x.unit_id)===unitId && String(x.date_iso)===date; })[0];
  if (current) return Number(current.opening_cash_cents||0);
  var previous = rows.filter(function(x){ return String(x.unit_id)===unitId && String(x.date_iso)<date && String(x.status)==='FECHADO'; })
    .sort(function(a,b){ return String(b.date_iso).localeCompare(String(a.date_iso)); })[0];
  var opening = previous ? Number(previous.carryover_cents||0) : 0;
  env.dailyBalances.appendRow([unitId,date,opening,previous?'SALDO_ANTERIOR':'INICIAL_ZERO',new Date(),'sistema','','','','','', 'ABERTO']);
  return opening;
}

function v2SetOpeningBalance_(dateValue,amountValue,user) {
  var env=v2Environment_(),context=v2ResolveContext_(env,user),date=v2Date_(dateValue||v2Today_()),amount=Math.round(Number(amountValue||0));
  if (amount<0) throw appError_('Saldo inicial inválido.','INVALID_OPENING');
  v2AssertOpen_(env,date,String(context.unit.unit_id));
  var rows=v2ReadObjects_(env.dailyBalances,CAIXA_V2_CFG.HEADERS.DAILY_BALANCES), found=rows.filter(function(x){return String(x.unit_id)===String(context.unit.unit_id)&&String(x.date_iso)===date;})[0];
  if (found) env.dailyBalances.getRange(found._sheetRow,3).setValue(amount);
  else env.dailyBalances.appendRow([context.unit.unit_id,date,amount,'MANUAL',new Date(),user.id,'','','','','','ABERTO']);
  return {ok:true,summary:v2BuildSummary_(env,date,String(context.unit.unit_id))};
}

function v2RecordWithdrawal_(env, context, user, data) {
  var id = data.id || Utilities.getUuid();
  var created = data.createdAt || new Date();
  var before = Math.round(Number(data.balanceBeforeCents || 0));
  var amount = Math.round(Number(data.amountCents || 0));
  var after = before - amount;
  env.withdrawals.appendRow([
    id, data.date, created, String(context.unit.unit_id), user.id, user.name, amount,
    String(data.destination || 'Financeiro'), String(data.notes || ''), before, after,
    CAIXA_V2_CFG.WITHDRAWAL_DECLARATION_VERSION, CAIXA_V2_CFG.WITHDRAWAL_DECLARATION,
    true, created, String(data.closureId || ''), 'PENDENTE', '', ''
  ]);
  var pdf = v2GenerateWithdrawalPdf_(env, id, context);
  v2UpdateWithdrawalPdf_(env, id, pdf);
  return { id:id, amountCents:amount, balanceBeforeCents:before, balanceAfterCents:after, pdfStatus:pdf.status, pdfUrl:pdf.url || '' };
}

function v2CreateWithdrawal_(payload,user) {
  if (!payload || !v2Bool_(payload.confirmed)) throw appError_('Confirme a conferência da sangria.','DECLARATION_REQUIRED');
  var env=v2Environment_(), context=v2ResolveContext_(env,user);
  if (!context.permissions.withdraw) throw appError_('Usuário sem permissão para sangria.','FORBIDDEN');
  var date=v2Date_(payload.date||v2Today_()), unitId=String(context.unit.unit_id), amount=Math.round(Number(payload.amountCents||0));
  if (!(amount>0)) throw appError_('Valor da sangria inválido.','INVALID_AMOUNT');
  v2AssertOpen_(env,date,unitId);
  var summary=v2BuildSummary_(env,date,unitId);
  if (amount>summary.expectedCashCents) throw appError_('A sangria não pode ser maior que o saldo esperado em dinheiro.','WITHDRAWAL_EXCEEDS_CASH');
  var withdrawal = v2RecordWithdrawal_(env, context, user, {
    date:date, amountCents:amount, balanceBeforeCents:summary.expectedCashCents,
    destination:payload.destination, notes:payload.notes, closureId:''
  });
  return {ok:true,withdrawal:withdrawal,summary:v2BuildSummary_(env,date,unitId)};
}

function v2Close_(payload,user) {
  if (!payload || !v2Bool_(payload.declarationConfirmed)) throw appError_('Confirme a declaração de conferência.','DECLARATION_REQUIRED');
  var env=v2Environment_(),context=v2ResolveContext_(env,user);
  if (!context.permissions.close) throw appError_('Usuário sem permissão para fechar o caixa.','FORBIDDEN');
  var date=v2Date_(payload.date||v2Today_()),unitId=String(context.unit.unit_id);
  var existing=v2FindClosure_(env,date,unitId); if(existing) return {ok:true,closure:existing,alreadyClosed:true};
  var summary=v2BuildSummary_(env,date,unitId);
  if ((summary.revenueCount+summary.expenseCount)===0) throw appError_('Não há movimentos para fechar.','NO_ENTRIES');
  if (summary.pixPendingCents>0) throw appError_('Há Pix aguardando confirmação.','PIX_PENDING');
  var counted=Math.round(Number(payload.countedCashCents||0)); if(counted<0) throw appError_('Contagem inválida.','INVALID_COUNT');
  var difference=counted-summary.expectedCashCents;
  var notes=String(payload.notes||'').trim(); if(difference!==0 && !notes) throw appError_('Informe a justificativa da diferença.','DIFFERENCE_NOTE_REQUIRED');
  var closingWithdrawal=Math.round(Number(payload.closingWithdrawalCents||0));
  if (closingWithdrawal<0 || closingWithdrawal>counted) throw appError_('Sangria do fechamento inválida.','INVALID_CLOSING_WITHDRAWAL');
  var closureId=Utilities.getUuid(), now=new Date(), carryover=counted-closingWithdrawal;
  if (closingWithdrawal>0) {
    v2RecordWithdrawal_(env, context, user, {
      date:date, amountCents:closingWithdrawal, balanceBeforeCents:counted,
      destination:payload.withdrawalDestination||'Financeiro',
      notes:payload.withdrawalNotes||'Sangria realizada no fechamento', closureId:closureId
    });
  }
  var paymentTotals=summary.byPayment, paymentCounts=summary.countByPayment;
  env.closures.appendRow([closureId,date,unitId,String(context.unit.name||unitId),String(context.unit.cost_center_ca_id||''),String(context.unit.cost_center_name||''),now,user.id,user.name,'FECHADO',summary.revenueCents,summary.expenseCents,summary.netCents,JSON.stringify(paymentTotals),JSON.stringify(paymentCounts),summary.openingCashCents,summary.cashRevenueCents,summary.cashExpenseCents,summary.withdrawalsCents,summary.expectedCashCents,counted,difference,closingWithdrawal,carryover,notes,CAIXA_V2_CFG.CASH_DECLARATION_VERSION,CAIXA_V2_CFG.CASH_DECLARATION,true,now,'PENDENTE','','','PENDENTE']);
  v2MarkEntriesClosed_(env,date,unitId,closureId);
  v2UpdateDailyBalanceClose_(env,date,unitId,summary,counted,difference,closingWithdrawal,carryover,user);
  v2EnqueueContaAzul_(env,closureId,v2EntriesByDate_(env,date,unitId));
  var pdf=v2GenerateClosingPdf_(env,closureId,context);
  v2UpdateClosurePdf_(env,closureId,pdf);
  return {ok:true,closure:v2FindClosure_(env,date,unitId),summary:v2BuildSummary_(env,date,unitId)};
}

function v2FindClosure_(env,date,unitId) {
  var x=v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES).filter(function(r){return String(r.date_iso)===date&&String(r.unit_id)===unitId;})[0];
  if(!x)return null;
  return {id:String(x.closure_id),date:String(x.date_iso),unitId:String(x.unit_id),unitName:String(x.unit_name),status:String(x.status),createdAt:v2Iso_(x.created_at),createdBy:String(x.created_by),createdByName:String(x.created_by_name),revenueCents:Number(x.revenue_cents||0),expenseCents:Number(x.expense_cents||0),netCents:Number(x.net_cents||0),openingCashCents:Number(x.opening_cash_cents||0),cashRevenueCents:Number(x.cash_revenue_cents||0),cashExpenseCents:Number(x.cash_expense_cents||0),withdrawalsBeforeCloseCents:Number(x.withdrawals_before_close_cents||0),expectedCashCents:Number(x.expected_cash_cents||0),countedCashCents:Number(x.counted_cash_cents||0),differenceCents:Number(x.difference_cents||0),closingWithdrawalCents:Number(x.closing_withdrawal_cents||0),carryoverCents:Number(x.carryover_cents||0),notes:String(x.notes||''),declarationConfirmed:v2Bool_(x.declaration_confirmed),pdfStatus:String(x.pdf_status||''),pdfUrl:String(x.pdf_url||''),contaAzulStatus:String(x.conta_azul_status||'')};
}

function v2MarkEntriesClosed_(env,date,unitId,closureId) {
  var last=env.entries.getLastRow(); if(last<2)return;
  var values=env.entries.getRange(2,1,last-1,CAIXA_V2_CFG.HEADERS.ENTRIES.length).getValues();
  values.forEach(function(row){ if(String(row[3])===date&&String(row[7])===unitId&&String(row[32])!=='EXCLUIDO') row[33]=closureId; });
  env.entries.getRange(2,1,values.length,values[0].length).setValues(values);
}

function v2UpdateDailyBalanceClose_(env,date,unitId,summary,counted,difference,closingWithdrawal,carryover,user) {
  var rows=v2ReadObjects_(env.dailyBalances,CAIXA_V2_CFG.HEADERS.DAILY_BALANCES),index=-1;
  rows.forEach(function(x,i){if(String(x.unit_id)===unitId&&String(x.date_iso)===date)index=i;});
  var row=[unitId,date,summary.openingCashCents,'FECHAMENTO',new Date(),user.id,summary.expectedCashCents,counted,difference,closingWithdrawal,carryover,'FECHADO'];
  if(index>=0) env.dailyBalances.getRange(index+2,1,1,row.length).setValues([row]); else env.dailyBalances.appendRow(row);
}

function v2AssertOpen_(env,date,unitId) { if(v2FindClosure_(env,date,unitId)) throw appError_('O caixa desta data já foi fechado.','DATE_CLOSED'); }

function v2SyncPix_(payload) {
  var env=v2Environment_(),last=env.entries.getLastRow(); if(last<2)throw appError_('Lançamento Pix não encontrado.','ENTRY_NOT_FOUND');
  var rows=env.entries.getRange(2,1,last-1,CAIXA_V2_CFG.HEADERS.ENTRIES.length).getValues(),index=-1;
  rows.forEach(function(row,i){if((payload.entryId&&String(row[0])===String(payload.entryId))||(payload.txid&&String(row[28])===String(payload.txid)))index=i;});
  if(index<0)throw appError_('Lançamento Pix não encontrado.','ENTRY_NOT_FOUND');
  var row=rows[index]; if(String(row[15])!=='PIX')throw appError_('O lançamento não é Pix.','NOT_PIX');
  var received=Math.round(Number(payload.amountCents||0)); if(String(payload.status).toUpperCase()==='CONFIRMADO'&&received>0&&received!==Number(row[14]))throw appError_('Valor Pix divergente.','PIX_AMOUNT_MISMATCH');
  row[27]=String(payload.status||'').toUpperCase(); if(payload.txid)row[28]=payload.txid;if(payload.e2eid)row[29]=payload.e2eid;if(payload.receivedAt)row[30]=payload.receivedAt;if(payload.provider)row[31]=payload.provider;
  env.entries.getRange(index+2,1,1,row.length).setValues([row]);
  var e=v2RowEntry_(row); return {ok:true,entry:e,summary:v2BuildSummary_(env,e.date,e.unitId)};
}

