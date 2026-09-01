'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const STORAGE = {
    API: 'caixa_avista_v2_api_url',
    LOCAL: 'caixa_avista_v2_local_data',
    PIX_PAYLOAD_PREFIX:
      'caixa_avista_v2_pix_payload:'
  };
  const state = {
    type: 'RECEITA', mode: 'ATENDIMENTO', amountCents: 0, batchAmountCents: 0,
    objectCount: 1, selectedCategory: '', selectedPayment: '', selectedClient: null,
    batchItems: [], library: null, clients: [], entries: [], withdrawals: [], summary: null,
    closure: null,
    user: null,
    busy: false,
    pixEntry: null,
    pixPayload: ''
  };

  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const todayIso = () => { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  const brDate = iso => { const p=String(iso||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso; };
  const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const parseMoney = value => { const t=String(value||'').replace(/R\$/gi,'').replace(/\s/g,''); if(!t)return 0; let n=t; if(t.includes(',')&&t.includes('.'))n=t.replace(/\./g,'').replace(',','.'); else if(t.includes(','))n=t.replace(',','.'); const x=Number(n.replace(/[^\d.-]/g,'')); return Number.isFinite(x)?Math.round(Math.abs(x)*100):0; };
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const apiUrl = () => localStorage.getItem(STORAGE.API) || '';
  const token = () => window.AgfAuth?.getToken?.() || '';

  const selectedUnitId = () =>
    String(
      window.CaixaUnitContext
        ?.getSelectedUnitId?.() ||
      state.library?.unit?.id ||
      'PADRAO'
    ).trim();

  function clearLegacyPixConfig() {
    try {
      const prefix =
        'caixa_avista_v2_pix_config:';

      const keys = [];

      for (
        let index = 0;
        index < localStorage.length;
        index += 1
      ) {
        const key =
          localStorage.key(index);

        if (
          key &&
          key.startsWith(prefix)
        ) {
          keys.push(key);
        }
      }

      keys.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (_) {
      // A limpeza não deve impedir a abertura do caixa.
    }
  }

  function paymentById(paymentId) {
    return (
      state.library?.payments || []
    ).find(
      payment =>
        payment.id ===
        String(paymentId || '')
    ) || null;
  }

  function paymentPixConfig(payment) {
    return {
      mode: String(
        payment?.pixMode || ''
      )
        .trim()
        .toUpperCase(),

      key: String(
        payment?.pixKey || ''
      ).trim(),

      name: String(
        payment?.pixReceiverName || ''
      ).trim(),

      city: String(
        payment?.pixCity ||
        'FORTALEZA'
      ).trim(),

      active:
        payment?.pixActive === true,

      shareMessage: String(
        payment?.pixShareMessage ||
        'Olá! Segue a cobrança Pix da sua postagem.'
      ).trim()
    };
  }

  function isPaymentPixConfigured(payment) {
    const config =
      paymentPixConfig(payment);

    return Boolean(
      isPixPayment(payment) &&
      config.active &&
      config.mode ===
        'LOCAL_STATIC' &&
      config.key &&
      config.name &&
      config.city
    );
  }

  function pixPayloadStorageKey(entryId) {
    return [
      STORAGE.PIX_PAYLOAD_PREFIX,
      selectedUnitId(),
      String(entryId || '').trim()
    ].join(':');
  }

  function savePendingPixPayload(
    entryId,
    payload
  ) {
    if (!entryId || !payload) {
      return;
    }

    try {
      localStorage.setItem(
        pixPayloadStorageKey(entryId),
        String(payload)
      );
    } catch (error) {
      console.warn(
        '[CAIXA_PIX_STORAGE]',
        error
      );
    }
  }

  function loadPendingPixPayload(entryId) {
    if (!entryId) {
      return '';
    }

    try {
      return String(
        localStorage.getItem(
          pixPayloadStorageKey(entryId)
        ) || ''
      );
    } catch (_) {
      return '';
    }
  }

  function clearPendingPixPayload(entryId) {
    if (!entryId) {
      return;
    }

    try {
      localStorage.removeItem(
        pixPayloadStorageKey(entryId)
      );
    } catch (_) {
      // A confirmação não deve falhar por causa do cache local.
    }
  }

  function isPendingPixEntry(entry) {
    const pixStatus = String(
      entry?.pixStatus || ''
    )
      .toUpperCase()
      .trim();

    return Boolean(
      entry &&
      entry.status !== 'EXCLUIDO' &&
      isPixEntry(entry) &&
      [
        'CRIANDO',
        'ATIVA',
        'PENDENTE'
      ].includes(pixStatus)
    );
  }

  function pendingPixEntries() {
    return state.entries.filter(
      isPendingPixEntry
    );
  }

  function sanitizePixText(
    value,
    maxLength
  ) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .toUpperCase()
      .replace(
        /[^A-Z0-9 $%*+\-./:]/g,
        ''
      )
      .slice(0, maxLength);
  }

  function pixEmv(id, value) {
    const text = String(
      value == null ? '' : value
    );

    return (
      id +
      String(text.length)
        .padStart(2, '0') +
      text
    );
  }

  function pixCrc16(value) {
    let crc = 0xFFFF;

    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      crc ^=
        value.charCodeAt(index) << 8;

      for (
        let bit = 0;
        bit < 8;
        bit += 1
      ) {
        crc =
          crc & 0x8000
            ? (
                (crc << 1) ^
                0x1021
              )
            : crc << 1;

        crc &= 0xFFFF;
      }
    }

    return crc
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
  }

  function generateLocalPixTxid() {
    const timestamp =
      Date.now()
        .toString(36)
        .toUpperCase();

    const random =
      Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase();

    return (
      'CX' +
      timestamp +
      random
    )
      .replace(
        /[^A-Z0-9]/g,
        ''
      )
      .slice(0, 25);
  }

  function buildLocalPixPayload(
    config,
    amountCents,
    txid
  ) {
    if (!config.key) {
      throw new Error(
        'Configure a chave Pix desta unidade.'
      );
    }

    if (!(amountCents > 0)) {
      throw new Error(
        'O valor da cobrança Pix é inválido.'
      );
    }

    const name = sanitizePixText(
      config.name,
      25
    );

    const city = sanitizePixText(
      config.city,
      15
    );

    if (!name || !city) {
      throw new Error(
        'Configure o nome do recebedor e a cidade.'
      );
    }

    const merchantAccount =
      pixEmv(
        '00',
        'BR.GOV.BCB.PIX'
      ) +
      pixEmv(
        '01',
        config.key
      );

    const normalizedTxid =
      String(txid || '')
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          ''
        )
        .slice(0, 25);

    if (!normalizedTxid) {
      throw new Error(
        'Não foi possível gerar o identificador da cobrança Pix.'
      );
    }

    const additional =
      pixEmv(
        '05',
        normalizedTxid
      );

    const amount =
      (
        Number(amountCents) / 100
      ).toFixed(2);

    const payloadWithoutCrc = [
      pixEmv('00', '01'),
      pixEmv(
        '26',
        merchantAccount
      ),
      pixEmv('52', '0000'),
      pixEmv('53', '986'),
      pixEmv('54', amount),
      pixEmv('58', 'BR'),
      pixEmv('59', name),
      pixEmv('60', city),
      pixEmv(
        '62',
        additional
      ),
      '6304'
    ].join('');

    return (
      payloadWithoutCrc +
      pixCrc16(payloadWithoutCrc)
    );
  }

  function requirePixConfig(payment) {
    if (!payment) {
      throw new Error(
        'Forma de pagamento Pix não encontrada.'
      );
    }

    if (!isPixPayment(payment)) {
      throw new Error(
        'A forma de pagamento selecionada não é Pix.'
      );
    }

    const config =
      paymentPixConfig(payment);

    if (!config.active) {
      throw new Error(
        payment.name +
        ' está desativado na planilha.'
      );
    }

    if (
      config.mode !==
      'LOCAL_STATIC'
    ) {
      throw new Error(
        payment.name +
        ' não está configurado para gerar QR Code local.'
      );
    }

    if (
      !config.key ||
      !config.name ||
      !config.city
    ) {
      throw new Error(
        payment.name +
        ' ainda não possui chave, recebedor e cidade configurados na planilha.'
      );
    }

    return config;
  }

  async function copyText(text) {
    const value = String(
      text || ''
    );

    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard
        .writeText(value);

      return;
    }

    const textarea =
      document.createElement(
        'textarea'
      );

    textarea.value = value;
    textarea.style.position =
      'fixed';
    textarea.style.opacity = '0';

    document.body.appendChild(
      textarea
    );

    textarea.select();

    const copied =
      document.execCommand('copy');

    textarea.remove();

    if (!copied) {
      throw new Error(
        'Não foi possível copiar.'
      );
    }
  }

  const isPixPayment = payment =>
    payment?.contaAzulMethod === 'PIX_PAGAMENTO_INSTANTANEO';

  function shouldGenerateLocalPix(payment) {
    return Boolean(
      state.type === 'RECEITA' &&
      state.mode === 'ATENDIMENTO' &&
      isPixPayment(payment)
    );
  }

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
    if(action==='syncPixPayment'){
      const payload=data.payload||{};
      let e=null;

      if(payload.entryId){
        e=db.entries.find(
          item=>
            item.id===payload.entryId
        );
      }else if(
        payload.txid &&
        payload.txid!=='***'
      ){
        e=db.entries.find(
          item=>
            item.pixTxid===payload.txid
        );
      }

      if(!e){
        throw new Error(
          'Lançamento Pix não encontrado.'
        );
      }

      e.pixStatus=
        payload.status||
        payload.pixStatus;

      e.pixTxid=
        payload.txid||
        e.pixTxid;

      e.pixProvider=
        payload.provider||
        e.pixProvider;

      if(
        String(e.pixStatus)
          .toUpperCase()===
        'CANCELADO'
      ){
        e.status='EXCLUIDO';
        e.contaAzulStatus='CANCELADO';
      }

      saveLocal(db);

      return {
        ok:true,
        entry:e,
        summary:localSummary(
          db.entries,
          db.withdrawals,
          todayIso()
        )
      };
    }
    if(action==='deleteEntry'){
      const payload=data.payload||{};
      const entry=db.entries.find(
        item=>
          item.id===payload.entryId
      );

      if(!entry){
        throw new Error(
          'Lançamento não encontrado.'
        );
      }

      const reason=String(
        payload.reason||''
      ).trim();

      if(reason.length<3){
        throw new Error(
          'Informe o motivo da exclusão.'
        );
      }

      if(entry.closureId){
        throw new Error(
          'Este lançamento já foi fechado.'
        );
      }

      entry.status='EXCLUIDO';
      entry.deletedAt=
        new Date().toISOString();
      entry.deletedBy='local';
      entry.deletedByName=
        'Homologação local';
      entry.deleteReason=reason;
      entry.contaAzulStatus=
        'CANCELADO';

      if(
        [
          'CRIANDO',
          'ATIVA',
          'PENDENTE'
        ].includes(
          String(
            entry.pixStatus||''
          ).toUpperCase()
        )
      ){
        entry.pixStatus=
          'CANCELADO';
      }

      saveLocal(db);

      return {
        ok:true,
        entry,
        summary:localSummary(
          db.entries,
          db.withdrawals,
          todayIso()
        )
      };
    }

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
      chooseDefaults();
      renderAll();

      const pending =
        pendingPixEntries();

      if (pending.length > 0) {
        status(
          'launchStatus',
          pending.length === 1
            ? 'Existe 1 cobrança Pix aguardando confirmação. Abra Mov. para continuar.'
            : `Existem ${pending.length} cobranças Pix aguardando confirmação. Abra Mov. para continuar.`,
          'warning'
        );
      }
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

  function renderType() {
    document
      .querySelectorAll(
        '.type-btn[data-entry-type]'
      )
      .forEach(button => {
        button.classList.toggle(
          'active',
          button.dataset.entryType ===
            state.type
        );

        button.setAttribute(
          'aria-pressed',
          button.dataset.entryType ===
            state.type
            ? 'true'
            : 'false'
        );
      });
  }
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

    const paymentContainer =
      $('paymentOptions');

    paymentContainer.innerHTML =
      payments().map(x =>
        `<button
          type="button"
          class="option-btn ${
            state.selectedPayment === x.id
              ? 'active'
              : ''
          }"
          data-payment="${x.id}"
          aria-pressed="${
            state.selectedPayment === x.id
              ? 'true'
              : 'false'
          }"
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

    paymentContainer
      .querySelectorAll(
        '[data-payment]'
      )
      .forEach(button => {
        button.disabled = false;

        button.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            if (state.busy) {
              return;
            }

            const nextPayment =
              String(
                button.dataset.payment ||
                ''
              ).trim();

            if (
              !nextPayment ||
              nextPayment ===
                state.selectedPayment
            ) {
              return;
            }

            state.selectedPayment =
              nextPayment;

            renderOptions();
            renderEntryForm();

            clearStatus(
              'launchStatus'
            );
          }
        );
      });
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
    const payment =
      selectedPayment();

    let saveLabel =
      state.type === 'RECEITA'
        ? 'Registrar'
        : 'Salvar despesa';

    if (
      state.type === 'RECEITA' &&
      attendance &&
      isPixPayment(payment)
    ) {
      saveLabel = 'Gerar Pix';
    }

    $('btnSaveSingle')
      .querySelector(
        'span:last-child'
      )
      .textContent = saveLabel;
  }
  function renderSummary(){
    const s=state.summary||{};$('cashOpening').textContent=money(s.openingCashCents);$('cashExpected').textContent=money(state.closure?state.closure.carryoverCents:s.expectedCashCents);$('cashWithdrawals').textContent=money(s.withdrawalsCents);
    $('summaryRevenue').textContent=money(s.revenueCents);$('summaryExpense').textContent=money(s.expenseCents);$('summaryNet').textContent=money(s.netCents);
    $('paymentSummary').innerHTML=(state.library?.payments||[]).map(p=>`<div class="payment-chip"><small>${escapeHtml(p.name)}</small><strong>${money(s.byPayment?.[p.id]||0)}</strong></div>`).join('');
  }
  function renderMovements() {
    const movements = [
      ...state.entries.map(entry => ({
        kind: 'ENTRY',
        createdAt: entry.createdAt,
        data: entry
      })),
      ...state.withdrawals.map(withdrawal => ({
        kind: 'WITHDRAWAL',
        createdAt: withdrawal.createdAt,
        data: withdrawal
      }))
    ].sort(
      (first, second) =>
        String(second.createdAt)
          .localeCompare(
            String(first.createdAt)
          )
    );

    $('movementList').innerHTML =
      movements.length
        ? movements.map(item => {
            if (
              item.kind === 'WITHDRAWAL'
            ) {
              const withdrawal =
                item.data;

              return `
                <article class="movement-item withdrawal">
                  <div>
                    <h4>
                      Sangria ·
                      ${escapeHtml(
                        withdrawal.destination ||
                        'Financeiro'
                      )}
                    </h4>

                    <p>
                      ${escapeHtml(
                        withdrawal.operatorName ||
                        ''
                      )}
                      ${withdrawal.pdfUrl
                        ? `· <a href="${escapeHtml(
                            withdrawal.pdfUrl
                          )}" target="_blank">PDF</a>`
                        : ''}
                    </p>
                  </div>

                  <strong>
                    - ${money(
                      withdrawal.amountCents
                    )}
                  </strong>
                </article>
              `;
            }

            const entry = item.data;

            const pending =
              isPendingPixEntry(entry);

            const contaAzulStatus =
              String(
                entry.contaAzulStatus ||
                ''
              ).toUpperCase();

            const canDelete =
              !state.closure &&
              !entry.closureId &&
              [
                '',
                'NAO_ENVIADO',
                'CANCELADO'
              ].includes(
                contaAzulStatus
              );

            return `
              <article class="movement-item
                ${entry.type === 'DESPESA'
                  ? 'expense'
                  : ''}
                ${pending
                  ? 'pix-pending'
                  : ''}">
                <div class="movement-main">
                  <h4>
                    ${escapeHtml(
                      entry.type === 'DESPESA'
                        ? (
                            entry.description ||
                            entry.categoryId
                          )
                        : (
                            entry.clientName ||
                            'Sem cliente'
                          )
                    )}
                  </h4>

                  <p>
                    ${escapeHtml(
                      entry.paymentName ||
                      entry.paymentId
                    )}
                    ·
                    ${escapeHtml(entry.mode)}
                    ${entry.batchId
                      ? ' · Lote'
                      : ''}
                    ${entry.pixStatus
                      ? ' · ' +
                        escapeHtml(
                          entry.pixStatus
                        )
                      : ''}
                  </p>

                  <div class="movement-actions">
                    ${pending
                      ? `
                        <button
                          class="movement-pix-action"
                          type="button"
                          data-open-pending-pix="${escapeHtml(
                            entry.id
                          )}"
                        >
                          <span class="material-symbols-rounded">
                            qr_code_2
                          </span>
                          Abrir cobrança
                        </button>
                      `
                      : ''}

                    ${canDelete
                      ? `
                        <button
                          class="movement-delete-action"
                          type="button"
                          data-delete-entry="${escapeHtml(
                            entry.id
                          )}"
                        >
                          <span class="material-symbols-rounded">
                            delete
                          </span>
                          Excluir
                        </button>
                      `
                      : ''}
                  </div>
                </div>

                <strong>
                  ${entry.type === 'DESPESA'
                    ? '- '
                    : ''}
                  ${money(entry.amountCents)}
                </strong>
              </article>
            `;
          }).join('')
        : `
          <div class="movement-item">
            <div>
              <h4>Sem movimentos</h4>
            </div>
          </div>
        `;
  }

  function renderClose(){
    const s=state.summary||{};$('closeOpening').textContent=money(s.openingCashCents);$('closeCashRevenue').textContent=money(s.cashRevenueCents);$('closeCashExpense').textContent=money(s.cashExpenseCents);$('closeWithdrawals').textContent=money(s.withdrawalsCents);$('closeExpected').textContent=money(s.expectedCashCents);
    const hasPixPending =
      Number(
        s.pixPendingCents || 0
      ) > 0;

    $('closeState').textContent =
      state.closure
        ? 'Fechado'
        : hasPixPending
          ? 'Pix pendente'
          : 'Aberto';

    $('btnCloseCash').disabled =
      Boolean(
        state.closure ||
        hasPixPending
      );
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

  async function saveSingle() {
    clearStatus('launchStatus');

    if (!(state.amountCents > 0)) {
      return status(
        'launchStatus',
        'Digite o valor.',
        'warning'
      );
    }

    const category =
      selectedCategory();

    const payment =
      selectedPayment();

    if (!category || !payment) {
      return status(
        'launchStatus',
        'Selecione tipo e pagamento.',
        'warning'
      );
    }

    if (
      state.type === 'RECEITA' &&
      state.mode === 'ATENDIMENTO' &&
      !resolveAttendanceClient()
    ) {
      return status(
        'launchStatus',
        'Selecione ou cadastre o cliente.',
        'warning'
      );
    }

    const generateLocalPix =
      shouldGenerateLocalPix(payment);

    const manualPix =
      isPixPayment(payment) &&
      !generateLocalPix;

    setBusy(
      true,
      generateLocalPix
        ? 'Gerando cobrança Pix...'
        : 'Salvando...'
    );

    try {
      if (generateLocalPix) {
        await startPix(payment);
        return;
      }

      const result = await callApi(
        'saveEntry',
        {
          payload: draft(
            state.amountCents,
            {
              pixStatus:
                manualPix
                  ? 'CONFIRMADO'
                  : '',
              pixProvider:
                manualPix
                  ? 'manual-single'
                  : ''
            }
          )
        }
      );

      applySaveResult(result);

      status(
        'launchStatus',
        manualPix
          ? 'Pix manual registrado.'
          : state.type === 'RECEITA'
            ? 'Receita registrada.'
            : 'Despesa registrada.',
        'success'
      );

      resetEntry();
    } catch (error) {
      status(
        'launchStatus',
        error.message ||
          'Não foi possível concluir o lançamento.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  async function startPix(payment) {
    if (
      !payment ||
      !isPixPayment(payment)
    ) {
      throw new Error(
        'A forma de pagamento selecionada não é Pix.'
      );
    }

    if (!shouldGenerateLocalPix(payment)) {
      throw new Error(
        'A cobrança Pix local só pode ser gerada no modo Atender.'
      );
    }

    let config;

    try {
      config = requirePixConfig(payment);
    } catch (error) {
      openSettings();
      throw error;
    }

    const amountCents =
      state.amountCents;

    const entryId = uid();

    const pixTxid =
      generateLocalPixTxid();

    const pixPayload =
      buildLocalPixPayload(
        config,
        amountCents,
        pixTxid
      );

    savePendingPixPayload(
      entryId,
      pixPayload
    );

    let saved;

    try {
      saved = await callApi(
        'saveEntry',
        {
          payload: draft(
            amountCents,
            {
              entryId,
              pixStatus: 'PENDENTE',
              pixTxid,
              pixProvider: 'local'
            }
          )
        }
      );
    } catch (error) {
      clearPendingPixPayload(entryId);
      throw error;
    }

    applySaveResult(saved);

    state.pixEntry =
      saved.entry;

    state.pixPayload =
      pixPayload;

    $('btnCopyPix').disabled = false;
    $('btnSharePix').disabled = false;
    $('btnDownloadPix').disabled = false;

    $('pixAmount').textContent =
      money(amountCents);

    $('pixCode').value =
      pixPayload;

    const qrRendered =
      renderQr(pixPayload);

    openModal('pixModal');

    status(
      'pixStatus',
      qrRendered
        ? 'Aguardando pagamento. Confirme somente depois de conferir o crédito.'
        : 'O Pix foi gerado. Use o Copia e Cola porque o QR Code não carregou.',
      qrRendered
        ? 'info'
        : 'warning'
    );
  }

  function renderQr(code) {
    const container = $('pixQr');

    container.innerHTML = '';

    if (!code) {
      return false;
    }

    if (
      typeof window.QRCode !==
      'function'
    ) {
      container.innerHTML =
        '<span class="material-symbols-rounded pix-placeholder">qr_code_2</span>';

      return false;
    }

    try {
      new window.QRCode(
        container,
        {
          text: code,
          width: 270,
          height: 270,
          correctLevel:
            window.QRCode
              .CorrectLevel.M
        }
      );

      return true;
    } catch (error) {
      console.error(
        '[CAIXA_PIX_QR]',
        error
      );

      container.innerHTML =
        '<span class="material-symbols-rounded pix-placeholder">qr_code_2</span>';

      return false;
    }
  }

  function openPendingPix(entry) {
    if (!entry) {
      status(
        'movementStatus',
        'Cobrança Pix não encontrada.',
        'error'
      );

      return;
    }

    const payment =
      paymentById(
        entry.paymentId
      );

    let payload =
      loadPendingPixPayload(
        entry.id
      );

    let recoveryError = '';

    if (
      !payload &&
      entry.pixTxid &&
      payment
    ) {
      try {
        const config =
          requirePixConfig(
            payment
          );

        payload =
          buildLocalPixPayload(
            config,
            entry.amountCents,
            entry.pixTxid
          );

        savePendingPixPayload(
          entry.id,
          payload
        );
      } catch (error) {
        recoveryError =
          error.message || '';
      }
    }

    state.pixEntry = entry;
    state.pixPayload = payload;

    $('pixAmount').textContent =
      money(entry.amountCents);

    $('pixCode').value =
      payload;

    $('btnCopyPix').disabled =
      !payload;

    $('btnSharePix').disabled =
      !payload;

    $('btnDownloadPix').disabled =
      !payload;

    const qrRendered =
      payload
        ? renderQr(payload)
        : false;

    if (!payload) {
      $('pixQr').innerHTML =
        '<span class="material-symbols-rounded pix-placeholder">qr_code_2</span>';
    }

    openModal('pixModal');

    if (
      payload &&
      qrRendered
    ) {
      status(
        'pixStatus',
        'Cobrança pendente recuperada pela configuração central da planilha.',
        'warning'
      );

      return;
    }

    if (payload) {
      status(
        'pixStatus',
        'Cobrança recuperada. Use o Pix Copia e Cola porque o QR Code não carregou.',
        'warning'
      );

      return;
    }

    status(
      'pixStatus',
      recoveryError ||
        'Não foi possível reconstruir a cobrança pendente.',
      'error'
    );
  }

  function pixQrPngDataUrl() {
    const container =
      $('pixQr');

    const canvas =
      container.querySelector(
        'canvas'
      );

    if (
      canvas &&
      canvas.width > 0 &&
      canvas.height > 0
    ) {
      return canvas.toDataURL(
        'image/png'
      );
    }

    const image =
      container.querySelector(
        'img'
      );

    if (
      image &&
      String(image.src || '')
        .startsWith('data:image/png')
    ) {
      return image.src;
    }

    return '';
  }

  function downloadPixQrPng() {
    const dataUrl =
      pixQrPngDataUrl();

    if (!dataUrl) {
      status(
        'pixStatus',
        'O QR Code ainda não está disponível para salvar.',
        'warning'
      );

      return;
    }

    const entryReference =
      String(
        state.pixEntry?.pixTxid ||
        state.pixEntry?.id ||
        Date.now()
      )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          ''
        )
        .slice(0, 40);

    const link =
      document.createElement('a');

    link.href = dataUrl;
    link.download =
      'pix-' +
      entryReference +
      '.png';

    document.body.appendChild(link);
    link.click();
    link.remove();

    status(
      'pixStatus',
      'Imagem do QR Code salva em PNG.',
      'success'
    );
  }

  async function copyLocalPix() {
    try {
      await copyText(
        state.pixPayload ||
        $('pixCode').value
      );

      status(
        'pixStatus',
        'Pix Copia e Cola copiado.',
        'success'
      );
    } catch (error) {
      status(
        'pixStatus',
        error.message ||
          'Não foi possível copiar o Pix.',
        'error'
      );
    }
  }

  async function shareLocalPix() {
    const code =
      state.pixPayload ||
      $('pixCode').value;

    const amountCents =
      state.pixEntry
        ?.amountCents ||
      state.amountCents;

    if (!code) {
      status(
        'pixStatus',
        'O código Pix não está disponível.',
        'warning'
      );

      return;
    }

    const payment =
      paymentById(
        state.pixEntry
          ?.paymentId ||
        state.selectedPayment
      );

    const baseMessage =
      paymentPixConfig(
        payment
      ).shareMessage ||
      'Olá! Segue a cobrança Pix da sua postagem.';

    const message = [
      baseMessage,
      '',
      'Valor: ' +
        money(amountCents),
      '',
      'Pix Copia e Cola:',
      code
    ].join('\n');

    const url =
      'https://wa.me/?text=' +
      encodeURIComponent(
        message
      );

    const opened =
      window.open(
        url,
        '_blank',
        'noopener,noreferrer'
      );

    if (opened) {
      status(
        'pixStatus',
        'Cobrança aberta no WhatsApp.',
        'success'
      );

      return;
    }

    try {
      await copyText(message);

      status(
        'pixStatus',
        'A mensagem foi copiada. Abra o WhatsApp e cole no atendimento.',
        'warning'
      );
    } catch (_) {
      status(
        'pixStatus',
        'Não foi possível abrir o WhatsApp.',
        'error'
      );
    }
  }

  async function confirmManualPix() {
    if (!state.pixEntry) {
      return;
    }

    setBusy(
      true,
      'Confirmando Pix...'
    );

    try {
      const result = await callApi(
        'syncPixPayment',
        {
          payload: {
            entryId:
              state.pixEntry.id,
            txid:
              state.pixEntry
                .pixTxid ||
              '***',
            status:
              'CONFIRMADO',
            amountCents:
              state.pixEntry
                .amountCents,
            provider:
              'local'
          }
        }
      );

      const index =
        state.entries.findIndex(
          entry =>
            entry.id ===
            state.pixEntry.id
        );

      if (
        index >= 0 &&
        result.entry
      ) {
        state.entries[index] =
          result.entry;
      }

      state.summary =
        result.summary ||
        state.summary;

      clearPendingPixPayload(
        state.pixEntry.id
      );

      closeModal('pixModal');
      resetEntry();
      renderAll();

      status(
        'launchStatus',
        'Pix confirmado e recebimento registrado.',
        'success'
      );
    } catch (error) {
      status(
        'pixStatus',
        error.message ||
          'Não foi possível confirmar o Pix.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelManualPix() {
    if (!state.pixEntry) {
      closeModal('pixModal');
      return;
    }

    const confirmed =
      window.confirm(
        'Cancelar esta cobrança Pix?'
      );

    if (!confirmed) {
      return;
    }

    setBusy(
      true,
      'Cancelando cobrança Pix...'
    );

    try {
      const entryId =
        state.pixEntry.id;

      const result = await callApi(
        'syncPixPayment',
        {
          payload: {
            entryId,
            txid:
              state.pixEntry
                .pixTxid ||
              '***',
            status:
              'CANCELADO',
            amountCents:
              state.pixEntry
                .amountCents,
            provider:
              'local'
          }
        }
      );

      state.entries =
        state.entries.filter(
          entry =>
            entry.id !== entryId
        );

      state.summary =
        result.summary ||
        state.summary;

      clearPendingPixPayload(
        state.pixEntry.id
      );

      closeModal('pixModal');
      resetEntry();
      renderAll();

      status(
        'launchStatus',
        'Cobrança Pix cancelada.',
        'success'
      );
    } catch (error) {
      status(
        'pixStatus',
        error.message ||
          'Não foi possível cancelar a cobrança.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteMovementEntry(entry) {
    if (!entry) {
      status(
        'movementStatus',
        'Lançamento não encontrado.',
        'error'
      );

      return;
    }

    const reason =
      window.prompt(
        'Informe o motivo da exclusão deste registro:'
      );

    if (reason === null) {
      return;
    }

    const cleanReason =
      String(reason)
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanReason.length < 3) {
      status(
        'movementStatus',
        'Informe um motivo com pelo menos 3 caracteres.',
        'warning'
      );

      return;
    }

    const confirmed =
      window.confirm(
        [
          'Confirma a exclusão deste registro?',
          '',
          entry.paymentName ||
            entry.paymentId,
          money(entry.amountCents),
          '',
          'O registro permanecerá na auditoria da planilha.'
        ].join('\n')
      );

    if (!confirmed) {
      return;
    }

    setBusy(
      true,
      'Excluindo lançamento...'
    );

    try {
      const result =
        await callApi(
          'deleteEntry',
          {
            payload: {
              entryId: entry.id,
              reason: cleanReason
            }
          }
        );

      state.entries =
        state.entries.filter(
          item =>
            item.id !== entry.id
        );

      state.summary =
        result.summary ||
        state.summary;

      clearPendingPixPayload(
        entry.id
      );

      renderAll();

      status(
        'movementStatus',
        'Registro excluído e removido dos totais.',
        'success'
      );
    } catch (error) {
      status(
        'movementStatus',
        error.message ||
          'Não foi possível excluir o registro.',
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

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
  function resetEntry() {
    state.amountCents = 0;
    state.objectCount = 1;
    state.selectedClient = null;
    state.pixEntry = null;
    state.pixPayload = '';

    $('clientInput').value = '';
    $('descriptionInput').value = '';

    renderEntryForm();
  }

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

  function openSettings() {
    $('apiUrlInput').value =
      apiUrl();

    $('settingsUnitLabel')
      .textContent =
        state.library?.unit?.name ||
        selectedUnitId();

    clearStatus(
      'settingsStatus'
    );

    openModal(
      'settingsModal'
    );
  }

  function saveSettings() {
    const nextApiUrl =
      $('apiUrlInput')
        .value.trim();

    if (
      nextApiUrl &&
      !/^https://script.google.com/macros/s//
        .test(nextApiUrl)
    ) {
      status(
        'settingsStatus',
        'Informe uma URL válida do Apps Script.',
        'error'
      );

      return;
    }

    localStorage.setItem(
      STORAGE.API,
      nextApiUrl
    );

    status(
      'settingsStatus',
      'Configuração técnica salva.',
      'success'
    );

    window.setTimeout(
      () => {
        closeModal(
          'settingsModal'
        );
      },
      400
    );
  }

  function switchView(view){document.querySelectorAll('.main-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));['Launch','Movements','Close'].forEach(v=>$('view'+v).classList.toggle('hidden',v.toLowerCase()!==view));window.scrollTo({top:0,behavior:'smooth'});}
  function openModal(id){$(id).classList.remove('hidden');document.body.style.overflow='hidden';}
  function closeModal(id){$(id).classList.add('hidden');document.body.style.overflow='';}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function bind(){
    document.querySelectorAll('.main-nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    document
      .querySelectorAll(
        '.type-btn[data-entry-type]'
      )
      .forEach(button => {
        button.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();

            if (state.busy) {
              return;
            }

            const nextType =
              String(
                button.dataset.entryType ||
                ''
              ).trim();

            if (
              !nextType ||
              nextType === state.type
            ) {
              return;
            }

            changeType(nextType);
          }
        );
      });
$('categoryOptions').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.selectedCategory=b.dataset.category;if(state.type==='DESPESA'&&selectedCategory()?.defaultPaymentId)state.selectedPayment=selectedCategory().defaultPaymentId;renderAll();});
    /*
     * Os botões de pagamento recebem eventos diretos
     * sempre que renderOptions recria seus elementos.
     */

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

    $('movementList').addEventListener(
      'click',
      event => {
        const pixButton =
          event.target.closest(
            '[data-open-pending-pix]'
          );

        if (pixButton) {
          const entryId =
            String(
              pixButton.dataset
                .openPendingPix ||
              ''
            );

          const entry =
            state.entries.find(
              item =>
                item.id === entryId
            );

          openPendingPix(entry);
          return;
        }

        const deleteButton =
          event.target.closest(
            '[data-delete-entry]'
          );

        if (!deleteButton) {
          return;
        }

        const entryId =
          String(
            deleteButton.dataset
              .deleteEntry ||
            ''
          );

        const entry =
          state.entries.find(
            item =>
              item.id === entryId
          );

        deleteMovementEntry(entry);
      }
    );

    $('clientInput').addEventListener('input',renderClientSuggestions);$('clientInput').addEventListener('focus',renderClientSuggestions);$('clientSuggestions').addEventListener('click',e=>{const b=e.target.closest('[data-client-id]');if(b)selectClient(state.clients.find(c=>c.id===b.dataset.clientId));});$('btnAddClient').addEventListener('click',addClient);
    $('btnOpenWithdrawal').addEventListener('click',()=>{if(state.closure)return status('launchStatus','O caixa de hoje já foi fechado.','warning');$('withdrawalAvailable').textContent=money(state.summary?.expectedCashCents||0);$('withdrawalAmount').value='';$('withdrawalDestination').value='Financeiro';$('withdrawalNotes').value='';$('withdrawalDeclaration').checked=false;updateWithdrawalMath();clearStatus('withdrawalStatus');openModal('withdrawalModal');});
    $('withdrawalAmount').addEventListener('input',updateWithdrawalMath);$('btnSaveWithdrawal').addEventListener('click',saveWithdrawal);
    $('countedCash').addEventListener('input',updateCloseMath);$('closingWithdrawal').addEventListener('input',updateCloseMath);$('btnCloseCash').addEventListener('click',closeCash);
    $('btnConfirmManualPix')
      .addEventListener(
        'click',
        confirmManualPix
      );

    $('btnCopyPix')
      .addEventListener(
        'click',
        copyLocalPix
      );

    $('btnSharePix')
      .addEventListener(
        'click',
        shareLocalPix
      );

    $('btnDownloadPix')
      .addEventListener(
        'click',
        downloadPixQrPng
      );

    $('btnCancelPix')
      .addEventListener(
        'click',
        cancelManualPix
      );

    $('btnCancelPixTop')
      .addEventListener(
        'click',
        cancelManualPix
      );
    $('btnRefresh').addEventListener('click',refresh);$('btnMovementRefresh').addEventListener('click',refresh);$('btnSettings').addEventListener('click',openSettings);$('btnSaveSettings').addEventListener('click',saveSettings);
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&m.id!=='pixModal')closeModal(m.id);}));
    document.addEventListener('click',e=>{if(!e.target.closest('#clientSection'))$('clientSuggestions').classList.add('hidden');});
  }

  clearLegacyPixConfig();
  bind();
  refresh();
})();
