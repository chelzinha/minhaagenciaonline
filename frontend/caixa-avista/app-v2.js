'use strict';

(() => {
  const $ = id => document.getElementById(id);

  const DEFAULT_API_URL =
    'https://script.google.com/macros/s/AKfycbxH-9PPg_R5i5YGYuZOgizOK-_i9XssRvvoA21XFnxt0nZr9SF87jFysf4s3bhNVSIe/exec';

  const DEFAULT_CLIENT = Object.freeze({
    id: 'cliente-balcao',
    name: 'Cliente de Balcão'
  });

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
    serverDate: '',
    timezone: 'America/Fortaleza',
    pendingEntryId: '',
    pendingEntryFingerprint: '',
    pendingPixTxid: '',
    pendingWithdrawalId: '',
    pendingWithdrawalFingerprint: '',
    pixEntry: null,
    pixPayload: ''
  };

  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const todayIso = () => { const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
  const brDate = iso => { const p=String(iso||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:iso; };
  const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  const parseMoney = value => { const t=String(value||'').replace(/R\$/gi,'').replace(/\s/g,''); if(!t)return 0; let n=t; if(t.includes(',')&&t.includes('.'))n=t.replace(/\./g,'').replace(',','.'); else if(t.includes(','))n=t.replace(',','.'); const x=Number(n.replace(/[^\d.-]/g,'')); return Number.isFinite(x)?Math.round(Math.abs(x)*100):0; };
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const apiUrl = () => DEFAULT_API_URL;

  const currentDate = () =>
    String(state.serverDate || todayIso());

  function entryFingerprint() {
    return JSON.stringify({
      type: state.type,
      mode: state.mode,
      amountCents: state.amountCents,
      categoryId: state.selectedCategory,
      paymentId: state.selectedPayment,
      clientId: state.selectedClient?.id || '',
      clientName: state.selectedClient?.name || String($('clientInput')?.value || '').trim(),
      objectCount: state.objectCount,
      description: String($('descriptionInput')?.value || '').trim()
    });
  }

  function stableEntryId() {
    const fingerprint = entryFingerprint();

    if (
      !state.pendingEntryId ||
      state.pendingEntryFingerprint !== fingerprint
    ) {
      state.pendingEntryId = uid();
      state.pendingEntryFingerprint = fingerprint;
      state.pendingPixTxid = '';
    }

    return state.pendingEntryId;
  }

  function stableWithdrawalId() {
    const fingerprint = JSON.stringify({
      amount: String($('withdrawalAmount')?.value || '')
    });

    if (
      !state.pendingWithdrawalId ||
      state.pendingWithdrawalFingerprint !== fingerprint
    ) {
      state.pendingWithdrawalId = uid();
      state.pendingWithdrawalFingerprint = fingerprint;
    }

    return state.pendingWithdrawalId;
  }
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

  /*
   * Pix de maquininha (pix_mode = MAQUININHA, ex.: Pix Infinity) funciona como
   * cartão: sem QR Code, aceita Avulso e Lote e nasce confirmado no backend.
   * Somente o Pix com QR local (Pix Santander) segue as regras de cobrança.
   */
  const isTerminalPixPayment = payment =>
    isPixPayment(payment) &&
    String(payment?.pixMode || '').toUpperCase().trim() === 'MAQUININHA';

  const isLocalPixPayment = payment =>
    isPixPayment(payment) && !isTerminalPixPayment(payment);

  function shouldGenerateLocalPix(payment) {
    return Boolean(
      state.type === 'RECEITA' &&
      state.mode === 'ATENDIMENTO' &&
      isLocalPixPayment(payment)
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
    const controller =
      typeof AbortController === 'function'
        ? new AbortController()
        : null;

    const timer = controller
      ? window.setTimeout(
          () => controller.abort(),
          20000
        )
      : null;

    try {
      const response = await fetch(
        apiUrl(),
        {
          method:'POST',
          headers:{
            'Content-Type':
              'text/plain;charset=utf-8'
          },
          body:JSON.stringify({
            action,
            st:token(),
            ...data
          }),
          signal:controller
            ? controller.signal
            : undefined
        }
      );

      if(!response.ok){
        throw new Error(
          'Falha de comunicação com o caixa.'
        );
      }

      const result = await response.json();

      if(!result?.ok){
        const error = new Error(
          result?.error ||
          'Operação não concluída.'
        );
        error.code = result?.code || '';
        throw error;
      }

      return result;
    } catch(error) {
      if (error?.name === 'AbortError') {
        throw new Error(
          'O servidor demorou para responder. Tente novamente sem alterar os dados do lançamento.'
        );
      }

      throw error;
    } finally {
      if (timer) {
        window.clearTimeout(timer);
      }
    }
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
  function status(id,message,type='info'){const el=$(id);el.textContent=message;el.className=`status-box show ${type}`;if(TOAST_TARGETS.includes(id)&&(type==='success'||type==='error'))feedback(type,message);}

  /*
   * FEEDBACK DE AÇÃO (2026-09-23)
   * Confirmação grande, estilo maquininha: ícone, título, detalhe, vibração
   * curta e bipe discreto. Sucesso fecha sozinho; erro fica até tocar.
   */
  const TOAST_TARGETS = ['launchStatus','movementStatus','closeStatus','withdrawalStatus','pixStatus'];
  let toastTimer = null;
  let lastFeedback = null;

  function beep(type) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = beep.ctx || (beep.ctx = new Ctx());
      const tones = type === 'success' ? [880, 1320] : [330, 220];
      tones.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + index * 0.11;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.11);
      });
    } catch (_) {}
  }

  function feedback(type, title, detail = '') {
    const toast = $('caixaToast');
    if (!toast) return;

    const key = type + '|' + title;
    const now = Date.now();
    if (lastFeedback && lastFeedback.key === key && now - lastFeedback.at < 400) return;
    lastFeedback = { key, at: now };

    const extra = detail || (type === 'success' ? (lastSavedDetail || '') : '');
    lastSavedDetail = '';

    toast.className = `caixa-toast show ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <div class="toast-card">
        <span class="toast-icon"><span class="material-symbols-rounded">${type === 'success' ? 'check' : 'priority_high'}</span></span>
        <strong>${escapeHtml(title)}</strong>
        ${extra ? `<span class="toast-detail">${extra}</span>` : ''}
        ${type === 'error' ? '<button type="button" class="toast-close">OK</button>' : ''}
      </div>`;

    try { navigator.vibrate?.(type === 'success' ? 35 : [60, 40, 60]); } catch (_) {}
    beep(type);

    window.clearTimeout(toastTimer);
    if (type === 'success') {
      toastTimer = window.setTimeout(hideFeedback, 1700);
    }
  }

  function hideFeedback() {
    const toast = $('caixaToast');
    if (toast) toast.className = 'caixa-toast';
  }

  let lastSavedDetail = '';

  function rememberSavedDetail(amountCents, payment) {
    lastSavedDetail =
      `<b>${escapeHtml(money(amountCents))}</b>` +
      (payment ? ` · ${escapeHtml(payment.name)}` : '');
  }
  function clearStatus(id){const el=$(id);el.textContent='';el.className='status-box';}

  async function refresh(){
    setBusy(true,'Atualizando caixa...');
    try{
      const result=await callApi('init',{date:todayIso()});
      state.user=result.user;
      state.library=result.library;
      state.clients=result.clients||[];
      state.entries=result.entries||[];
      state.withdrawals=result.withdrawals||[];
      state.summary=result.summary;
      state.closure=result.closure||null;
      state.serverDate=result.serverDate||todayIso();
      state.timezone=result.timezone||'America/Fortaleza';
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
  function payments(){
    return (state.library?.payments||[]).filter(payment => {
      const allowed =
        state.type === 'RECEITA'
          ? payment.allowRevenue
          : payment.allowExpense;

      if (!allowed) return false;

      if (state.mode === 'LOTE' && !payment.allowBatch) return false;

      if (isLocalPixPayment(payment)) {
        return (
          state.type === 'RECEITA' &&
          state.mode === 'ATENDIMENTO' &&
          isPaymentPixConfigured(payment)
        );
      }

      return true;
    });
  }
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
    $('unitLabel').textContent=state.library?.unit?.name||'Unidade';
    $('operatorLabel').textContent=state.user?.name||'Usuário';
    $('dateLabel').textContent=brDate(currentDate());

    const switchButton = $('btnSwitchUnit');
    if (switchButton) {
      switchButton.classList.toggle(
        'hidden',
        !window.CaixaUnitContext?.canSwitchUnit?.()
      );
    }
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
  /*
   * UI MAQUININHA (2026-09-23)
   * Somente apresentação: famílias de pagamento e grupos de receita.
   * data-payment / data-category e os handlers continuam os mesmos.
   */
  const PAYMENT_FAMILIES = [
    { id:'CASH', label:'Dinheiro', icon:'payments' },
    { id:'PIX', label:'Pix', icon:'bolt' },
    { id:'DEBIT', label:'Débito', icon:'credit_card' },
    { id:'CREDIT', label:'Crédito', icon:'credit_score' },
    { id:'OTHER', label:'Outros', icon:'account_balance_wallet' }
  ];

  function paymentFamily(payment) {
    const method = String(payment?.contaAzulMethod || '').toUpperCase();
    if (method === 'DINHEIRO' || payment?.id === 'DINHEIRO') return 'CASH';
    if (method === 'PIX_PAGAMENTO_INSTANTANEO') return 'PIX';
    if (method === 'CARTAO_DEBITO') return 'DEBIT';
    if (method === 'CARTAO_CREDITO') return 'CREDIT';
    return 'OTHER';
  }

  function paymentShortName(payment) {
    const name = String(payment?.name || payment?.id || '').trim();
    const short = name
      .replace(/^(pix|d[ée]bito|cr[ée]dito|cart[ãa]o( de)?( d[ée]bito| cr[ée]dito)?)\s+/i, '')
      .trim();
    return short || name;
  }

  function paymentTileHtml(payment, extraClass = '') {
    const active = state.selectedPayment === payment.id;
    const family = paymentFamily(payment);
    const local = isLocalPixPayment(payment);
    const label = family === 'CASH' ? payment.name : paymentShortName(payment);

    return `<button
      type="button"
      class="pay-tile pay-${family.toLowerCase()} ${extraClass} ${active ? 'active' : ''}"
      data-payment="${escapeHtml(payment.id)}"
      aria-pressed="${active ? 'true' : 'false'}"
      aria-label="${escapeHtml(payment.name)}"
      title="${escapeHtml(payment.name)}"
    >
      <span class="material-symbols-rounded pay-icon">${
        family === 'CASH' ? 'payments' : local ? 'qr_code_2' : (PAYMENT_FAMILIES.find(f => f.id === family)?.icon || 'payments')
      }</span>
      <span class="pay-name">${escapeHtml(label)}</span>
      ${local ? '<span class="pay-badge">QR</span>' : ''}
      <span class="material-symbols-rounded pay-check" aria-hidden="true">check_circle</span>
    </button>`;
  }

  function renderPaymentBoard() {
    const list = payments();
    const byFamily = {};

    list.forEach(payment => {
      const family = paymentFamily(payment);
      (byFamily[family] = byFamily[family] || []).push(payment);
    });

    const cash = byFamily.CASH || [];
    const others = PAYMENT_FAMILIES.filter(
      family => family.id !== 'CASH' && (byFamily[family.id] || []).length
    );

    const cashHtml = cash.length
      ? `<div class="pay-cash-row">${cash.map(p => paymentTileHtml(p, 'pay-tile-wide')).join('')}</div>`
      : '';

    const familiesHtml = others.length
      ? `<div class="pay-families" style="--pay-family-count:${others.length}">${
          others.map(family => `
            <div class="pay-family pay-family-${family.id.toLowerCase()}" role="group" aria-label="${family.label}">
              <div class="pay-family-head">
                <span class="material-symbols-rounded">${family.icon}</span>
                <span>${family.label}</span>
              </div>
              <div class="pay-family-options">
                ${byFamily[family.id].map(p => paymentTileHtml(p)).join('')}
              </div>
            </div>`).join('')
        }</div>`
      : '';

    return list.length
      ? `<div class="pay-board">${cashHtml}${familiesHtml}</div>`
      : '<div class="pay-empty"><span class="material-symbols-rounded">block</span>Nenhuma forma de pagamento disponível neste modo.</div>';
  }

  function renderOptions(){
    const isRevenue =
      state.type === 'RECEITA';

    const revenueGroups =
      isRevenue ? categories() : [];

    const showRevenueGroups =
      revenueGroups.length > 1;

    const categorySection =
      $('categoryOptions')
        ?.closest('.option-section');

    if(categorySection){
      categorySection.classList.toggle(
        'hidden',
        isRevenue && !showRevenueGroups
      );
      categorySection.classList.toggle(
        'revenue-groups',
        showRevenueGroups
      );
    }

    $('categoryLabel').textContent =
      isRevenue
        ? 'Grupo'
        : 'Tipo de despesa';

    $('categoryOptions').classList.toggle(
      'group-switch',
      showRevenueGroups
    );

    $('categoryOptions').innerHTML =
      isRevenue
        ? (showRevenueGroups
            ? revenueGroups.map(x => `<button
                type="button"
                class="group-btn ${state.selectedCategory === x.id ? 'active' : ''}"
                data-category="${escapeHtml(x.id)}"
                aria-pressed="${state.selectedCategory === x.id ? 'true' : 'false'}"
                style="--option-color:${escapeHtml(x.color || '#0f6ee8')}"
              >
                <span class="material-symbols-rounded">${escapeHtml(x.icon || 'point_of_sale')}</span>
                <span>${escapeHtml(x.name)}</span>
              </button>`).join('')
            : '')
        : categories().map(x =>
            `<button
              type="button"
              class="option-btn ${
                state.selectedCategory === x.id
                  ? 'active'
                  : ''
              }"
              data-category="${x.id}"
              aria-pressed="${state.selectedCategory === x.id ? 'true' : 'false'}"
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
      renderPaymentBoard();

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
      isLocalPixPayment(payment)
    ) {
      saveLabel = 'Gerar Pix';
    }

    $('btnSaveSingle')
      .querySelector(
        'span:last-child'
      )
      .textContent = saveLabel;

    renderAmountContext(payment);
  }

  function renderAmountContext(payment) {
    const group =
      state.type === 'RECEITA' && categories().length > 1
        ? selectedCategory()
        : null;

    const html = [
      group
        ? `<span class="ctx-chip ctx-group"><span class="material-symbols-rounded">${escapeHtml(group.icon || 'point_of_sale')}</span>${escapeHtml(group.name)}</span>`
        : '',
      payment
        ? `<span class="ctx-chip ctx-pay pay-${paymentFamily(payment).toLowerCase()}"><span class="material-symbols-rounded">${isLocalPixPayment(payment) ? 'qr_code_2' : (PAYMENT_FAMILIES.find(f => f.id === paymentFamily(payment))?.icon || 'payments')}</span>${escapeHtml(payment.name)}</span>`
        : '<span class="ctx-chip ctx-warn"><span class="material-symbols-rounded">touch_app</span>Escolha o pagamento</span>'
    ].join('');

    ['amountContext', 'batchAmountContext'].forEach(id => {
      const node = $(id);
      if (node) node.innerHTML = html;
    });

    document.body.dataset.payFamily =
      payment ? paymentFamily(payment).toLowerCase() : '';
  }
  const OPENING_SOURCE_LABELS = {
    SALDO_ANTERIOR: 'Fechamento anterior',
    SALDO_ANTERIOR_SEM_FECHAMENTO: 'Inclui dias sem fechamento',
    FECHAMENTO: 'Do dia',
    INICIAL_ZERO: 'Sem histórico',
    MANUAL: 'Ajustado',
    REGISTRADO: 'Registrado'
  };

  function openingSourceText(summary) {
    const source = String(summary?.openingSource || '').toUpperCase();
    if (!source) return '';
    const label = OPENING_SOURCE_LABELS[source] || '';
    const ref = summary?.openingReferenceDate;
    if (source === 'SALDO_ANTERIOR' && ref) return 'Fech. ' + brDate(ref).slice(0, 5);
    return label;
  }

  function revenueGroupTotals() {
    const groups = {};
    const order = [];
    const names = {};

    (state.library?.revenueTypes || []).forEach(type => {
      names[type.id] = type;
    });

    state.entries
      .filter(entry => entry.type !== 'DESPESA' && entry.status !== 'EXCLUIDO')
      .forEach(entry => {
        const key = String(entry.categoryId || 'SEM_GRUPO');
        if (!groups[key]) {
          groups[key] = {
            id: key,
            name: names[key]?.name || entry.categoryContaAzulName || 'Balcão',
            icon: names[key]?.icon || 'point_of_sale',
            color: names[key]?.color || '#0f6ee8',
            cents: 0,
            count: 0
          };
          order.push(key);
        }
        groups[key].cents += Number(entry.amountCents || 0);
        groups[key].count += 1;
      });

    return order.map(key => groups[key]);
  }

  function renderSummary(){
    const s=state.summary||{};$('cashOpening').textContent=money(s.openingCashCents);$('cashExpected').textContent=money(s.expectedCashCents);$('cashWithdrawals').textContent=money(s.withdrawalsCents);
    $('summaryRevenue').textContent=money(s.revenueCents);$('summaryExpense').textContent=money(s.expenseCents);$('summaryNet').textContent=money(s.netCents);

    const openingSource = $('cashOpeningSource');
    if (openingSource) {
      openingSource.textContent = openingSourceText(s);
    }

    const openingButton = $('btnOpeningInfo');
    if (openingButton) {
      openingButton.classList.toggle('can-adjust', canAdjustOpening());
    }

    const payments = (state.library?.payments || [])
      .map(payment => ({
        payment,
        cents: Number(s.byPayment?.[payment.id] || 0),
        count: Number(s.countByPayment?.[payment.id] || 0)
      }))
      .filter(item => item.cents > 0 || item.count > 0);

    const groups = revenueGroupTotals();
    const groupHtml = groups.length > 1 || (groups.length === 1 && categories().length > 1 && state.type === 'RECEITA')
      ? `<div class="group-summary">${groups.map(g => `
          <div class="group-chip" style="--option-color:${escapeHtml(g.color)}">
            <span class="material-symbols-rounded">${escapeHtml(g.icon)}</span>
            <small>${escapeHtml(g.name)}<em>${g.count}</em></small>
            <strong>${money(g.cents)}</strong>
          </div>`).join('')}</div>`
      : '';

    $('paymentSummary').innerHTML =
      groupHtml +
      (payments.length
        ? payments.map(item => `
            <div class="payment-chip pay-${paymentFamily(item.payment).toLowerCase()}">
              <span class="material-symbols-rounded">${isLocalPixPayment(item.payment) ? 'qr_code_2' : (PAYMENT_FAMILIES.find(f => f.id === paymentFamily(item.payment))?.icon || 'payments')}</span>
              <small>${escapeHtml(item.payment.name)}<em>${item.count}</em></small>
              <strong>${money(item.cents)}</strong>
            </div>`).join('')
        : '<div class="payment-chip empty"><small>Nenhuma receita ainda</small></div>');
  }

  const MODE_LABELS = {
    ATENDIMENTO: 'Atender',
    AVULSO: 'Avulso',
    LOTE: 'Lote',
    INDIVIDUAL: 'Individual'
  };

  function splitDecorated(value) {
    const parts = String(value || '').split('·').map(part => part.trim()).filter(Boolean);
    const time = parts.length >= 3 ? parts[parts.length - 1] : '';
    return { head: parts[0] || '', time };
  }

  function movementTime(item) {
    try {
      const date = new Date(item.createdAt);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: state.timezone || 'America/Fortaleza',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).format(date);
    } catch (_) {
      return '';
    }
  }

  function canDeleteEntry(entry) {
    const contaAzulStatus = String(entry?.contaAzulStatus || '').toUpperCase();
    return Boolean(
      entry &&
      !entry.closureId &&
      ['', 'NAO_ENVIADO', 'CANCELADO'].includes(contaAzulStatus)
    );
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

    const groupNames = {};
    (state.library?.revenueTypes || []).forEach(type => { groupNames[type.id] = type.name; });
    const showGroups = categories().length > 1 || (state.library?.revenueTypes || []).length > 1;

    $('movementList').innerHTML =
      movements.length
        ? movements.map(item => {
            if (item.kind === 'WITHDRAWAL') {
              const withdrawal = item.data;
              const who = splitDecorated(withdrawal.operatorName).head;

              return `
                <article class="movement-item withdrawal">
                  <span class="mv-icon"><span class="material-symbols-rounded">outbox</span></span>
                  <div class="movement-main">
                    <h4>Sangria</h4>
                    <p>
                      <span class="mv-time">${escapeHtml(movementTime(item))}</span>
                      ${who ? `<span>${escapeHtml(who)}</span>` : ''}
                      ${withdrawal.closureId ? '<span class="mv-lock"><span class="material-symbols-rounded">lock</span>Consolidada</span>' : ''}
                    </p>
                    ${withdrawal.pdfUrl
                      ? `<div class="movement-actions"><a class="movement-link" href="${escapeHtml(withdrawal.pdfUrl)}" target="_blank" rel="noopener"><span class="material-symbols-rounded">picture_as_pdf</span>PDF</a></div>`
                      : ''}
                  </div>
                  <strong class="mv-amount">- ${money(withdrawal.amountCents)}</strong>
                </article>
              `;
            }

            const entry = item.data;
            const pending = isPendingPixEntry(entry);
            const canDelete = canDeleteEntry(entry);
            const payment = paymentById(entry.paymentId) || {
              id: entry.paymentId,
              name: entry.paymentName,
              contaAzulMethod: entry.paymentContaAzulMethod
            };
            const family = paymentFamily(payment).toLowerCase();
            const expense = entry.type === 'DESPESA';
            const mode = splitDecorated(entry.mode).head.toUpperCase();
            const note = String(entry.description || '').trim();
            const title = expense
              ? (note || entry.categoryContaAzulName || entry.categoryId)
              : (showGroups ? (groupNames[entry.categoryId] || 'Balcão') : (MODE_LABELS[mode] || 'Receita'));
            const icon = expense
              ? 'remove_circle'
              : (isLocalPixPayment(payment) ? 'qr_code_2' : (PAYMENT_FAMILIES.find(f => f.id === paymentFamily(payment))?.icon || 'payments'));

            return `
              <article class="movement-item ${expense ? 'expense' : `pay-${family}`} ${pending ? 'pix-pending' : ''}">
                <span class="mv-icon"><span class="material-symbols-rounded">${icon}</span></span>
                <div class="movement-main">
                  <h4>${escapeHtml(title)}</h4>
                  <p>
                    <span class="mv-time">${escapeHtml(movementTime(item))}</span>
                    <span>${escapeHtml(entry.paymentName || entry.paymentId)}</span>
                    ${!expense && showGroups && !entry.batchId ? `<span>${escapeHtml(MODE_LABELS[mode] || mode)}</span>` : ''}
                    ${entry.batchId ? `<span>Lote #${escapeHtml(entry.batchIndex || '')}</span>` : ''}
                    ${!expense && Number(entry.objectCount || 0) > 0 ? `<span class="mv-obj"><span class="material-symbols-rounded">inventory_2</span>${escapeHtml(entry.objectCount)}</span>` : ''}
                    ${pending ? '<span class="mv-pending">Pix pendente</span>' : ''}
                    ${entry.closureId ? '<span class="mv-lock"><span class="material-symbols-rounded">lock</span>Consolidado</span>' : ''}
                  </p>
                  ${!expense && note && note !== 'Atendimento de balcão' && !/^Atendimento de balcão - /.test(note)
                    ? `<p class="mv-note">${escapeHtml(note)}</p>`
                    : ''}
                  ${pending || canDelete
                    ? `<div class="movement-actions">
                        ${pending
                          ? `<button class="movement-pix-action" type="button" data-open-pending-pix="${escapeHtml(entry.id)}">
                              <span class="material-symbols-rounded">qr_code_2</span>
                              Abrir cobrança
                            </button>`
                          : ''}
                        ${canDelete
                          ? `<button class="movement-delete-action" type="button" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Excluir lançamento de ${escapeHtml(money(entry.amountCents))}">
                              <span class="material-symbols-rounded">delete</span>
                              Excluir
                            </button>`
                          : ''}
                      </div>`
                    : ''}
                </div>
                <strong class="mv-amount">${expense ? '- ' : ''}${money(entry.amountCents)}</strong>
              </article>
            `;
          }).join('')
        : `
          <div class="movement-empty">
            <span class="material-symbols-rounded">receipt_long</span>
            <strong>Sem movimentos hoje</strong>
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

    const closed = Boolean(state.closure);

    $('btnCloseCash').disabled =
      Boolean(
        closed ||
        hasPixPending
      );

    [
      'countedCash',
      'closingWithdrawal',
      'closingDestination',
      'closingNotes',
      'closeDeclaration'
    ].forEach(id => {
      const field = $(id);
      if (field) field.disabled = closed;
    });

    updateCloseMath();
    if(state.closure){const links=[];if(state.closure.pdfUrl)links.push(`<a href="${escapeHtml(state.closure.pdfUrl)}" target="_blank"><span class="material-symbols-rounded">picture_as_pdf</span> PDF do fechamento</a>`);$('closeLinks').classList.toggle('hidden',!links.length);$('closeLinks').innerHTML=links.join('');}
  }
  function updateCloseMath(){const counted=parseMoney($('countedCash').value),withdraw=parseMoney($('closingWithdrawal').value),expected=state.summary?.expectedCashCents||0;$('closeDifference').textContent=money(counted-expected);$('closeCarryover').textContent=money(Math.max(0,counted-withdraw));}

  function changeType(type){state.type=type;state.mode=type==='RECEITA'?'ATENDIMENTO':'INDIVIDUAL';state.selectedCategory='';state.selectedPayment='';state.amountCents=0;state.batchAmountCents=0;state.batchItems=[];state.selectedClient=null;chooseDefaults();renderAll();clearStatus('launchStatus');}
  function changeMode(mode){state.mode=mode;state.amountCents=0;state.batchAmountCents=0;state.batchItems=[];state.selectedClient=null;chooseDefaults();renderAll();}
  function handleKey(target,key){const prop=target==='batch'?'batchAmountCents':'amountCents';if(/^\d$/.test(key))state[prop]=Math.min(999999999,state[prop]*10+Number(key));else if(key==='backspace')state[prop]=Math.floor(state[prop]/10);else state[prop]=0;renderEntryForm();}

  function draft(amountCents,extra={}){
    const category = selectedCategory();
    const payment = selectedPayment();

    const client =
      state.type === 'RECEITA' &&
      state.mode === 'ATENDIMENTO'
        ? (resolveAttendanceClient() || DEFAULT_CLIENT)
        : null;

    return {
      entryId: extra.entryId || '',
      type: state.type,
      mode: state.mode,
      date: currentDate(),
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
      return status('launchStatus','Digite o valor.','warning');
    }

    const category = selectedCategory();
    const payment = selectedPayment();

    if (!category || !payment) {
      return status(
        'launchStatus',
        'Selecione tipo e pagamento.',
        'warning'
      );
    }

    if (
      isLocalPixPayment(payment) &&
      !shouldGenerateLocalPix(payment)
    ) {
      return status(
        'launchStatus',
        'Pix Santander está disponível apenas no modo Atender.',
        'warning'
      );
    }

    const generateLocalPix =
      shouldGenerateLocalPix(payment);

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

      const entryId = stableEntryId();

      const result = await callApi(
        'saveEntry',
        {
          payload: draft(
            state.amountCents,
            { entryId }
          )
        }
      );

      applySaveResult(result);

      rememberSavedDetail(
        result?.entry?.amountCents || state.amountCents,
        payment
      );

      status(
        'launchStatus',
        state.type === 'RECEITA'
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
    if (!payment || !isPixPayment(payment)) {
      throw new Error(
        'A forma de pagamento selecionada não é Pix.'
      );
    }

    if (!shouldGenerateLocalPix(payment)) {
      throw new Error(
        'A cobrança Pix só pode ser gerada no modo Atender.'
      );
    }

    const config = requirePixConfig(payment);
    const amountCents = state.amountCents;
    const entryId = stableEntryId();

    if (!state.pendingPixTxid) {
      state.pendingPixTxid = generateLocalPixTxid();
    }

    const pixTxid = state.pendingPixTxid;
    const pixPayload = buildLocalPixPayload(
      config,
      amountCents,
      pixTxid
    );

    savePendingPixPayload(entryId,pixPayload);

    let saved;

    try {
      saved = await callApi(
        'saveEntry',
        {
          payload: draft(
            amountCents,
            {
              entryId,
              pixStatus:'PENDENTE',
              pixTxid,
              pixProvider:'local'
            }
          )
        }
      );
    } catch (error) {
      throw error;
    }

    applySaveResult(saved);

    state.pixEntry = saved.entry;
    state.pixPayload = pixPayload;

    $('btnCopyPix').disabled = false;
    $('btnSharePix').disabled = false;
    $('btnDownloadPix').disabled = false;
    $('pixReceivedDeclaration').checked = false;
    $('btnConfirmManualPix').disabled = true;

    $('pixAmount').textContent = money(amountCents);
    $('pixCode').value = pixPayload;

    const qrRendered = renderQr(pixPayload);

    openModal('pixModal');

    status(
      'pixStatus',
      qrRendered
        ? 'Aguardando pagamento. Confirme somente depois de conferir o crédito.'
        : 'O Pix foi gerado. Use o Copia e Cola porque o QR Code não carregou.',
      qrRendered ? 'info' : 'warning'
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

    $('pixReceivedDeclaration').checked = false;
    $('btnConfirmManualPix').disabled = true;

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

    if (!$('pixReceivedDeclaration').checked) {
      status(
        'pixStatus',
        'Marque que você conferiu o crédito na conta Santander.',
        'warning'
      );
      return;
    }

    setBusy(true,'Confirmando Pix...');

    try {
      const result = await callApi(
        'syncPixPayment',
        {
          payload:{
            entryId:state.pixEntry.id,
            txid:state.pixEntry.pixTxid || '***',
            status:'CONFIRMADO',
            amountCents:state.pixEntry.amountCents,
            provider:'local'
          }
        }
      );

      const index = state.entries.findIndex(
        entry => entry.id === state.pixEntry.id
      );

      if (index >= 0 && result.entry) {
        state.entries[index] = result.entry;
      }

      state.summary = result.summary || state.summary;

      clearPendingPixPayload(state.pixEntry.id);

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

  function leavePixPending() {
    if (!state.pixEntry) {
      closeModal('pixModal');
      return;
    }

    closeModal('pixModal');
    resetEntry();
    renderAll();

    status(
      'launchStatus',
      'Cobrança Pix mantida como pendente. Abra Mov. para continuar depois.',
      'warning'
    );
  }

  async function cancelManualPix() {
    if (!state.pixEntry) {
      closeModal('pixModal');
      return;
    }

    const confirmed = window.confirm(
      'Cancelar esta cobrança Pix? O cancelamento ficará registrado na auditoria.'
    );

    if (!confirmed) {
      return;
    }

    setBusy(true,'Cancelando cobrança Pix...');

    try {
      const entryId = state.pixEntry.id;

      const result = await callApi(
        'deleteEntry',
        {
          payload:{
            entryId,
            reason:'Cobrança Pix cancelada no atendimento'
          }
        }
      );

      state.entries = state.entries.filter(
        entry => entry.id !== entryId
      );

      state.summary = result.summary || state.summary;

      clearPendingPixPayload(entryId);

      closeModal('pixModal');
      resetEntry();
      renderAll();

      status(
        'launchStatus',
        'Cobrança Pix cancelada e auditada.',
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

    const cleanReason =
      await askDeleteReason(entry);

    if (!cleanReason) {
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

      lastSavedDetail =
        `<b>${escapeHtml(money(entry.amountCents))}</b> · ${escapeHtml(entry.paymentName || entry.paymentId)}`;

      status(
        'movementStatus',
        'Lançamento excluído.',
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

  const DELETE_REASONS = [
    'Valor errado',
    'Forma de pagamento errada',
    'Lançado em duplicidade',
    'Cliente desistiu'
  ];

  function askDeleteReason(entry) {
    return new Promise(resolve => {
      const modal = $('deleteModal');

      if (!modal) {
        const typed = window.prompt('Informe o motivo da exclusão deste registro:');
        const clean = String(typed || '').replace(/\s+/g, ' ').trim();
        resolve(clean.length >= 3 ? clean : '');
        return;
      }

      const summary = $('deleteSummary');
      const chips = $('deleteReasons');
      const input = $('deleteReasonInput');
      const confirm = $('btnConfirmDelete');
      const statusBox = $('deleteStatus');

      summary.innerHTML = `
        <strong>${escapeHtml(money(entry.amountCents))}</strong>
        <span>${escapeHtml(entry.paymentName || entry.paymentId)} · ${escapeHtml(movementTime(entry))}</span>`;

      chips.innerHTML = DELETE_REASONS.map(reason =>
        `<button type="button" class="reason-chip" data-reason="${escapeHtml(reason)}">${escapeHtml(reason)}</button>`
      ).join('');

      input.value = '';
      confirm.disabled = true;
      statusBox.className = 'status-box';
      statusBox.textContent = '';

      const current = () => String(input.value || '').replace(/\s+/g, ' ').trim();

      const sync = () => {
        const value = current();
        confirm.disabled = value.length < 3 || value.length > 250;
        chips.querySelectorAll('[data-reason]').forEach(chip => {
          chip.classList.toggle('active', chip.dataset.reason === value);
        });
      };

      const onChip = event => {
        const chip = event.target.closest('[data-reason]');
        if (!chip) return;
        input.value = chip.dataset.reason;
        sync();
      };

      const finish = value => {
        chips.removeEventListener('click', onChip);
        input.removeEventListener('input', sync);
        confirm.removeEventListener('click', onConfirm);
        modal.querySelectorAll('[data-close="deleteModal"]').forEach(button => button.removeEventListener('click', onCancel));
        modal.removeEventListener('click', onBackdrop);
        closeModal('deleteModal');
        resolve(value);
      };

      const onConfirm = () => {
        const value = current();
        if (value.length < 3) {
          statusBox.textContent = 'Informe o motivo com pelo menos 3 caracteres.';
          statusBox.className = 'status-box show warning';
          return;
        }
        finish(value.slice(0, 250));
      };
      const onCancel = () => finish('');
      const onBackdrop = event => { if (event.target === modal) finish(''); };

      chips.addEventListener('click', onChip);
      input.addEventListener('input', sync);
      confirm.addEventListener('click', onConfirm);
      modal.querySelectorAll('[data-close="deleteModal"]').forEach(button => button.addEventListener('click', onCancel));
      modal.addEventListener('click', onBackdrop);

      openModal('deleteModal');
    });
  }

  /* SALDO INICIAL: ajuste por gestor (backend valida perfil e permissão). */
  function canAdjustOpening() {
    const role = String(state.user?.role || '').toLowerCase();
    return Boolean(
      !state.closure &&
      state.library?.permissions?.close &&
      ['admin', 'manager'].includes(role)
    );
  }

  function openOpeningModal() {
    const s = state.summary || {};
    $('openingCurrent').textContent = money(s.openingCashCents);
    $('openingSourceText').textContent =
      String(s.openingSource || '').toUpperCase() === 'SALDO_ANTERIOR' && s.openingReferenceDate
        ? 'Ficou na gaveta no fechamento de ' + brDate(s.openingReferenceDate)
        : (openingSourceText(s) || 'Saldo em dinheiro no início do dia');
    $('openingAdjust').classList.toggle('hidden', !canAdjustOpening());
    $('openingAmount').value = '';
    clearStatus('openingStatus');
    openModal('openingModal');
  }

  async function saveOpeningBalance() {
    const amount = parseMoney($('openingAmount').value);
    const raw = String($('openingAmount').value || '').trim();

    if (!raw) {
      return status('openingStatus', 'Informe o valor contado na gaveta.', 'warning');
    }

    const ok = window.confirm(
      'Ajustar o saldo inicial de hoje para ' + money(amount) + '?\n\nO ajuste fica registrado em seu nome.'
    );
    if (!ok) return;

    setBusy(true, 'Ajustando saldo inicial...');
    try {
      const result = await callApi('setOpeningBalance', {
        date: currentDate(),
        amountCents: amount
      });
      state.summary = result.summary || state.summary;
      closeModal('openingModal');
      renderAll();
      lastSavedDetail = `<b>${escapeHtml(money(amount))}</b>`;
      status('launchStatus', 'Saldo inicial ajustado.', 'success');
    } catch (error) {
      status('openingStatus', error.message || 'Não foi possível ajustar.', 'error');
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
      amountCents,
      entryId: uid()
    });

    state.batchAmountCents = 0;

    renderModes();
    renderEntryForm();

    clearStatus('launchStatus');
  }

  async function saveBatch(){
    if(!state.batchItems.length){
      return status(
        'launchStatus',
        'Adicione pelo menos um valor.',
        'warning'
      );
    }

    if(!selectedCategory() || !selectedPayment()){
      return status(
        'launchStatus',
        'Selecione tipo e pagamento.',
        'warning'
      );
    }

    if(isLocalPixPayment(selectedPayment())){
      return status(
        'launchStatus',
        'Pix Santander não pode ser lançado em lote.',
        'warning'
      );
    }

    setBusy(true,'Salvando lote...');

    try{
      const payloads = state.batchItems.map(
        item => draft(
          item.amountCents,
          { entryId:item.entryId }
        )
      );

      const result = await callApi(
        'saveBatch',
        { payloads }
      );

      const returned = result.entries || [];

      returned.forEach(entry => {
        const exists = state.entries.some(
          item => item.id === entry.id
        );
        if (!exists) state.entries.push(entry);
      });

      rememberSavedDetail(
        state.batchItems.reduce((total, item) => total + item.amountCents, 0),
        selectedPayment()
      );

      state.summary = result.summary;
      state.batchItems = [];
      state.batchAmountCents = 0;
      renderAll();

      status(
        'launchStatus',
        `${returned.length || payloads.length} lançamentos salvos.`,
        'success'
      );
    }catch(error){
      status('launchStatus',error.message,'error');
    }finally{
      setBusy(false);
    }
  }

  function applySaveResult(result){if(result.entry)state.entries.push(result.entry);state.summary=result.summary||state.summary;renderAll();}
  function resetEntry() {
    state.amountCents = 0;
    state.objectCount = 1;
    state.selectedClient = null;
    state.pixEntry = null;
    state.pixPayload = '';
    state.pendingEntryId = '';
    state.pendingEntryFingerprint = '';
    state.pendingPixTxid = '';

    $('clientInput').value = '';
    $('descriptionInput').value = '';

    renderEntryForm();
  }

  async function saveWithdrawal(){
    const amount=parseMoney($('withdrawalAmount').value);
    const available=Number(state.summary?.expectedCashCents||0);

    if(!(amount>0)){
      return status(
        'withdrawalStatus',
        'Informe o valor.',
        'warning'
      );
    }

    if(amount>available){
      return status(
        'withdrawalStatus',
        'A sangria não pode ser maior que o dinheiro disponível.',
        'warning'
      );
    }

    setBusy(true,'Registrando sangria e gerando PDF...');

    try{
      const withdrawalId = stableWithdrawalId();

      const result = await callApi(
        'createWithdrawal',
        {
          payload:{
            withdrawalId,
            date:currentDate(),
            amountCents:amount,
            destination:'Financeiro',
            notes:'',
            confirmed:true
          }
        }
      );

      if (!state.withdrawals.some(item => item.id === result.withdrawal.id)) {
        state.withdrawals.push(result.withdrawal);
      }

      state.pendingWithdrawalId = '';
      state.pendingWithdrawalFingerprint = '';
      state.summary=result.summary;
      closeModal('withdrawalModal');
      renderAll();

      status(
        'launchStatus',
        result.withdrawal.pdfUrl
          ? 'Sangria registrada e PDF gerado.'
          : 'Sangria registrada. PDF pendente.',
        'success'
      );
    }catch(error){
      status('withdrawalStatus',error.message,'error');
    }finally{
      setBusy(false);
    }
  }
  function updateWithdrawalMath(){const amount=parseMoney($('withdrawalAmount').value),available=state.summary?.expectedCashCents||0;$('withdrawalRemaining').textContent=money(available-amount);}

  async function closeCash(){
    if(state.closure) return;

    if(!$('closeDeclaration').checked){
      return status(
        'closeStatus',
        'Confirme a declaração de conferência.',
        'warning'
      );
    }

    const counted=parseMoney($('countedCash').value);
    const closing=parseMoney($('closingWithdrawal').value);
    const expected=state.summary?.expectedCashCents||0;
    const difference=counted-expected;
    const carryover=Math.max(0,counted-closing);

    const confirmed = window.confirm(
      [
        'Confirmar fechamento definitivo?',
        '',
        'Unidade: ' + (state.library?.unit?.name || ''),
        'Esperado na gaveta: ' + money(expected),
        'Dinheiro contado: ' + money(counted),
        'Diferença: ' + money(difference),
        'Sangria no fechamento: ' + money(closing),
        'Ficará no caixa: ' + money(carryover)
      ].join('\n')
    );

    if (!confirmed) return;

    setBusy(
      true,
      'Fechando caixa, gerando PDF e enviando ao Conta Azul...'
    );

    try{
      const result=await callApi(
        'closeCash',
        {
          payload:{
            date:currentDate(),
            countedCashCents:counted,
            closingWithdrawalCents:closing,
            withdrawalDestination:'Financeiro',
            notes:'',
            declarationConfirmed:true
          }
        }
      );

      state.closure=result.closure;
      state.summary=result.summary||state.summary;
      renderAll();

      const caStatus = String(
        state.closure?.contaAzulStatus || ''
      );

      status(
        'closeStatus',
        state.closure.pdfUrl
          ? 'Caixa fechado. PDF salvo. Conta Azul: ' + (caStatus || 'PENDENTE') + '.'
          : 'Caixa fechado. PDF aguardando nova tentativa. Conta Azul: ' + (caStatus || 'PENDENTE') + '.',
        'success'
      );
    }catch(error){
      status('closeStatus',error.message,'error');
    }finally{
      setBusy(false);
    }
  }

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
    $('btnOpenWithdrawal').addEventListener('click',()=>{
      state.pendingWithdrawalId='';
      state.pendingWithdrawalFingerprint='';
      $('withdrawalAvailable').textContent=money(state.summary?.expectedCashCents||0);
      $('withdrawalAmount').value='';
      updateWithdrawalMath();
      clearStatus('withdrawalStatus');
      openModal('withdrawalModal');
    });
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
        leavePixPending
      );
    $('btnRefresh').addEventListener('click',refresh);
    $('btnOpeningInfo')?.addEventListener('click',openOpeningModal);
    $('btnSaveOpening')?.addEventListener('click',saveOpeningBalance);
    $('caixaToast')?.addEventListener('click',hideFeedback);
    $('btnMovementRefresh').addEventListener('click',refresh);

    $('btnSwitchUnit')?.addEventListener(
      'click',
      () => window.CaixaUnitContext?.clearSelection?.()
    );

    $('pixReceivedDeclaration').addEventListener(
      'change',
      () => {
        $('btnConfirmManualPix').disabled =
          !$('pixReceivedDeclaration').checked;
      }
    );
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&m.id!=='pixModal')closeModal(m.id);}));
    document.addEventListener('click',e=>{if(!e.target.closest('#clientSection'))$('clientSuggestions').classList.add('hidden');});
  }

  clearLegacyPixConfig();

  try {
    localStorage.removeItem(STORAGE.API);
  } catch (_) {}

  bind();
  refresh();
})();
