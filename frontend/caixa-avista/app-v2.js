'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const STORAGE = {
    API: 'caixa_avista_v2_api_url',
    LOCAL: 'caixa_avista_v2_local_data'
  };
  const state = {
    type: 'RECEITA', mode: 'ATENDIMENTO', amountCents: 0, batchAmountCents: 0,
    objectCount: 1, selectedCategory: '', selectedPayment: '', selectedClient: null,
    batchItems: [], library: null, clients: [], entries: [], withdrawals: [], summary: null,
    closure: null, user: null, busy: false, pixEntry: null
  };

  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const todayIso = () => { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  const brDate = iso => { const p=String(iso||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso; };
  const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const parseMoney = value => { const t=String(value||'').replace(/R\$/gi,'').replace(/\s/g,''); if(!t)return 0; let n=t; if(t.includes(',')&&t.includes('.'))n=t.replace(/\./g,'').replace(',','.'); else if(t.includes(','))n=t.replace(',','.'); const x=Number(n.replace(/[^\d.-]/g,'')); return Number.isFinite(x)?Math.round(Math.abs(x)*100):0; };
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const apiUrl = () => localStorage.getItem(STORAGE.API) || '';
  const token = () => window.AgfAuth?.getToken?.() || '';

  const isPixPayment = payment =>
    payment?.contaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO';

  const isPixEntry = entry =>
    entry?.paymentContaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO' ||
    /^PIX(?:_|$)/.test(String(entry?.paymentId || ''));


  function mockLibrary(){
    return {
      unit:{id:'PADRAO',name:'Unidade padrão',costCenterName:'Não parametrizado'},permissions:{revenue:true,expense:true,close:true,withdraw:true},
      accounts:[{id:'CAIXA',name:'Caixa'},{id:'BANCO_PIX',name:'Banco Pix'},{id:'CARTAO',name:'Cartões'}],
      payments:[
        {id:'DINHEIRO',name:'Dinheiro',contaAzulMethod:'DINHEIRO',accountId:'CAIXA',allowRevenue:true,allowExpense:true,allowBatch:true,generatePix:false,icon:'payments',color:'#1677ff'},
        {id:'PIX',name:'Pix',contaAzulMethod:'PIX_PAGAMENTO_INSTANTANEO',accountId:'BANCO_PIX',allowRevenue:true,allowExpense:true,allowBatch:true,generatePix:true,icon:'qr_code_2',color:'#00a99d'},
        {id:'DEBITO',name:'Débito',contaAzulMethod:'CARTAO_DEBITO',accountId:'CARTAO',allowRevenue:true,allowExpense:true,allowBatch:true,generatePix:false,icon:'credit_card',color:'#3b82f6'},
        {id:'CREDITO',name:'Crédito',contaAzulMethod:'CARTAO_CREDITO',accountId:'CARTAO',allowRevenue:true,allowExpense:true,allowBatch:true,generatePix:false,icon:'credit_card',color:'#7657e8'}
      ],
      revenueTypes:[{id:'ATENDIMENTO_BALCAO',name:'Balcão',descriptionDefault:'Atendimento de balcão',allowAttendance:true,allowSingle:true,allowBatch:true,requireClient:false,requireDescription:false,icon:'point_of_sale',color:'#1677ff'}],
      expenseTypes:[
        {id:'COPA',name:'Copa',descriptionDefault:'Despesa de copa',defaultPaymentId:'DINHEIRO',defaultAccountId:'CAIXA',allowBatch:true,requireDescription:false,icon:'coffee',color:'#ef4444'},
        {id:'ESCRITORIO',name:'Escritório',descriptionDefault:'Material de escritório',defaultPaymentId:'DINHEIRO',defaultAccountId:'CAIXA',allowBatch:true,requireDescription:false,icon:'edit_note',color:'#ef4444'},
        {id:'TRANSPORTE',name:'Transporte',descriptionDefault:'Despesa de transporte',defaultPaymentId:'DINHEIRO',defaultAccountId:'CAIXA',allowBatch:true,requireDescription:true,icon:'local_shipping',color:'#ef4444'},
        {id:'OUTROS',name:'Outros',descriptionDefault:'',defaultPaymentId:'DINHEIRO',defaultAccountId:'CAIXA',allowBatch:true,requireDescription:true,icon:'more_horiz',color:'#ef4444'}
      ]
    };
  }

  function loadLocal(){
    try { return JSON.parse(localStorage.getItem(STORAGE.LOCAL)||'{}'); } catch(_) { return {}; }
  }
  function saveLocal(data){ localStorage.setItem(STORAGE.LOCAL,JSON.stringify(data)); }
  function localInit(){
    const db=loadLocal(); const entries=db.entries||[],withdrawals=db.withdrawals||[],date=todayIso();
    return {ok:true,user:{id:'local',name:'Homologação local',role:'admin'},library:mockLibrary(),clients:db.clients||[{id:'cliente-balcao',name:'Cliente de Balcão'}],entries:entries.filter(e=>e.date===date),withdrawals:withdrawals.filter(w=>w.date===date),summary:localSummary(entries,withdrawals,date),closure:(db.closures||[]).find(c=>c.date===date)||null};
  }
  function localSummary(entries,withdrawals,date){
    const s={date,unitId:'PADRAO',revenueCents:0,expenseCents:0,netCents:0,revenueCount:0,expenseCount:0,byPayment:{},countByPayment:{},cashRevenueCents:0,cashExpenseCents:0,pixPendingCents:0,pixConfirmedCents:0,withdrawalsCents:0,openingCashCents:0,expectedCashCents:0};
    entries.filter(e=>e.date===date&&e.status!=='EXCLUIDO').forEach(e=>{ if(e.type==='DESPESA'){s.expenseCents+=e.amountCents;s.expenseCount++;if(e.paymentId==='DINHEIRO')s.cashExpenseCents+=e.amountCents;} else {if(isPixEntry(e)&&['ATIVA','PENDENTE','CRIANDO'].includes(e.pixStatus)){s.pixPendingCents+=e.amountCents;return;}s.revenueCents+=e.amountCents;s.revenueCount++;s.byPayment[e.paymentId]=(s.byPayment[e.paymentId]||0)+e.amountCents;s.countByPayment[e.paymentId]=(s.countByPayment[e.paymentId]||0)+1;if(e.paymentId==='DINHEIRO')s.cashRevenueCents+=e.amountCents;if(isPixEntry(e))s.pixConfirmedCents+=e.amountCents;}});
    withdrawals.filter(w=>w.date===date).forEach(w=>s.withdrawalsCents+=w.amountCents);s.netCents=s.revenueCents-s.expenseCents;s.expectedCashCents=s.openingCashCents+s.cashRevenueCents-s.cashExpenseCents-s.withdrawalsCents;return s;
  }

  async function callApi(action,data={}){
    if(!apiUrl()) return localApi(action,data);
    const response=await fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,st:token(),...data})});
    if(!response.ok)throw new Error('Falha de comunicação com o caixa.');
    const result=await response.json();if(!result?.ok)throw new Error(result?.error||'Operação não concluída.');return result;
  }

  async function localApi(action,data){
    const db=loadLocal();db.entries=db.entries||[];db.withdrawals=db.withdrawals||[];db.clients=db.clients||[{id:'cliente-balcao',name:'Cliente de Balcão'}];db.closures=db.closures||[];
    if(action==='init'||action==='summary')return localInit();
    if(action==='saveClient'){const client={id:uid(),name:data.name};db.clients.push(client);saveLocal(db);return {ok:true,client};}
    if(action==='saveEntry'){const e=localEntry(data.payload);db.entries.push(e);saveLocal(db);return {ok:true,entry:e,summary:localSummary(db.entries,db.withdrawals,todayIso())};}
    if(action==='saveBatch'){const batchId=uid(),items=data.payloads.map((p,i)=>localEntry({...p,batchId,batchIndex:i+1}));db.entries.push(...items);saveLocal(db);return {ok:true,entries:items,batchId,summary:localSummary(db.entries,db.withdrawals,todayIso())};}
    if(action==='syncPixPayment'){const e=db.entries.find(x=>x.id===data.payload.entryId||x.pixTxid===data.payload.txid);if(e){e.pixStatus=data.payload.status||data.payload.pixStatus;e.pixTxid=data.payload.txid||e.pixTxid;e.pixProvider=data.payload.provider||e.pixProvider;}saveLocal(db);return {ok:true,entry:e,summary:localSummary(db.entries,db.withdrawals,todayIso())};}
    if(action==='createWithdrawal'){const s=localSummary(db.entries,db.withdrawals,todayIso()),w={id:uid(),date:todayIso(),createdAt:new Date().toISOString(),operatorName:'Homologação local',amountCents:data.payload.amountCents,destination:data.payload.destination,notes:data.payload.notes,balanceBeforeCents:s.expectedCashCents,balanceAfterCents:s.expectedCashCents-data.payload.amountCents,confirmed:true,pdfStatus:'SIMULADO',pdfUrl:''};db.withdrawals.push(w);saveLocal(db);return {ok:true,withdrawal:w,summary:localSummary(db.entries,db.withdrawals,todayIso())};}
    if(action==='closeCash'){const s=localSummary(db.entries,db.withdrawals,todayIso()),c={id:uid(),date:todayIso(),unitId:'PADRAO',unitName:'Unidade padrão',status:'FECHADO',createdAt:new Date().toISOString(),createdByName:'Homologação local',revenueCents:s.revenueCents,expenseCents:s.expenseCents,netCents:s.netCents,openingCashCents:s.openingCashCents,cashRevenueCents:s.cashRevenueCents,cashExpenseCents:s.cashExpenseCents,withdrawalsBeforeCloseCents:s.withdrawalsCents,expectedCashCents:s.expectedCashCents,countedCashCents:data.payload.countedCashCents,differenceCents:data.payload.countedCashCents-s.expectedCashCents,closingWithdrawalCents:data.payload.closingWithdrawalCents||0,carryoverCents:data.payload.countedCashCents-(data.payload.closingWithdrawalCents||0),declarationConfirmed:true,pdfStatus:'SIMULADO',pdfUrl:'',contaAzulStatus:'PENDENTE'};db.closures.push(c);saveLocal(db);return {ok:true,closure:c,summary:s};}
    throw new Error('Ação local não implementada.');
  }

  function localEntry(p){
    return {id:p.entryId||uid(),batchId:p.batchId||'',batchIndex:p.batchIndex||1,date:p.date||todayIso(),createdAt:new Date().toISOString(),type:p.type,mode:p.mode,unitId:'PADRAO',operatorId:'local',operatorName:'Homologação local',clientId:p.clientId||'',clientName:p.clientName||'',clientSource:p.clientName?'INFORMADO':'SEM_CLIENTE',objectCount:p.objectCount||0,amountCents:p.amountCents,paymentId:p.paymentId,paymentName:state.library.payments.find(x=>x.id===p.paymentId)?.name||p.paymentId,paymentContaAzulMethod:state.library.payments.find(x=>x.id===p.paymentId)?.contaAzulMethod||'',categoryId:p.categoryId,description:p.description||'',pixStatus:p.pixStatus||'',pixTxid:p.pixTxid||'',pixProvider:p.pixProvider||'',status:'ATIVO',contaAzulStatus:'NAO_ENVIADO'};
  }

  function setBusy(value,text='Carregando...'){state.busy=value;$('loadingOverlay').classList.toggle('hidden',!value);$('loadingText').textContent=text;}
  function status(id,message,type='info'){const el=$(id);el.textContent=message;el.className=`status-box show ${type}`;}
  function clearStatus(id){const el=$(id);el.textContent='';el.className='status-box';}

  async function refresh(){
    setBusy(true,'Atualizando caixa...');
    try{
      const result=await callApi('init',{date:todayIso()});
      state.user=result.user;state.library=result.library;state.clients=result.clients||[];state.entries=result.entries||[];state.withdrawals=result.withdrawals||[];state.summary=result.summary;state.closure=result.closure||null;
      chooseDefaults();renderAll();
    }catch(error){status('launchStatus',error.message,'error');}
    finally{setBusy(false);}
  }

  function chooseDefaults(){
    const cats=categories();if(!cats.some(x=>x.id===state.selectedCategory))state.selectedCategory=cats[0]?.id||'';
    const pays=payments();if(!pays.some(x=>x.id===state.selectedPayment))state.selectedPayment=(state.type==='DESPESA'&&selectedCategory()?.defaultPaymentId)||pays[0]?.id||'';
  }
  function categories(){return state.type==='RECEITA'?(state.library?.revenueTypes||[]):(state.library?.expenseTypes||[]);}
  function payments(){return (state.library?.payments||[]).filter(p=>state.type==='RECEITA'?p.allowRevenue:p.allowExpense);}
  function selectedCategory(){return categories().find(x=>x.id===state.selectedCategory);}
  function selectedPayment(){return payments().find(x=>x.id===state.selectedPayment);}
  function selectedAccountId(){return selectedCategory()?.defaultAccountId||selectedPayment()?.accountId||'';}

  function findExactClientByName(value) {
    const wanted = normalize(value);

    if (!wanted) {
      return null;
    }

    return state.clients.find(client =>
      normalize(client.name) === wanted
    ) || null;
  }

  function resolveAttendanceClient() {
    if (
      state.type !== 'RECEITA' ||
      state.mode !== 'ATENDIMENTO'
    ) {
      return null;
    }

    const input = $('clientInput');

    const typedName = String(
      input?.value || ''
    ).trim();

    const selectedStillMatches = Boolean(
      state.selectedClient &&
      normalize(state.selectedClient.name) ===
        normalize(typedName)
    );

    if (selectedStillMatches) {
      return state.selectedClient;
    }

    const exactClient =
      findExactClientByName(typedName);

    if (exactClient) {
      state.selectedClient = exactClient;

      if (input) {
        input.value = exactClient.name;
      }

      renderEntryForm();

      return exactClient;
    }

    state.selectedClient = null;
    renderEntryForm();

    return null;
  }

  function renderAll(){
    document.body.dataset.entryType=state.type;
    $('unitLabel').textContent=state.library?.unit?.name||'Unidade';$('operatorLabel').textContent=state.user?.name||'Usuário';$('dateLabel').textContent=brDate(todayIso());
    renderType();renderModes();renderOptions();renderEntryForm();renderSummary();renderMovements();renderClose();
  }

  function renderType(){document.querySelectorAll('[data-entry-type]').forEach(b=>b.classList.toggle('active',b.dataset.entryType===state.type));}
  function availableModes(){
    return state.type === 'RECEITA'
      ? [
          {
            id:'ATENDIMENTO',
            icon:'point_of_sale',
            label:'Atender'
          },
          {
            id:'AVULSO',
            icon:'add_card',
            label:'Avulso'
          },
          {
            id:'LOTE',
            icon:'playlist_add',
            label:'Em lote'
          }
        ]
      : [
          {
            id:'INDIVIDUAL',
            icon:'remove_circle',
            label:'Individual'
          },
          {
            id:'LOTE',
            icon:'playlist_add',
            label:'Em lote'
          }
        ];
  }

  function renderModes(){
    const modes = availableModes();

    if(
      !modes.some(mode => mode.id === state.mode)
    ){
      state.mode =
        state.type === 'RECEITA'
          ? 'ATENDIMENTO'
          : 'INDIVIDUAL';
    }

    const container = $('modeSwitch');

    if(!container){
      return;
    }

    container.style.gridTemplateColumns =
      `repeat(${modes.length},1fr)`;

    container.innerHTML = modes.map(mode => `
      <button
        type="button"
        class="mode-btn ${
          state.mode === mode.id
            ? 'active'
            : ''
        }"
        data-mode="${mode.id}"
        aria-pressed="${
          state.mode === mode.id
            ? 'true'
            : 'false'
        }"
      >
        <span class="material-symbols-rounded">
          ${mode.icon}
        </span>

        <span>
          ${mode.label}
        </span>
      </button>
    `).join('');

    container
      .querySelectorAll('[data-mode]')
      .forEach(button => {
        button.disabled = false;

        button.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            if(state.busy){
              return;
            }

            const nextMode =
              String(
                button.dataset.mode || ''
              ).trim();

            if(
              !nextMode ||
              nextMode === state.mode
            ){
              return;
            }

            changeMode(nextMode);
          }
        );
      });
  }
  function renderOptions(){
    const isRevenue =
      state.type === 'RECEITA';

    const categorySection =
      $('categoryOptions')
        ?.closest('.option-section');

    if(categorySection){
      categorySection.classList.toggle(
        'hidden',
        isRevenue
      );
    }

    $('categoryLabel').textContent =
      'Tipo de despesa';

    $('categoryOptions').innerHTML =
      isRevenue
        ? ''
        : categories().map(x =>
            `<button
              class="option-btn ${
                state.selectedCategory === x.id
                  ? 'active'
                  : ''
              }"
              data-category="${x.id}"
              style="--option-color:${
                x.color || '#ef4444'
              }"
            >
              <span
                class="material-symbols-rounded"
              >
                ${x.icon || 'category'}
              </span>

              <span>
                ${escapeHtml(x.name)}
              </span>
            </button>`
          ).join('');

    $('paymentOptions').innerHTML =
      payments().map(x =>
        `<button
          class="option-btn ${
            state.selectedPayment === x.id
              ? 'active'
              : ''
          }"
          data-payment="${x.id}"
          style="--option-color:${
            x.color || '#1677ff'
          }"
        >
          <span
            class="material-symbols-rounded"
          >
            ${x.icon || 'payments'}
          </span>

          <span>
            ${escapeHtml(x.name)}
          </span>
        </button>`
      ).join('');
  }

  function renderEntryForm(){
    const batch=state.mode==='LOTE',attendance=state.mode==='ATENDIMENTO',revenue=state.type==='RECEITA';
    const minorGrid = document.querySelector('#singleFields .minor-grid');
    if(minorGrid){
      minorGrid.classList.toggle('expense-layout',!revenue);
    }
    $('singleFields').classList.toggle('hidden',batch);$('batchFields').classList.toggle('hidden',!batch);$('clientSection').classList.toggle('hidden',!attendance||!revenue);$('objectSection').classList.toggle('hidden',!revenue);
    $('amountDisplay').textContent=money(state.amountCents);$('batchAmountDisplay').textContent=money(state.batchAmountCents);$('objectCount').textContent=String(state.objectCount);
    $('clientChip').classList.toggle('hidden',!state.selectedClient);$('clientChip').innerHTML=state.selectedClient?`<span class="material-symbols-rounded">check_circle</span>${escapeHtml(state.selectedClient.name)}`:'';
    $('batchCount').textContent=String(state.batchItems.length);$('batchTotal').textContent=money(state.batchItems.reduce((a,b)=>a+b.amountCents,0));
    $('batchItems').innerHTML=state.batchItems.map((item,index)=>`<div class="batch-item"><div><small>${index+1}</small><strong>${money(item.amountCents)}</strong></div><button data-remove-batch="${index}"><span class="material-symbols-rounded">delete</span></button></div>`).join('');
    $('btnSaveSingle').querySelector('span:last-child').textContent=state.type==='RECEITA'?(selectedPayment()?.generatePix&&attendance?'Gerar Pix':'Registrar'):'Salvar despesa';
  }
  function renderSummary(){
    const s=state.summary||{};$('cashOpening').textContent=money(s.openingCashCents);$('cashExpected').textContent=money(state.closure?state.closure.carryoverCents:s.expectedCashCents);$('cashWithdrawals').textContent=money(s.withdrawalsCents);
    $('summaryRevenue').textContent=money(s.revenueCents);$('summaryExpense').textContent=money(s.expenseCents);$('summaryNet').textContent=money(s.netCents);
    $('paymentSummary').innerHTML=(state.library?.payments||[]).map(p=>`<div class="payment-chip"><small>${escapeHtml(p.name)}</small><strong>${money(s.byPayment?.[p.id]||0)}</strong></div>`).join('');
  }
  function renderMovements(){
    const movements=[
      ...state.entries.map(e=>({kind:'ENTRY',createdAt:e.createdAt,data:e})),
      ...state.withdrawals.map(w=>({kind:'WITHDRAWAL',createdAt:w.createdAt,data:w}))
    ].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    $('movementList').innerHTML=movements.length?movements.map(item=>{
      if(item.kind==='WITHDRAWAL'){
        const w=item.data;
        return `<article class="movement-item withdrawal"><div><h4>Sangria · ${escapeHtml(w.destination||'Financeiro')}</h4><p>${escapeHtml(w.operatorName||'')} ${w.pdfUrl?`· <a href="${escapeHtml(w.pdfUrl)}" target="_blank">PDF</a>`:''}</p></div><strong>- ${money(w.amountCents)}</strong></article>`;
      }
      const e=item.data;
      return `<article class="movement-item ${e.type==='DESPESA'?'expense':''}"><div><h4>${escapeHtml(e.type==='DESPESA'?(e.description||e.categoryId):(e.clientName||'Sem cliente'))}</h4><p>${escapeHtml(e.paymentName||e.paymentId)} · ${escapeHtml(e.mode)}${e.batchId?' · Lote':''}${e.pixStatus?' · '+escapeHtml(e.pixStatus):''}</p></div><strong>${e.type==='DESPESA'?'- ':''}${money(e.amountCents)}</strong></article>`;
    }).join(''):'<div class="movement-item"><div><h4>Sem movimentos</h4></div></div>';
  }
  function renderClose(){
    const s=state.summary||{};$('closeOpening').textContent=money(s.openingCashCents);$('closeCashRevenue').textContent=money(s.cashRevenueCents);$('closeCashExpense').textContent=money(s.cashExpenseCents);$('closeWithdrawals').textContent=money(s.withdrawalsCents);$('closeExpected').textContent=money(s.expectedCashCents);
    $('closeState').textContent=state.closure?'Fechado':'Aberto';$('btnCloseCash').disabled=!!state.closure;
    updateCloseMath();
    if(state.closure){const links=[];if(state.closure.pdfUrl)links.push(`<a href="${escapeHtml(state.closure.pdfUrl)}" target="_blank"><span class="material-symbols-rounded">picture_as_pdf</span> PDF do fechamento</a>`);$('closeLinks').classList.toggle('hidden',!links.length);$('closeLinks').innerHTML=links.join('');}
  }
  function updateCloseMath(){const counted=parseMoney($('countedCash').value),withdraw=parseMoney($('closingWithdrawal').value),expected=state.summary?.expectedCashCents||0;$('closeDifference').textContent=money(counted-expected);$('closeCarryover').textContent=money(Math.max(0,counted-withdraw));}

  function changeType(type){state.type=type;state.mode=type==='RECEITA'?'ATENDIMENTO':'INDIVIDUAL';state.selectedCategory='';state.selectedPayment='';state.amountCents=0;state.batchAmountCents=0;state.batchItems=[];state.selectedClient=null;chooseDefaults();renderAll();clearStatus('launchStatus');}
  function changeMode(mode){state.mode=mode;state.amountCents=0;state.batchAmountCents=0;state.batchItems=[];state.selectedClient=null;renderAll();}
  function handleKey(target,key){const prop=target==='batch'?'batchAmountCents':'amountCents';if(/^\d$/.test(key))state[prop]=Math.min(999999999,state[prop]*10+Number(key));else if(key==='backspace')state[prop]=Math.floor(state[prop]/10);else state[prop]=0;renderEntryForm();}

  function draft(amountCents,extra={}){
    const category = selectedCategory();
    const payment = selectedPayment();

    const client =
      state.mode === 'ATENDIMENTO'
        ? resolveAttendanceClient()
        : null;

    return {
      entryId: extra.entryId || '',
      type: state.type,
      mode: state.mode,
      date: todayIso(),
      categoryId: category?.id || '',
      paymentId: payment?.id || '',
      accountId: selectedAccountId(),
      clientId: client?.id || '',
      clientName: client?.name || '',
      objectCount:
        state.type === 'RECEITA'
          ? state.objectCount
          : 0,
      amountCents,
      description:
        $('descriptionInput').value.trim(),
      pixStatus: extra.pixStatus || '',
      pixTxid: extra.pixTxid || '',
      pixProvider: extra.pixProvider || ''
    };
  }

  async function saveSingle(){
    clearStatus('launchStatus');if(!(state.amountCents>0))return status('launchStatus','Digite o valor.','warning');if(!selectedCategory()||!selectedPayment())return status('launchStatus','Selecione tipo e pagamento.','warning');if(
      state.type === 'RECEITA' &&
      state.mode === 'ATENDIMENTO' &&
      !resolveAttendanceClient()
    ){
      return status(
        'launchStatus',
        'Selecione ou cadastre o cliente.',
        'warning'
      );
    }
    const isLivePix=state.type==='RECEITA'&&state.mode==='ATENDIMENTO'&&selectedPayment().generatePix;
    setBusy(true,isLivePix?'Criando cobrança Pix...':'Salvando...');
    try{
      if(isLivePix){await startPix();return;}
      const result=await callApi('saveEntry',{payload:draft(state.amountCents,{pixStatus:isPixPayment(selectedPayment())?'CONFIRMADO':'',pixProvider:isPixPayment(selectedPayment())?'manual-single':''})});applySaveResult(result);status('launchStatus',state.type==='RECEITA'?'Receita registrada.':'Despesa registrada.','success');resetEntry();
    }catch(error){status('launchStatus',error.message,'error');}finally{setBusy(false);}
  }

  async function startPix(){
    const entryId=uid();
    const saved=await callApi('saveEntry',{payload:draft(state.amountCents,{entryId,pixStatus:'CRIANDO',pixProvider:'santander'})});applySaveResult(saved);state.pixEntry=saved.entry;
    try{
      const response=await fetch('/api/santander/pix/create',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token()},body:JSON.stringify({entryId,amountCents:state.amountCents,clientName:resolveAttendanceClient()?.name||'',objectCount:state.objectCount,description:$('descriptionInput').value.trim()||'Atendimento de balcão'})});
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Santander indisponível.');
      const charge=data.charge;await callApi('syncPixPayment',{payload:{entryId,txid:charge.txid,status:charge.status||'ATIVA',provider:'santander'}});state.pixEntry.pixTxid=charge.txid;state.pixEntry.pixStatus=charge.status||'ATIVA';$('pixAmount').textContent=money(state.amountCents);$('pixCode').value=charge.copyPaste||'';renderQr(charge.copyPaste||'');openModal('pixModal');
    }catch(error){$('pixAmount').textContent=money(state.amountCents);$('pixCode').value='';$('pixQr').innerHTML='<span class="material-symbols-rounded" style="font-size:80px;color:#d6e2ef">qr_code_2</span>';openModal('pixModal');status('pixStatus',error.message+' O lançamento ficou pendente e pode ser confirmado manualmente.','warning');}
  }
  function renderQr(code){$('pixQr').innerHTML='';if(code&&window.QRCode)new QRCode($('pixQr'),{text:code,width:270,height:270,correctLevel:QRCode.CorrectLevel.M});}
  async function confirmManualPix(){if(!state.pixEntry)return;setBusy(true,'Confirmando Pix...');try{const result=await callApi('syncPixPayment',{payload:{entryId:state.pixEntry.id,txid:state.pixEntry.pixTxid||'',status:'CONFIRMADO',amountCents:state.pixEntry.amountCents,provider:state.pixEntry.pixProvider||'manual'}});state.summary=result.summary;closeModal('pixModal');resetEntry();await refresh();status('launchStatus','Pix confirmado.','success');}catch(error){status('pixStatus',error.message,'error');}finally{setBusy(false);}}

  function addBatchItem(){
    clearStatus('launchStatus');

    if(!(state.batchAmountCents > 0)){
      status(
        'launchStatus',
        'Digite um valor para adicionar.',
        'warning'
      );

      return;
    }

    const amountCents =
      state.batchAmountCents;

    /*
     * Preserva explicitamente o modo de lote.
     */
    state.mode = 'LOTE';

    state.batchItems.push({
      amountCents
    });

    state.batchAmountCents = 0;

    renderModes();
    renderEntryForm();

    clearStatus('launchStatus');
  }

  async function saveBatch(){if(!state.batchItems.length)return status('launchStatus','Adicione pelo menos um valor.','warning');if(!selectedCategory()||!selectedPayment())return status('launchStatus','Selecione tipo e pagamento.','warning');setBusy(true,'Salvando lote...');try{const payloads=state.batchItems.map(item=>draft(item.amountCents,{pixStatus:isPixPayment(selectedPayment())?'CONFIRMADO':'',pixProvider:isPixPayment(selectedPayment())?'manual-batch':''}));const result=await callApi('saveBatch',{payloads});state.entries.push(...(result.entries||[]));state.summary=result.summary;state.batchItems=[];state.batchAmountCents=0;renderAll();status('launchStatus',`${result.entries?.length||payloads.length} lançamentos salvos.`, 'success');}catch(error){status('launchStatus',error.message,'error');}finally{setBusy(false);}}

  function applySaveResult(result){if(result.entry)state.entries.push(result.entry);state.summary=result.summary||state.summary;renderAll();}
  function resetEntry(){state.amountCents=0;state.objectCount=1;state.selectedClient=null;$('clientInput').value='';$('descriptionInput').value='';renderEntryForm();}

  async function saveWithdrawal(){const amount=parseMoney($('withdrawalAmount').value);if(!(amount>0))return status('withdrawalStatus','Informe o valor.','warning');if(!$('withdrawalDeclaration').checked)return status('withdrawalStatus','Confirme a contagem da sangria.','warning');setBusy(true,'Registrando sangria e gerando PDF...');try{const result=await callApi('createWithdrawal',{payload:{date:todayIso(),amountCents:amount,destination:$('withdrawalDestination').value.trim()||'Financeiro',notes:$('withdrawalNotes').value.trim(),confirmed:true}});state.withdrawals.push(result.withdrawal);state.summary=result.summary;closeModal('withdrawalModal');renderAll();status('launchStatus',result.withdrawal.pdfUrl?'Sangria registrada e PDF gerado.':'Sangria registrada. PDF pendente.','success');}catch(error){status('withdrawalStatus',error.message,'error');}finally{setBusy(false);}}
  function updateWithdrawalMath(){const amount=parseMoney($('withdrawalAmount').value),available=state.summary?.expectedCashCents||0;$('withdrawalRemaining').textContent=money(available-amount);}

  async function closeCash(){if(state.closure)return;if(!$('closeDeclaration').checked)return status('closeStatus','Confirme a declaração de conferência.','warning');const counted=parseMoney($('countedCash').value),closing=parseMoney($('closingWithdrawal').value);setBusy(true,'Fechando caixa, gerando PDF e preparando Conta Azul...');try{const result=await callApi('closeCash',{payload:{date:todayIso(),countedCashCents:counted,closingWithdrawalCents:closing,withdrawalDestination:$('closingDestination').value.trim()||'Financeiro',notes:$('closingNotes').value.trim(),declarationConfirmed:true}});state.closure=result.closure;state.summary=result.summary||state.summary;renderAll();status('closeStatus',state.closure.pdfUrl?'Caixa fechado. PDF salvo no Drive.':'Caixa fechado. PDF aguardando nova tentativa.','success');}catch(error){status('closeStatus',error.message,'error');}finally{setBusy(false);}}

  function renderClientSuggestions(){
    const input = $('clientInput');
    const box = $('clientSuggestions');
    const query = input.value.trim();

    const selectedStillMatches = Boolean(
      state.selectedClient &&
      normalize(state.selectedClient.name) ===
        normalize(query)
    );

    const exactClient =
      findExactClientByName(query);

    /*
     * Um nome completo que já existe deve ser reconhecido
     * automaticamente, mesmo sem um segundo clique.
     */
    if (
      !selectedStillMatches &&
      exactClient
    ) {
      selectClient(exactClient);
      return;
    }

    /*
     * O cliente somente é removido quando o texto digitado
     * deixa de corresponder ao cliente selecionado.
     */
    if (!selectedStillMatches) {
      state.selectedClient = null;

      $('clientChip').classList.add('hidden');
      $('clientChip').innerHTML = '';
    }

    if (!query) {
      box.classList.add('hidden');
      $('btnAddClient').disabled = true;
      return;
    }

    if (selectedStillMatches) {
      box.classList.add('hidden');
      $('btnAddClient').disabled = true;

      renderEntryForm();
      return;
    }

    const tokens = normalize(query)
      .split(' ')
      .filter(Boolean);

    const found = state.clients
      .filter(client =>
        tokens.every(token =>
          normalize(client.name).includes(token)
        )
      )
      .slice(0, 10);

    box.innerHTML = found.length
      ? found.map(client => `
          <button
            class="suggestion"
            type="button"
            data-client-id="${client.id}"
          >
            ${escapeHtml(client.name)}
          </button>
        `).join('')
      : '<div class="suggestion">Sem resultado</div>';

    box.classList.remove('hidden');

    $('btnAddClient').disabled =
      state.clients.some(client =>
        normalize(client.name) ===
          normalize(query)
      );
  }

  async function addClient(){const name=$('clientInput').value.trim();if(!name)return;setBusy(true,'Cadastrando cliente...');try{const result=await callApi('saveClient',{name});state.clients.push(result.client);selectClient(result.client);status('launchStatus','Cliente cadastrado.','success');}catch(error){status('launchStatus',error.message,'error');}finally{setBusy(false);}}
  function selectClient(client){
    if (!client) {
      return;
    }

    state.selectedClient = client;

    $('clientInput').value = client.name;
    $('clientSuggestions').classList.add('hidden');
    $('btnAddClient').disabled = true;

    renderEntryForm();
    clearStatus('launchStatus');
  }

  function switchView(view){document.querySelectorAll('.main-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));['Launch','Movements','Close'].forEach(v=>$('view'+v).classList.toggle('hidden',v.toLowerCase()!==view));window.scrollTo({top:0,behavior:'smooth'});}
  function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(id){$(id).classList.add('hidden');document.body.style.overflow='';}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function bind(){
    document.querySelectorAll('.main-nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    document.querySelectorAll('[data-entry-type]').forEach(b=>b.addEventListener('click',()=>changeType(b.dataset.entryType)));
$('categoryOptions').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.selectedCategory=b.dataset.category;if(state.type==='DESPESA'&&selectedCategory()?.defaultPaymentId)state.selectedPayment=selectedCategory().defaultPaymentId;renderAll();});
    $('paymentOptions').addEventListener('click',e=>{const b=e.target.closest('[data-payment]');if(b){state.selectedPayment=b.dataset.payment;renderOptions();renderEntryForm();}});

    /*
     * Entrada de valores.
     * Usa captura no documento para funcionar mesmo após mudanças
     * entre Atender, Avulso, Individual e Em lote.
     */
    document.addEventListener('click', event => {
      const button = event.target.closest(
        '#keypad [data-key], #batchKeypad [data-key]'
      );

      if (!button) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const target = button.closest('#batchKeypad')
        ? 'batch'
        : 'single';

      handleKey(
        target,
        String(button.dataset.key || '')
      );
    }, true);

    /*
     * Teclado físico do computador.
     */
    document.addEventListener('keydown', event => {
      const targetElement = event.target;

      const editable = Boolean(
        targetElement &&
        targetElement.closest &&
        targetElement.closest(
          'input, textarea, select, [contenteditable="true"]'
        )
      );

      if (
        editable ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.defaultPrevented
      ) {
        return;
      }

      const modalOpen =
        document.querySelector(
          '.modal-backdrop:not(.hidden)'
        );

      if (modalOpen) {
        return;
      }

      let key = '';

      if (/^\d$/.test(event.key)) {
        key = event.key;
      } else if (/^Numpad\d$/.test(event.code)) {
        key = event.code.slice(-1);
      } else if (event.key === 'Backspace') {
        key = 'backspace';
      } else if (
        event.key === 'Delete' ||
        event.key === 'Escape'
      ) {
        key = 'clear';
      }

      if (key) {
        event.preventDefault();

        handleKey(
          state.mode === 'LOTE'
            ? 'batch'
            : 'single',
          key
        );

        return;
      }

      const addToBatchShortcut =

        state.mode === 'LOTE' &&

        (

          event.key === '+' ||

          event.code === 'NumpadAdd'

        );


      if (addToBatchShortcut) {

        event.preventDefault();

        addBatchItem();

        return;

      }


      if (event.key !== 'Enter') {

        return;

      }

      event.preventDefault();

      if (state.mode === 'LOTE') {
        if (event.shiftKey) {
          saveBatch();
        } else {
          addBatchItem();
        }

        return;
      }

      saveSingle();
    });

    $('btnObjectMinus').addEventListener('click',()=>{state.objectCount=Math.max(1,state.objectCount-1);renderEntryForm();});$('btnObjectPlus').addEventListener('click',()=>{state.objectCount=Math.min(999,state.objectCount+1);renderEntryForm();});
    $('btnSaveSingle').addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
        saveSingle();
      }
    );

    $('btnAddBatchItem').addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        state.mode = 'LOTE';
        addBatchItem();
      }
    );

    $('btnSaveBatch').addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        state.mode = 'LOTE';
        saveBatch();
      }
    );
    $('batchItems').addEventListener('click',e=>{const b=e.target.closest('[data-remove-batch]');if(!b)return;state.batchItems.splice(Number(b.dataset.removeBatch),1);renderEntryForm();});
    $('clientInput').addEventListener('input',renderClientSuggestions);$('clientInput').addEventListener('focus',renderClientSuggestions);$('clientSuggestions').addEventListener('click',e=>{const b=e.target.closest('[data-client-id]');if(b)selectClient(state.clients.find(c=>c.id===b.dataset.clientId));});$('btnAddClient').addEventListener('click',addClient);
    $('btnOpenWithdrawal').addEventListener('click',()=>{if(state.closure)return status('launchStatus','O caixa de hoje já foi fechado.','warning');$('withdrawalAvailable').textContent=money(state.summary?.expectedCashCents||0);$('withdrawalAmount').value='';$('withdrawalDestination').value='Financeiro';$('withdrawalNotes').value='';$('withdrawalDeclaration').checked=false;updateWithdrawalMath();clearStatus('withdrawalStatus');openModal('withdrawalModal');});
    $('withdrawalAmount').addEventListener('input',updateWithdrawalMath);$('btnSaveWithdrawal').addEventListener('click',saveWithdrawal);
    $('countedCash').addEventListener('input',updateCloseMath);$('closingWithdrawal').addEventListener('input',updateCloseMath);$('btnCloseCash').addEventListener('click',closeCash);
    $('btnConfirmManualPix').addEventListener('click',confirmManualPix);$('btnCopyPix').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('pixCode').value);status('pixStatus','Pix copiado.','success');}catch(_){}});
    $('btnRefresh').addEventListener('click',refresh);$('btnMovementRefresh').addEventListener('click',refresh);$('btnSettings').addEventListener('click',()=>{$('apiUrlInput').value=apiUrl();openModal('settingsModal');});$('btnSaveSettings').addEventListener('click',()=>{localStorage.setItem(STORAGE.API,$('apiUrlInput').value.trim());closeModal('settingsModal');window.location.reload();});
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
    document.addEventListener('click',e=>{if(!e.target.closest('#clientSection'))$('clientSuggestions').classList.add('hidden');});
  }

  bind();refresh();
})();
