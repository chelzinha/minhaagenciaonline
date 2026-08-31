function v2GenerateWithdrawalPdf_(env,withdrawalId,context) {
  var w=v2ReadObjects_(env.withdrawals,CAIXA_V2_CFG.HEADERS.WITHDRAWALS).filter(function(x){return String(x.withdrawal_id)===withdrawalId;})[0];
  if(!w)return {status:'ERRO',error:'Sangria não encontrada'};
  try{
    var folder=v2PdfFolder_(context.unit,'Sangrias',String(w.date_iso));
    var doc=DocumentApp.create('TEMP_SANGRIA_'+withdrawalId),body=doc.getBody();
    v2DocHeader_(body,'COMPROVANTE DE SANGRIA',String(context.unit.name||context.unit.unit_id),String(w.date_iso),String(w.operator_name),v2Iso_(w.created_at));
    body.appendTable([['Informação','Valor'],['Saldo antes',v2Money_(w.balance_before_cents)],['Valor da sangria',v2Money_(w.amount_cents)],['Saldo após',v2Money_(w.balance_after_cents)],['Destino',String(w.destination||'')],['Observação',String(w.notes||'')]]);
    body.appendParagraph('DECLARAÇÃO DE CONFERÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(String(w.declaration_text||CAIXA_V2_CFG.WITHDRAWAL_DECLARATION));
    body.appendParagraph('☑ Confirmação registrada no sistema');
    body.appendParagraph('Confirmado por: '+String(w.operator_name)+' | Usuário: '+String(w.operator_id)+' | Data/hora: '+v2Iso_(w.confirmed_at));
    doc.saveAndClose();
    var file=DriveApp.getFileById(doc.getId()),name=String(w.date_iso)+'_'+String(context.unit.unit_id)+'_Sangria_'+withdrawalId.slice(0,8)+'.pdf',pdf=folder.createFile(file.getAs(MimeType.PDF).setName(name));file.setTrashed(true);
    return {status:'GERADO',id:pdf.getId(),url:pdf.getUrl()};
  }catch(error){return {status:'ERRO',error:String(error.message||error)};}
}

function v2GenerateClosingPdf_(env,closureId,context) {
  var c=v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES).filter(function(x){return String(x.closure_id)===closureId;})[0];
  if(!c)return {status:'ERRO',error:'Fechamento não encontrado'};
  try{
    var date=String(c.date_iso),unitId=String(c.unit_id),folder=v2PdfFolder_(context.unit,'Fechamentos',date),entries=v2EntriesByDate_(env,date,unitId),withdrawals=v2WithdrawalsByDate_(env,date,unitId);
    var doc=DocumentApp.create('TEMP_FECHAMENTO_'+closureId),body=doc.getBody();
    v2DocHeader_(body,'FECHAMENTO DIÁRIO DE CAIXA',String(c.unit_name),date,String(c.created_by_name),v2Iso_(c.created_at));
    body.appendParagraph('Centro de custo: '+String(c.cost_center_ca_name_snapshot||'Não parametrizado'));
    body.appendParagraph('POSIÇÃO DO DINHEIRO').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendTable([['Informação','Valor'],['Saldo inicial',v2Money_(c.opening_cash_cents)],['Receitas em dinheiro',v2Money_(c.cash_revenue_cents)],['Despesas em dinheiro',v2Money_(c.cash_expense_cents)],['Sangrias anteriores',v2Money_(c.withdrawals_before_close_cents)],['Saldo esperado',v2Money_(c.expected_cash_cents)],['Saldo contado',v2Money_(c.counted_cash_cents)],['Diferença',v2Money_(c.difference_cents)],['Sangria do fechamento',v2Money_(c.closing_withdrawal_cents)],['Saldo remanescente',v2Money_(c.carryover_cents)]]);
    body.appendParagraph('RESUMO FINANCEIRO').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendTable([['Movimento','Quantidade','Total'],['Receitas',String(entries.filter(function(e){return e.type==='RECEITA';}).length),v2Money_(c.revenue_cents)],['Despesas',String(entries.filter(function(e){return e.type==='DESPESA';}).length),v2Money_(c.expense_cents)],['Resultado líquido','',v2Money_(c.net_cents)]]);
    body.appendParagraph('RECEITAS POR MEIO DE PAGAMENTO').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var paymentTotals={};var paymentCounts={};try{paymentTotals=JSON.parse(String(c.payment_totals_json||'{}'));}catch(ignore){}try{paymentCounts=JSON.parse(String(c.payment_counts_json||'{}'));}catch(ignore){}
    var paymentTable=[['Meio','Quantidade','Total']];[['DINHEIRO','Dinheiro'],['PIX','Pix'],['DEBITO','Débito'],['CREDITO','Crédito']].forEach(function(pair){paymentTable.push([pair[1],String(paymentCounts[pair[0]]||0),v2Money_(paymentTotals[pair[0]]||0)]);});paymentTable.push(['Total',String(entries.filter(function(e){return e.type==='RECEITA';}).length),v2Money_(c.revenue_cents)]);body.appendTable(paymentTable);
    var groups=['DINHEIRO','PIX','DEBITO','CREDITO'];
    groups.forEach(function(payment){var list=entries.filter(function(e){return e.type==='RECEITA'&&e.paymentId===payment;});if(!list.length)return;body.appendParagraph(payment).setHeading(DocumentApp.ParagraphHeading.HEADING2);var table=[['Hora','Cliente/Origem','Modo','Objetos','Valor']];list.forEach(function(e){table.push([v2Time_(e.createdAt),e.clientName||'Sem cliente',e.mode,String(e.objectCount||''),v2Money_(e.amountCents)]);});body.appendTable(table);});
    var expenseList=entries.filter(function(e){return e.type==='DESPESA';});if(expenseList.length){body.appendParagraph('DESPESAS').setHeading(DocumentApp.ParagraphHeading.HEADING2);var et=[['Hora','Categoria','Descrição','Pagamento','Valor']];expenseList.forEach(function(e){et.push([v2Time_(e.createdAt),e.categoryContaAzulName||e.categoryId,e.description,e.paymentName,v2Money_(e.amountCents)]);});body.appendTable(et);}
    if(withdrawals.length){body.appendParagraph('SANGRIAS').setHeading(DocumentApp.ParagraphHeading.HEADING2);var wt=[['Hora','Destino','Responsável','Valor']];withdrawals.forEach(function(w){wt.push([v2Time_(w.createdAt),w.destination,w.operatorName,v2Money_(w.amountCents)]);});body.appendTable(wt);}
    body.appendParagraph('DECLARAÇÃO DE CONFERÊNCIA').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph(String(c.declaration_text||CAIXA_V2_CFG.CASH_DECLARATION));body.appendParagraph('☑ Confirmação registrada no sistema');body.appendParagraph('Confirmado por: '+String(c.created_by_name)+' | Usuário: '+String(c.created_by)+' | Data/hora: '+v2Iso_(c.declaration_confirmed_at));
    if(Number(c.difference_cents)!==0){body.appendParagraph('DIFERENÇA IDENTIFICADA: '+v2Money_(c.difference_cents)).editAsText().setBold(true);body.appendParagraph('Justificativa: '+String(c.notes||''));}
    doc.saveAndClose();var file=DriveApp.getFileById(doc.getId()),name=date+'_'+unitId+'_Fechamento_Caixa.pdf',pdf=folder.createFile(file.getAs(MimeType.PDF).setName(name));file.setTrashed(true);return {status:'GERADO',id:pdf.getId(),url:pdf.getUrl()};
  }catch(error){return {status:'ERRO',error:String(error.message||error)};}
}

