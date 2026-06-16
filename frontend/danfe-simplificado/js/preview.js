/* =====================================================
   Minhas Postagens — DANFE Simplificado Etiqueta 10x15
   Versão final para conferência e impressão 10x15.
   Revisão v11: fallback controlado de IE do emitente por CNPJ conhecido.
   ===================================================== */
(function () {
  'use strict';
  const STORAGE_KEY = 'agf_danfe_simplificado_preview_v2';
  const $ = id => document.getElementById(id);
  let state = null;
  let sampleId = '';

  function digits(v) { return String(v == null ? '' : v).replace(/\D+/g, ''); }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function text(v, fallback) { const s = String(v == null ? '' : v).trim(); return s || (arguments.length > 1 ? fallback : '—'); }
  function nonEmpty(v) { return String(v == null ? '' : v).trim() !== ''; }
  function upper(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function money(v) { const n = Number(v || 0); return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }); }
  function parseMoney(v) { const raw=String(v==null?'':v).trim().replace(/R\$|\s/g,''); if(!raw)return 0; const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.') : raw; const n=Number(normalized.replace(/[^0-9.-]/g,'')); return Number.isFinite(n)?n:0; }
  function formatDoc(v) { const d=digits(v); if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'); if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'); return v||'—'; }
  function groupKey(v) { return digits(v).replace(/(\d{4})(?=\d)/g,'$1 ').trim(); }
  function cnpjFromAccessKey(v) { const d=digits(v); return d.length===44 ? d.slice(6,20) : ''; }
  function knownEmitenteIeByCnpj(v) { const map = { '50144817000101': '071283200' }; return map[digits(v)] || ''; }
  function ufFromAccessKey(v) { const d=digits(v); const map={11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'}; return d.length===44 ? (map[d.slice(0,2)]||'') : ''; }
  function sanitizeOptionalIe(v) { const s=String(v==null?'':v).trim(); if(!s)return''; if(/\b(HORA|DATA|SA[IÍ]DA|PAGAMENTO|INFORMA[CÇ][OÕ]ES|FONE|FAX|CEP)\b/i.test(s))return''; if(/\d{1,2}:\d{2}(?::\d{2})?/.test(s))return''; if(/\d{2}\/\d{2}\/\d{4}/.test(s))return''; return s; }
  function normalizePreviewDanfe(input, parsed) { const d=JSON.parse(JSON.stringify(input||{})); const raw=parsed||{}; d.nota=d.nota||{}; d.emitente=d.emitente||{}; d.destinatario=d.destinatario||{}; const rawNota=raw.nota||{}, rawEmit=raw.emitente||{}, rawDest=raw.destinatario||{}; const pick=(a,b)=>String(a==null?'':a).trim()?a:b; d.nota.tipoOperacao='SAÍDA'; d.nota.protocoloCodigoBarras=pick(d.nota.protocoloCodigoBarras,rawNota.protocoloCodigoBarras); const key=digits(pick(d.nota.chaveAcesso,rawNota.chaveAcesso)); if(key)d.nota.chaveAcesso=key; const cnpjKey=cnpjFromAccessKey(key); if(cnpjKey)d.emitente.cnpj=cnpjKey; const ufKey=ufFromAccessKey(key); if(ufKey)d.emitente.uf=ufKey; d.emitente.inscricaoEstadual=pick(d.emitente.inscricaoEstadual,rawEmit.inscricaoEstadual); if(!nonEmpty(d.emitente.inscricaoEstadual)){ const knownIe=knownEmitenteIeByCnpj(d.emitente.cnpj); if(knownIe)d.emitente.inscricaoEstadual=knownIe; } d.destinatario.cpfCnpj=pick(d.destinatario.cpfCnpj,rawDest.cpfCnpj); d.destinatario.inscricaoEstadual=sanitizeOptionalIe(pick(d.destinatario.inscricaoEstadual,rawDest.inscricaoEstadual)); return d; }

  function loadState() {
    try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { state = null; }
    if (!state || !state.parsed) {
      document.body.innerHTML = '<main style="max-width:720px;margin:40px auto;padding:24px;font-family:Inter,Arial"><h1>DANFE 10x15 indisponível</h1><p>Importe novamente o PDF da NF-e no aplicativo e clique em <strong>Abrir DANFE 10x15</strong>.</p></main>';
      return false;
    }
    return true;
  }

  function sourceDanfe() {
    const parsed = state.parsed || {};
    return normalizePreviewDanfe(parsed.danfeSimplificado || {
      nota: parsed.nota || {}, emitente: parsed.emitente || {}, destinatario: parsed.destinatario || {}, validations: [], validationSummary: {}
    }, parsed);
  }

  const fields = [
    ['notaNumero','Número da NF-e','text','nota.numero'],['notaSerie','Série','text','nota.serie'],['dataEmissao','Data de emissão','text','nota.dataEmissao'],['tipoOperacao','Tipo de operação','select','nota.tipoOperacao'],
    ['valorTotalNota','Valor total da NF-e','text','nota.valorTotal'],
    ['chaveAcesso','Chave de acesso — 44 dígitos','text','nota.chaveAcesso','wide'],['protocoloAutorizacao','Protocolo de autorização','text','nota.protocoloAutorizacao'],['protocoloCodigoBarras','Código de barras do protocolo','text','nota.protocoloCodigoBarras','wide'],['protocoloEpec','Protocolo EPEC, quando houver','text','nota.protocoloEpec','wide'],
    ['emitenteNome','Emitente — nome / razão social','text','emitente.nomeRazaoSocial','wide'],['emitenteCnpj','CNPJ do emitente','text','emitente.cnpj'],['emitenteIe','IE do emitente','text','emitente.inscricaoEstadual'],['emitenteUf','UF do emitente','text','emitente.uf'],
    ['destinatarioNome','Destinatário — nome / razão social','text','destinatario.nomeRazaoSocial','wide'],['destinatarioCpfCnpj','CPF/CNPJ do destinatário','text','destinatario.cpfCnpj'],['destinatarioIe','IE do destinatário, quando houver','text','destinatario.inscricaoEstadual'],['destinatarioUf','UF do destinatário','text','destinatario.uf']
  ];

  function getPath(obj, path) { return path.split('.').reduce((acc,key)=>acc&&acc[key]!==undefined?acc[key]:'', obj); }
  function setPath(obj, path, value) { const parts=path.split('.'); let cur=obj; parts.forEach((key,i)=>{ if(i===parts.length-1)cur[key]=value; else cur=cur[key]||(cur[key]={}); }); }

  function renderForm() {
    const data = sourceDanfe();
    if ($('sourceInfo')) $('sourceInfo').textContent = 'Arquivo: ' + text(state.fileName, 'DANFE.pdf') + ' · Origem: ' + text(state.portal, 'app') + ' · Esta tela permite corrigir a prévia sem alterar automaticamente a NF-e original.';
    if (!$('reviewForm')) return;
    $('reviewForm').innerHTML = fields.map(([id,label,type,path,wide]) => {
      const value = getPath(data,path);
      const input = type === 'select'
        ? '<select id="'+id+'"><option value="SAÍDA" '+(upper(value)!=='ENTRADA'?'selected':'')+'>SAÍDA</option><option value="ENTRADA" '+(upper(value)==='ENTRADA'?'selected':'')+'>ENTRADA</option></select>'
        : '<input id="'+id+'" value="'+esc(value)+'">';
      return '<div class="field '+(wide||'')+'" data-field="'+id+'"><label for="'+id+'">'+esc(label)+'</label>'+input+'</div>';
    }).join('');
    fields.forEach(([id]) => { const el=$(id); if(el)el.addEventListener('input', refreshAll); });
  }

  function currentReviewed() {
    const initial = JSON.parse(JSON.stringify(sourceDanfe()));
    fields.forEach(([id,,,path]) => { const el=$(id); setPath(initial,path,el?el.value:''); });
    initial.nota.chaveAcesso = digits(initial.nota.chaveAcesso);
    initial.nota.protocoloAutorizacao = digits(initial.nota.protocoloAutorizacao);
    initial.nota.protocoloCodigoBarras = digits(initial.nota.protocoloCodigoBarras);
    initial.nota.protocoloEpec = digits(initial.nota.protocoloEpec);
    initial.nota.tipoOperacao = 'SAÍDA';
    initial.nota.valorTotal = parseMoney(initial.nota.valorTotal);
    initial.emitente.cnpj = digits(initial.emitente.cnpj);
    if (!nonEmpty(initial.emitente.inscricaoEstadual)) {
      const knownIe = knownEmitenteIeByCnpj(initial.emitente.cnpj);
      if (knownIe) initial.emitente.inscricaoEstadual = knownIe;
    }
    initial.emitente.uf = upper(initial.emitente.uf);
    initial.destinatario.cpfCnpj = digits(initial.destinatario.cpfCnpj);
    initial.destinatario.inscricaoEstadual = sanitizeOptionalIe(initial.destinatario.inscricaoEstadual);
    initial.destinatario.uf = upper(initial.destinatario.uf);
    initial.mode='DANFE_10X15';
    initial.watermark='';
    initial.operationalPrintAllowed=true;
    const validations=validate(initial);
    initial.validations=validations;
    initial.validationSummary={ ok:validations.filter(x=>x.status==='ok').length, warnings:validations.filter(x=>x.status==='warn').length, errors:validations.filter(x=>x.status==='error').length };
    initial.requiredMissing=validations.filter(x=>x.status==='error').map(x=>x.label);
    return initial;
  }

  function validAccessKey(key) { const d=digits(key); if(d.length!==44)return false; let sum=0,w=2; for(let i=42;i>=0;i--){sum+=Number(d[i])*w;w++;if(w>9)w=2;} const mod=sum%11,dv=(mod===0||mod===1)?0:11-mod; return dv===Number(d[43]); }
  function validCpf(cpf){const d=digits(cpf);if(d.length!==11||/^(\d)\1+$/.test(d))return false;const calc=(base,f)=>{let sum=0;for(let i=0;i<base.length;i++)sum+=Number(base[i])*(f-i);const r=(sum*10)%11;return r===10?0:r};return calc(d.slice(0,9),10)===Number(d[9])&&calc(d.slice(0,10),11)===Number(d[10]);}
  function validCnpj(cnpj){const d=digits(cnpj);if(d.length!==14||/^(\d)\1+$/.test(d))return false;const calc=(base,w)=>{let s=0;for(let i=0;i<w.length;i++)s+=Number(base[i])*w[i];const r=s%11;return r<2?0:11-r};return calc(d.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[12])&&calc(d.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[13]);}
  function validDoc(doc){const d=digits(doc);return d.length===11?validCpf(d):(d.length===14?validCnpj(d):false);}
  function item(field,label,status,message){return{field,label,status,message};}
  function validate(d){
    const n=d.nota||{},e=d.emitente||{},x=d.destinatario||{};
    const key=digits(n.chaveAcesso), cnpj=digits(e.cnpj), doc=digits(x.cpfCnpj);
    return [
      item('chaveAcesso','Chave de acesso',validAccessKey(key)?'ok':'error',key.length===44?'Dígito verificador inválido.':'Informe 44 dígitos.'),
      item('protocoloAutorizacao','Protocolo de autorização',digits(n.protocoloAutorizacao).length>=12?'ok':'error','Protocolo não identificado.'),
      item('notaNumero','Número da NF-e',nonEmpty(n.numero)?'ok':'error','Número não identificado.'), item('notaSerie','Série',nonEmpty(n.serie)?'ok':'error','Série não identificada.'),
      item('dataEmissao','Data de emissão',nonEmpty(n.dataEmissao)?'ok':'error','Data não identificada.'), item('tipoOperacao','Tipo de operação',nonEmpty(n.tipoOperacao)?'ok':'error','Selecione entrada ou saída.'),
      item('valorTotalNota','Valor total da NF-e',Number(n.valorTotal||0)>0?'ok':'error','Valor total não identificado.'),
      item('emitenteNome','Emitente',nonEmpty(e.nomeRazaoSocial)?'ok':'error','Emitente não identificado.'), item('emitenteCnpj','CNPJ do emitente',validCnpj(cnpj)?'ok':'error',cnpj?'CNPJ inválido.':'CNPJ não identificado.'),
      item('emitenteIe','IE do emitente',nonEmpty(e.inscricaoEstadual)?'ok':'error','IE do emitente não identificada.'), item('emitenteUf','UF do emitente',/^[A-Z]{2}$/.test(upper(e.uf))?'ok':'error','UF inválida.'),
      item('destinatarioNome','Destinatário',nonEmpty(x.nomeRazaoSocial)?'ok':'error','Destinatário não identificado.'), item('destinatarioCpfCnpj','CPF/CNPJ do destinatário',validDoc(doc)?'ok':'error',doc?'CPF/CNPJ inválido.':'Documento não identificado.'),
      item('destinatarioUf','UF do destinatário',/^[A-Z]{2}$/.test(upper(x.uf))?'ok':'error','UF inválida.'), item('destinatarioIe','IE do destinatário, quando houver','ok',nonEmpty(x.inscricaoEstadual)?'Identificada':'Não informada; campo opcional.')
    ];
  }

  function renderValidation(d){
    const sum=d.validationSummary; const badge=$('validationBadge');
    if (badge) { badge.className='badge '+(sum.errors?'error':sum.warnings?'warn':'ok'); badge.textContent=sum.errors?sum.errors+' pendência(s)':sum.warnings?sum.warnings+' alerta(s)':'Campos obrigatórios identificados'; }
    if ($('validationList')) $('validationList').innerHTML=d.validations.map(v=>'<div class="validation-item '+v.status+'"><span class="material-symbols-rounded">'+(v.status==='ok'?'check_circle':v.status==='warn'?'warning':'error')+'</span><div><strong>'+esc(v.label)+'</strong><small>'+esc(v.status==='ok'?(v.message||'Identificado'):v.message)+'</small></div></div>').join('');
    document.querySelectorAll('.field').forEach(el=>el.classList.remove('has-error','has-warn'));
    d.validations.forEach(v=>{const el=document.querySelector('[data-field="'+v.field+'"]');if(el&&v.status!=='ok')el.classList.add(v.status==='error'?'has-error':'has-warn');});
  }

  const CODE128_PATTERNS=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  function barcodeSvg(value){const d=digits(value);if(!d||d.length%2)return'';const vals=[105];for(let i=0;i<d.length;i+=2)vals.push(Number(d.slice(i,i+2)));let checksum=vals[0];for(let i=1;i<vals.length;i++)checksum+=vals[i]*i;vals.push(checksum%103,106);let x=8;const bars=[];vals.forEach(v=>{const p=CODE128_PATTERNS[v];for(let i=0;i<p.length;i++){const w=Number(p[i]);if(i%2===0)bars.push('<rect x="'+x+'" y="0" width="'+w+'" height="54"/>');x+=w;}});const total=x+8;return'<svg viewBox="0 0 '+total+' 54" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect width="'+total+'" height="54" fill="#fff"/><g fill="#000">'+bars.join('')+'</g></svg>';}

  function renderLabel(d){
    const n=d.nota||{},e=d.emitente||{},x=d.destinatario||{};
    const protocolBarcode=digits(n.protocoloCodigoBarras);
    $('danfeLabel').innerHTML='<div class="danfe-inner">'+
      '<div class="danfe-top"><div class="danfe-title">DANFE SIMPLIFICADO - ETIQUETA</div><div class="danfe-top-grid"><div class="danfe-nf"><strong>Operação:</strong> '+esc(text(n.tipoOperacao,'SAÍDA'))+'<br><strong>NF-e:</strong> '+esc(text(n.numero))+' · <strong>Série:</strong> '+esc(text(n.serie))+'<br><strong>Emissão:</strong> '+esc(text(n.dataEmissao))+'</div><div class="key-area"><div class="barcode key-barcode">'+barcodeSvg(n.chaveAcesso)+'</div><div class="key-number">'+esc(groupKey(n.chaveAcesso))+'</div></div></div></div>'+ 
      '<div class="row protocol-row"><div><span class="label">PROTOCOLO DE AUTORIZAÇÃO DE USO</span><span class="value">'+esc(text(n.protocoloAutorizacao))+'</span></div>'+(protocolBarcode?'<div class="protocol-barcode-wrap"><div class="barcode protocol-barcode">'+barcodeSvg(protocolBarcode)+'</div><div class="protocol-number">'+esc(groupKey(protocolBarcode))+'</div></div>':'')+'</div>'+ 
      (digits(n.protocoloEpec)?'<div class="row"><div><span class="label">PROTOCOLO DE AUTORIZAÇÃO DO EVENTO EPEC</span><span class="value">'+esc(digits(n.protocoloEpec))+'</span></div></div>':'')+
      '<h3 class="block-title">IDENTIFICAÇÃO DO EMITENTE</h3><div class="row two"><div><span class="label">NOME / RAZÃO SOCIAL</span><span class="value">'+esc(text(e.nomeRazaoSocial))+'</span></div><div><span class="label">CNPJ</span><span class="value">'+esc(formatDoc(e.cnpj))+'</span></div></div><div class="row two"><div><span class="label">INSCRIÇÃO ESTADUAL</span><span class="value">'+esc(text(e.inscricaoEstadual))+'</span></div><div><span class="label">UF</span><span class="value">'+esc(text(e.uf))+'</span></div></div>'+ 
      '<h3 class="block-title">IDENTIFICAÇÃO DO DESTINATÁRIO / REMETENTE</h3><div class="row two"><div><span class="label">NOME / RAZÃO SOCIAL</span><span class="value">'+esc(text(x.nomeRazaoSocial))+'</span></div><div><span class="label">CNPJ / CPF</span><span class="value">'+esc(formatDoc(x.cpfCnpj))+'</span></div></div><div class="row two"><div><span class="label">INSCRIÇÃO ESTADUAL, QUANDO HOUVER</span><span class="value">'+esc(text(x.inscricaoEstadual))+'</span></div><div><span class="label">UF</span><span class="value">'+esc(text(x.uf))+'</span></div></div>'+ 
      '<div class="row total-row"><div><span class="label">VALOR TOTAL DA NF-e</span><span class="value">'+esc(money(n.valorTotal))+'</span></div></div>'+ 
      '<div class="foot"><strong>CHAVE DE ACESSO</strong>'+esc(groupKey(n.chaveAcesso))+'</div></div>';
  }

  function corrections(reviewed){const original=sourceDanfe();const out={};fields.forEach(([,label,,path])=>{const a=String(getPath(original,path)||'').trim(),b=String(getPath(reviewed,path)||'').trim();if(a!==b)out[label]={extraido:a,revisado:b};});return out;}
  async function callAudit(status){const reviewed=currentReviewed();renderValidation(reviewed);renderLabel(reviewed);const url=String(state.webAppUrl||'').trim();if(!url)throw new Error('URL do extrator não encontrada. Importe novamente o PDF.');const payload={action:'saveDanfePreviewSample',portal:state.portal||'app',sessionAction:state.sessionAction||(state.portal==='superfrete'?'sfClientDashboard':'me'),sessionToken:state.sessionToken||'',sample:{sampleId,createdAt:state.createdAt,fileName:state.fileName,portal:state.portal,status,warnings:(state.parsed&&state.parsed.warnings)||[],extracted:state.parsed||{},reviewed:{danfeSimplificado:reviewed},corrections:corrections(reviewed),validationSummary:reviewed.validationSummary}};const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});const json=await resp.json();if(!json||json.ok===false)throw new Error(json&&json.error||'Não foi possível registrar a amostra.');sampleId=json.data&&json.data.sampleId||sampleId;return json.data||{};}
  function setSaveStatus(message,kind){const el=$('saveStatus'); if(!el) return; el.hidden=false;el.className='save-status '+(kind||'');el.textContent=message;}
  async function save(status){try{setSaveStatus('Registrando amostra...','');const data=await callAudit(status);setSaveStatus('Amostra registrada: '+text(data.sampleId)+'. O registro foi salvo para auditoria.','success');}catch(e){setSaveStatus(e.message||String(e),'error');}}
  function refreshAll(){const d=currentReviewed();renderValidation(d);renderLabel(d);}
  function init(){if(!loadState())return;renderForm();refreshAll();const btnRender=$('btnRender'); const btnSaveValidated=$('btnSaveValidated'); const btnSaveDivergence=$('btnSaveDivergence'); const btnPrint=$('btnPrint'); const btnClose=$('btnClose'); if(btnRender) btnRender.addEventListener('click',refreshAll); if(btnSaveValidated) btnSaveValidated.addEventListener('click',()=>save('VALIDADO_MANUALMENTE')); if(btnSaveDivergence) btnSaveDivergence.addEventListener('click',()=>save('COM_DIVERGENCIA')); if(btnPrint) btnPrint.addEventListener('click',()=>{refreshAll();window.print();}); if(btnClose) btnClose.addEventListener('click',()=>window.close());}
  document.addEventListener('DOMContentLoaded',init);
})();
