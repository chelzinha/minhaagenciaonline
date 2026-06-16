/* =====================================================
   Minhas Postagens — Importador NF-e PDF + prévia DANFE 10x15
   ===================================================== */
window.SfNfeImport = (function () {
  const $ = id => document.getElementById(id);
  const PREVIEW_STORAGE_KEY = 'agf_danfe_simplificado_preview_v2';

  function getUrl() { const cfg = (typeof SF_CLIENT_CONFIG !== 'undefined' && SF_CLIENT_CONFIG) || window.SF_CLIENT_CONFIG || {}; return cfg.NFE_WEBAPP_URL ? String(cfg.NFE_WEBAPP_URL).trim() : ''; }
  function getSessionToken() { try { return SfClientApi.getSessionToken ? SfClientApi.getSessionToken() : ''; } catch (e) { return ''; } }
  function number(v) { const n = Number(String(v || '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
  function escapeAttr(str) { return String(str == null ? '' : str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
  function setStatus(message, kind) { const el=$('sfNfeStatus'); if(!el)return; el.hidden=false; el.className='nfe-status '+(kind||'info'); el.textContent=message||''; }
  function readFileAsDataUrl(file) { return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result||'')); fr.onerror=()=>reject(new Error('Não foi possível ler o PDF selecionado.')); fr.readAsDataURL(file); }); }

  async function parseFile(file) {
    const url=getUrl();
    if(!url||url.indexOf('__COLE_AQUI')>=0) throw new Error('NFE_WEBAPP_URL não configurada em superfrete/js/config.js.');
    if(!file) throw new Error('Selecione um PDF da NF-e.');
    if(!/\.pdf$/i.test(file.name||'')) throw new Error('Envie somente arquivo PDF.');
    if(file.size>10*1024*1024) throw new Error('PDF muito grande. Use um DANFE menor, até 10 MB.');
    const dataUrl=await readFileAsDataUrl(file);
    const resp=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'parseNfePdf',portal:'superfrete',sessionAction:'sfClientDashboard',sessionToken:getSessionToken(),fileName:file.name,pdfBase64:dataUrl}),redirect:'follow'});
    let json; try{json=await resp.json();}catch(e){throw new Error('Extrator de NF-e retornou resposta inválida.');}
    if(!json||json.ok===false) throw new Error((json&&json.error)||'Erro ao importar NF-e.');
    return json.data||{};
  }

  function setValue(id,value,opts){const el=$(id);if(!el)return;el.value=value==null?'':String(value);if(!(opts&&opts.silent))el.dispatchEvent(new Event('input',{bubbles:true}));}
  function fillDest(p){setValue('qCep',p.destinatarioCep||'');setValue('qValorDeclarado',p.valorDeclaradoSugerido?number(p.valorDeclaradoSugerido):'');setValue('dNome',p.destinatarioNome||'',{silent:true});setValue('dDocumento',p.destinatarioCpfCnpj||'');setValue('dCep',p.destinatarioCep||'');setValue('dEndereco',p.destinatarioEndereco||'');setValue('dNumero',p.destinatarioNumero||'');setValue('dComplemento',p.destinatarioComplemento||'');setValue('dBairro',p.destinatarioBairro||'');setValue('dCidade',p.destinatarioCidade||'');setValue('dUf',p.destinatarioUf||'');}
  function addItemRowToBox(item){const box=$('itemsBox');if(!box)return;const row=document.createElement('div');row.className='mp-item-row';row.innerHTML='<div class="mp-item-grid"><label>Descrição<input class="item-desc" value="'+escapeAttr(item&&item.descricao||'')+'" placeholder="Produto" required /></label><label>Qtd<input class="item-qtd" type="number" min="1" step="1" value="'+escapeAttr(item&&item.quantidade||1)+'" required /></label><label>Valor unit. R$<input class="item-valor" type="number" min="0.01" step="0.01" value="'+escapeAttr(item&&(item.valor||item.valorUnitario||item.valor_unitario)||'')+'" required /></label><button class="mp-remove-item" type="button" title="Remover"><span class="material-symbols-rounded">delete</span></button></div>';row.querySelector('.mp-remove-item').addEventListener('click',()=>{if($('itemsBox').children.length<=1)return;row.remove();});box.appendChild(row);}
  function fillItems(itens){const box=$('itemsBox');if(!box)return;box.innerHTML='';const arr=(itens||[]).slice(0,80);if(!arr.length)arr.push({descricao:'',quantidade:1,valor:''});arr.forEach(addItemRowToBox);}
  function buildSummary(parsed){const p=parsed.appPayloadPatch||{};const qtd=(p.itensDeclaracao||[]).length;return (p.numeroNotaFiscal?'NF '+p.numeroNotaFiscal:'NF importada')+' · '+(p.destinatarioNome||'destinatário não identificado')+' · '+qtd+(qtd===1?' produto identificado':' produtos identificados');}
  function storePreviewState(parsed,file){try{localStorage.setItem(PREVIEW_STORAGE_KEY,JSON.stringify({portal:'superfrete',parsed:parsed,webAppUrl:getUrl(),sessionToken:getSessionToken(),sessionAction:'sfClientDashboard',fileName:(file&&file.name)||(parsed.source&&parsed.source.fileName)||'danfe.pdf',createdAt:new Date().toISOString()}));}catch(e){}}
  function showPreviewButton(){const btn=$('btnSfNfeDanfePreview');if(!btn)return;btn.hidden=false;if(!btn._danfeBound){btn._danfeBound=true;btn.addEventListener('click',()=>window.open('/danfe-simplificado/?portal=superfrete','_blank'));}}

  async function importPdf(){try{const fileEl=$('sfNfePdf');const file=fileEl&&fileEl.files&&fileEl.files[0];setStatus('Lendo PDF da NF-e...','loading');const parsed=await parseFile(file);const patch=parsed.appPayloadPatch||{};window.SF_CLIENT_NFE_IMPORT={parsed:parsed,patch:patch};fillDest(patch);fillItems(patch.itensDeclaracao||[]);storePreviewState(parsed,file);showPreviewButton();setStatus('NF-e importada com sucesso! Revise os dados preenchidos antes de gerar a etiqueta. '+buildSummary(parsed),'success');}catch(e){setStatus(e.message||String(e),'error');}}
  function attach(){const btn=$('btnImportNfePdf');if(!btn||btn._nfeBound)return;btn._nfeBound=true;btn.addEventListener('click',importPdf);}
  return{attach,getPatch:()=>window.SF_CLIENT_NFE_IMPORT&&window.SF_CLIENT_NFE_IMPORT.patch||null};
})();