function v2PdfFolder_(unit,kind,date) {
  var rootId=String(unit.drive_root_folder_id||'').trim();if(!rootId)throw new Error('Configure drive_root_folder_id na Biblioteca_Unidades.');
  var root=DriveApp.getFolderById(rootId),year=date.slice(0,4),month=date.slice(5,7)+' - '+v2MonthName_(Number(date.slice(5,7)));
  return v2ChildFolder_(v2ChildFolder_(v2ChildFolder_(v2ChildFolder_(root,kind),year),month),String(unit.unit_id));
}

function v2ChildFolder_(parent,name){var it=parent.getFoldersByName(name);return it.hasNext()?it.next():parent.createFolder(name);}
function v2MonthName_(m){return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][m-1]||String(m);}
function v2DocHeader_(body,title,unit,date,operator,timestamp){body.appendParagraph('AGF JOSÉ BONIFÁCIO').setHeading(DocumentApp.ParagraphHeading.TITLE);body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);body.appendParagraph('Unidade: '+unit+'\nData: '+v2BrDate_(date)+'\nResponsável: '+operator+'\nRegistro: '+timestamp);}

function v2UpdateWithdrawalPdf_(env,id,pdf){var rows=v2ReadObjects_(env.withdrawals,CAIXA_V2_CFG.HEADERS.WITHDRAWALS);for(var i=0;i<rows.length;i++)if(String(rows[i].withdrawal_id)===id){env.withdrawals.getRange(i+2,17,1,3).setValues([[pdf.status,pdf.id||'',pdf.url||'']]);break;}}
function v2UpdateClosurePdf_(env,id,pdf){var rows=v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES);for(var i=0;i<rows.length;i++)if(String(rows[i].closure_id)===id){env.closures.getRange(i+2,30,1,3).setValues([[pdf.status,pdf.id||'',pdf.url||'']]);break;}}

function retryPendingPdfsV2(){var env=v2Environment_(),units=v2ReadObjects_(env.units,CAIXA_V2_CFG.HEADERS.UNITS),count=0;v2ReadObjects_(env.withdrawals,CAIXA_V2_CFG.HEADERS.WITHDRAWALS).forEach(function(w){if(String(w.pdf_status)==='GERADO')return;var unit=units.filter(function(u){return String(u.unit_id)===String(w.unit_id);})[0];if(!unit)return;var pdf=v2GenerateWithdrawalPdf_(env,String(w.withdrawal_id),{unit:unit});v2UpdateWithdrawalPdf_(env,String(w.withdrawal_id),pdf);count++;});v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES).forEach(function(c){if(String(c.pdf_status)==='GERADO')return;var unit=units.filter(function(u){return String(u.unit_id)===String(c.unit_id);})[0];if(!unit)return;var pdf=v2GenerateClosingPdf_(env,String(c.closure_id),{unit:unit});v2UpdateClosurePdf_(env,String(c.closure_id),pdf);count++;});return {ok:true,processed:count};}

function v2Money_(cents){return 'R$ '+(Number(cents||0)/100).toFixed(2).replace('.',',');}
function v2Today_(){return Utilities.formatDate(new Date(),CAIXA_V2_CFG.TIMEZONE,'yyyy-MM-dd');}
function v2Date_(value){var s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw appError_('Data inválida.','INVALID_DATE');return s;}
function v2BrDate_(iso){var p=String(iso).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:iso;}
function v2Time_(value){try{return Utilities.formatDate(new Date(value),CAIXA_V2_CFG.TIMEZONE,'HH:mm');}catch(e){return '';}}
function v2Iso_(value){if(!value)return '';if(Object.prototype.toString.call(value)==='[object Date]')return value.toISOString();return String(value);}
function v2Normalize_(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
